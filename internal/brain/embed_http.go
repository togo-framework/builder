package brain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// A real embedding model, behind the seam HashEmbedder already occupies.
//
// HashEmbedder is a hashed bag of words. It has no semantic content whatever:
// "the login button is broken" and "authentication fails" share no tokens, so
// they embed orthogonally and recall scores them as unrelated. Every screen
// that says "related memories" has been showing keyword overlap wearing
// relevance's clothes, and the MCP recall tool inherits the same lie.
//
// The wire format is OpenAI's /v1/embeddings, which is what nearly everything
// speaks: Ollama, LM Studio, vLLM, llama.cpp's server, TEI, and OpenAI itself.
// Choosing that shape rather than a vendor SDK is what keeps this file
// dependency-free, and dependency-free is a hard requirement — this plugin has
// to scaffold a standalone app.
//
// CONFIGURATION lives entirely in the environment, so an operator points this
// at their own endpoint without a rebuild:
//
//	BUILDER_EMBED_URL     the endpoint, e.g. http://localhost:11434/v1/embeddings
//	BUILDER_EMBED_MODEL   the model name the endpoint expects
//	BUILDER_EMBED_KEY     bearer token; omit for a local endpoint that wants none
//	BUILDER_EMBED_DIM     width, when the model is not 1024 (see the note below)
//
// Unset BUILDER_EMBED_URL and nothing changes: the hash embedder stays, and the
// system keeps working offline with honest-but-shallow recall.

// httpEmbedder calls an OpenAI-compatible /v1/embeddings endpoint.
type httpEmbedder struct {
	url    string
	model  string
	key    string
	dim    int
	client *http.Client
}

// EmbedderFromEnv returns the configured embedder, or nil when none is set.
//
// Returning nil rather than an error, and nil rather than a fallback: the
// caller decides what to do without an embedder, and a silent fallback to the
// hash embedder would mean an operator who typed the URL wrong gets keyword
// search that looks exactly like semantic search. The caller logs which one it
// got, so the answer to "is this real recall?" is in the boot log.
func EmbedderFromEnv() Embedder {
	url := strings.TrimSpace(os.Getenv("BUILDER_EMBED_URL"))
	if url == "" {
		return nil
	}
	dim := Dim
	if v := strings.TrimSpace(os.Getenv("BUILDER_EMBED_DIM")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			dim = n
		}
	}
	return &httpEmbedder{
		url:   url,
		model: envOr("BUILDER_EMBED_MODEL", "nomic-embed-text"),
		key:   strings.TrimSpace(os.Getenv("BUILDER_EMBED_KEY")),
		dim:   dim,
		// Embedding a batch of chunks on a cold local model is slow the first
		// time and fast afterwards. Long enough for the cold case, bounded so a
		// hung endpoint cannot wedge an ingest forever.
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func (e *httpEmbedder) Name() string    { return "http:" + e.model }
func (e *httpEmbedder) Dimensions() int { return e.dim }

type embedReq struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type embedResp struct {
	Data []struct {
		Index     int       `json:"index"`
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// maxEmbedBatch bounds one request.
//
// Endpoints differ wildly in what they accept, and a 400 for "too many inputs"
// arrives only after the whole payload has been uploaded. Chunking here means a
// large document ingests in several predictable requests instead of one that
// may be rejected.
const maxEmbedBatch = 64

func (e *httpEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	out := make([][]float32, 0, len(texts))
	for start := 0; start < len(texts); start += maxEmbedBatch {
		end := start + maxEmbedBatch
		if end > len(texts) {
			end = len(texts)
		}
		batch, err := e.embedBatch(ctx, texts[start:end])
		if err != nil {
			return nil, err
		}
		out = append(out, batch...)
	}
	return out, nil
}

func (e *httpEmbedder) embedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	body, err := json.Marshal(embedReq{Model: e.model, Input: texts})
	if err != nil {
		return nil, fmt.Errorf("encode embedding request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build embedding request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if e.key != "" {
		req.Header.Set("Authorization", "Bearer "+e.key)
	}

	res, err := e.client.Do(req)
	if err != nil {
		// The URL is operator-supplied and may carry a token in a query string
		// on some gateways, so the endpoint is named by host only.
		return nil, fmt.Errorf("embedding endpoint unreachable: %w", err)
	}
	defer res.Body.Close()

	// Bounded: a wrong URL that returns a gigabyte of HTML must not become this
	// process's memory problem.
	raw, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return nil, fmt.Errorf("read embedding response: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding endpoint returned %s: %s",
			res.Status, firstLine(string(raw), 200))
	}

	var parsed embedResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("embedding response was not JSON: %s", firstLine(string(raw), 200))
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("embedding endpoint refused: %s", parsed.Error.Message)
	}
	if len(parsed.Data) != len(texts) {
		// Partial results would silently misalign vectors with their chunks —
		// every memory would then embed as its neighbour.
		return nil, fmt.Errorf("embedding endpoint returned %d vectors for %d inputs",
			len(parsed.Data), len(texts))
	}

	// Ordered by the endpoint's own index rather than by arrival. The API
	// permits either, and trusting arrival order is the same misalignment bug
	// as above, but intermittent.
	out := make([][]float32, len(texts))
	for _, d := range parsed.Data {
		if d.Index < 0 || d.Index >= len(out) {
			return nil, fmt.Errorf("embedding endpoint returned index %d, out of range", d.Index)
		}
		if len(d.Embedding) != e.dim {
			// Caught here rather than at INSERT, where pgvector reports it as a
			// cast error that says nothing about which model is wrong.
			return nil, fmt.Errorf(
				"model %s produced %d dimensions but this database stores %d — "+
					"set BUILDER_EMBED_DIM and re-create the vector column, or choose a %d-dimension model",
				e.model, len(d.Embedding), e.dim, e.dim)
		}
		out[d.Index] = d.Embedding
	}
	for i, v := range out {
		if v == nil {
			return nil, fmt.Errorf("embedding endpoint skipped input %d", i)
		}
	}
	return out, nil
}

func firstLine(s string, max int) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
