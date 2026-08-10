package brain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Reranking: the second pass that decides what recall actually returns.
//
// Retrieval and ranking are different problems and a bi-encoder is only good at
// the first. Embedding compresses a whole chunk into one vector before it has
// seen the query, so "does this passage answer THIS question?" is a judgement
// it structurally cannot make — it can only measure how close two summaries
// landed. That is enough to pull fifty plausible rows out of ten thousand and
// not enough to pick the three worth putting in a prompt.
//
// A cross-encoder reads the query and the passage together and scores the pair.
// It cannot be indexed — there is no vector to store, every pair costs a
// forward pass — which is exactly why it belongs here and not in the SQL: over
// fifty candidates it is one request, and over the whole table it would be
// impossible.
//
// So recall is: vector + full-text fetch a wide candidate set, the cross-encoder
// orders it, and the top few are returned. The quality gain lands in the second
// step; the first only has to not lose the right row.
//
//	BUILDER_RERANK_URL         the endpoint. Derived from BUILDER_EMBED_URL's
//	                           origin when unset, because the usual deployment
//	                           serves both behind one gateway.
//	BUILDER_RERANK_MODEL       model name, for endpoints that want one; most
//	                           reranker servers host exactly one and ignore it.
//	BUILDER_RERANK_KEY         bearer token; falls back to BUILDER_EMBED_KEY.
//	BUILDER_RERANK_CANDIDATES  how many rows to rank before returning `limit`.
//	BUILDER_RERANK_OFF         set to disable reranking with an embedder still on.

// RerankHit is one scored candidate, referring to the input by index.
type RerankHit struct {
	Index int     `json:"index"`
	Score float64 `json:"score"`
}

// Reranker orders candidate texts against a query. A separate seam from
// Embedder because the two are independently available: an operator can have a
// working embedder and no reranker, and recall must still be better than it was.
type Reranker interface {
	Rerank(ctx context.Context, query string, texts []string) ([]RerankHit, error)
	Name() string
}

// DefaultCandidates is how many rows the hybrid search hands to the reranker.
//
// Fifty because it is what the two arms of the fused query already fetch, so
// the default costs one extra HTTP call and no extra database work. Recall@50
// on a bi-encoder is high enough that the right row is nearly always inside it;
// raising this buys accuracy at a linear cost in reranker time, and lowering it
// below `limit` would silently truncate results, which is why it is clamped.
const DefaultCandidates = 50

// MaxCandidates bounds it. A cross-encoder is a forward pass per candidate, so
// an operator who sets 5000 has configured a timeout, not a search.
const MaxCandidates = 200

type httpReranker struct {
	url    string
	model  string
	key    string
	client *http.Client

	mu    sync.Mutex
	fails int
	// plain drops the optional request fields after the endpoint has rejected
	// them once. See rerankBatch.
	plain bool
}

// RerankerFromEnv returns the configured reranker, or nil.
//
// embedURL is where the default comes from: the reference deployment puts the
// embedding and reranking models behind one host, so an operator who has
// configured embeddings has almost certainly got reranking at /rerank on the
// same origin. Derived rather than assumed silently — the caller logs the URL
// it ended up with, and a derived URL that 404s disables reranking with a
// warning rather than failing recall.
func RerankerFromEnv(embedURL string) Reranker {
	if truthy(os.Getenv("BUILDER_RERANK_OFF")) {
		return nil
	}
	raw := strings.TrimSpace(os.Getenv("BUILDER_RERANK_URL"))
	if raw == "" && embedURL != "" {
		raw = originOf(embedURL)
	}
	endpoint := endpointURL(raw, "/rerank")
	if endpoint == "" {
		return nil
	}
	key := strings.TrimSpace(os.Getenv("BUILDER_RERANK_KEY"))
	if key == "" {
		key = strings.TrimSpace(os.Getenv("BUILDER_EMBED_KEY"))
	}
	return &httpReranker{
		url:   endpoint,
		model: strings.TrimSpace(os.Getenv("BUILDER_RERANK_MODEL")),
		key:   key,
		// Shorter than the embedder's 60s. Reranking sits in the request path of
		// a person waiting for an answer, and a recall that takes a minute has
		// already failed even if it eventually returns.
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Candidates is how many rows to fetch before reranking, clamped to something
// that can be served. Never below `limit`, or recall would return fewer results
// with the reranker on than without it.
func Candidates(limit int) int {
	n := DefaultCandidates
	if v := strings.TrimSpace(os.Getenv("BUILDER_RERANK_CANDIDATES")); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			n = parsed
		}
	}
	if n > MaxCandidates {
		n = MaxCandidates
	}
	if n < limit {
		n = limit
	}
	return n
}

func (r *httpReranker) Name() string {
	if r.model != "" {
		return "http:" + r.model
	}
	return "http:rerank"
}

// Healthy mirrors the embedder's. A reranker that has stopped answering is not
// an outage — recall degrades to the fused order — but it is worth surfacing.
func (r *httpReranker) Healthy() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.fails < unhealthyAfter
}

func (r *httpReranker) record(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err == nil {
		r.fails = 0
		return
	}
	r.fails++
}

type rerankReq struct {
	Query string   `json:"query"`
	Texts []string `json:"texts"`
	// Optional, and omitted entirely when unset: a server that hosts one model
	// and validates its request body rejects a null or empty `model`.
	Model string `json:"model,omitempty"`
	// Passages here are chunks and a query is a sentence, but a chunk can still
	// exceed the model's window — and without this the whole batch fails with a
	// validation error instead of the long passage being clipped. Dropped on the
	// retry below for endpoints that do not know the field.
	Truncate bool `json:"truncate,omitempty"`
}

// rerankResp accepts both shapes in the wild.
//
// The native cross-encoder servers (TEI, and everything that copied it) return
// a bare array ordered best-first. The Cohere-compatible ones return
// {"results": [{"index", "relevance_score"}]}. Parsing both means the same
// binary works against either without the operator learning which they have —
// and getting this wrong is silent, since a failed parse looks exactly like a
// reranker that had no opinion.
type rerankResp struct {
	Results []rerankItem `json:"results"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type rerankItem struct {
	Index int `json:"index"`
	// Two spellings of one number. Both are pointers so a legitimate 0.0 is
	// distinguishable from a field that was not sent.
	Score     *float64 `json:"score"`
	Relevance *float64 `json:"relevance_score"`
}

func (i rerankItem) score() float64 {
	if i.Score != nil {
		return *i.Score
	}
	if i.Relevance != nil {
		return *i.Relevance
	}
	return 0
}

// maxRerankBatch bounds one request, as the embedder does. Candidates are
// already capped by MaxCandidates, so this only fires for a caller that reranks
// something other than a recall result.
const maxRerankBatch = 128

func (r *httpReranker) Rerank(ctx context.Context, query string, texts []string) ([]RerankHit, error) {
	query = strings.TrimSpace(query)
	if query == "" || len(texts) == 0 {
		return nil, nil
	}
	if len(texts) <= maxRerankBatch {
		hits, err := r.rerankBatch(ctx, query, texts)
		r.record(err)
		return hits, err
	}

	// Split, score, and merge on the score. Scores from a cross-encoder are
	// absolute — a query/passage pair gets the same number whatever else was in
	// the request — so batches are directly comparable, which is not true of the
	// rank-based fusion upstream.
	out := make([]RerankHit, 0, len(texts))
	for start := 0; start < len(texts); start += maxRerankBatch {
		end := start + maxRerankBatch
		if end > len(texts) {
			end = len(texts)
		}
		hits, err := r.rerankBatch(ctx, query, texts[start:end])
		r.record(err)
		if err != nil {
			return nil, err
		}
		for _, h := range hits {
			h.Index += start
			out = append(out, h)
		}
	}
	sortHits(out)
	return out, nil
}

func (r *httpReranker) rerankBatch(ctx context.Context, query string, texts []string) ([]RerankHit, error) {
	r.mu.Lock()
	plain := r.plain
	r.mu.Unlock()

	hits, status, err := r.post(ctx, query, texts, plain)
	// One retry with the optional fields dropped, and only for a 4xx: a server
	// that validates its request body strictly rejects `truncate` or `model`
	// outright, and the difference between "this endpoint speaks a slightly
	// different dialect" and "reranking is broken" is worth one extra request
	// exactly once. The result is remembered so it is not paid again.
	if err != nil && !plain && status >= 400 && status < 500 {
		hits, _, err = r.post(ctx, query, texts, true)
		if err == nil {
			r.mu.Lock()
			r.plain = true
			r.mu.Unlock()
		}
	}
	return hits, err
}

func (r *httpReranker) post(ctx context.Context, query string, texts []string, plain bool) ([]RerankHit, int, error) {
	payload := rerankReq{Query: query, Texts: texts}
	if !plain {
		payload.Model = r.model
		payload.Truncate = true
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("encode rerank request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("build rerank request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if r.key != "" {
		req.Header.Set("Authorization", "Bearer "+r.key)
	}

	res, err := r.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("rerank endpoint unreachable: %w", err)
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, res.StatusCode, fmt.Errorf("read rerank response: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		return nil, res.StatusCode, fmt.Errorf("rerank endpoint returned %s: %s",
			res.Status, firstLine(string(raw), 200))
	}

	items, err := parseRerank(raw)
	if err != nil {
		return nil, res.StatusCode, err
	}

	out := make([]RerankHit, 0, len(items))
	seen := make(map[int]bool, len(items))
	for _, it := range items {
		if it.Index < 0 || it.Index >= len(texts) {
			return nil, res.StatusCode, fmt.Errorf("rerank endpoint returned index %d, out of range", it.Index)
		}
		if seen[it.Index] {
			// A duplicated index would double-count one candidate and drop
			// another. Caught rather than tolerated, because the symptom is a
			// missing memory that nobody can explain.
			return nil, res.StatusCode, fmt.Errorf("rerank endpoint returned index %d twice", it.Index)
		}
		seen[it.Index] = true
		out = append(out, RerankHit{Index: it.Index, Score: it.score()})
	}
	// Best first regardless of what the endpoint promised. Most return sorted;
	// depending on it means an endpoint that does not silently inverts recall.
	sortHits(out)
	return out, res.StatusCode, nil
}

// parseRerank reads either wire shape.
func parseRerank(raw []byte) ([]rerankItem, error) {
	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) > 0 && trimmed[0] == '[' {
		var arr []rerankItem
		if err := json.Unmarshal(trimmed, &arr); err != nil {
			return nil, fmt.Errorf("rerank response was not a scored list: %s", firstLine(string(raw), 200))
		}
		return arr, nil
	}
	var obj rerankResp
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("rerank response was not JSON: %s", firstLine(string(raw), 200))
	}
	if obj.Error != nil {
		return nil, fmt.Errorf("rerank endpoint refused: %s", obj.Error.Message)
	}
	if obj.Results == nil {
		return nil, fmt.Errorf("rerank response carried no results: %s", firstLine(string(raw), 200))
	}
	return obj.Results, nil
}

// sortHits orders best-first, stable on ties so equal scores keep the order the
// fused query gave them — which is the more relevant of two equally-scored rows
// often enough to be worth not scrambling.
func sortHits(hits []RerankHit) {
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].Score > hits[j-1].Score; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
}

// originOf strips the path from a URL, so /v1/embeddings on a gateway yields the
// gateway.
func originOf(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.Scheme == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func truthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
