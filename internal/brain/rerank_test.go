package brain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// No live endpoint is contacted. What is worth testing here is the handling of
// what a real reranker sends back — including the two incompatible wire shapes
// in circulation, either of which silently disables reranking if misparsed.

func fakeReranker(t *testing.T, h http.HandlerFunc) (*httpReranker, func()) {
	t.Helper()
	srv := httptest.NewServer(h)
	return &httpReranker{url: srv.URL, client: srv.Client()}, srv.Close
}

// The native cross-encoder shape: a bare array, best first.
func TestABareArrayResponseIsRead(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte(`[{"index":1,"score":0.997},{"index":0,"score":0.0000163}]`))
	})
	defer done()

	hits, err := r.Rerank(context.Background(), "what is togo", []string{"Bananas are yellow", "ToGO is a Go+React framework"})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("got %d hits, want 2", len(hits))
	}
	if hits[0].Index != 1 {
		t.Errorf("best hit is index %d, want 1 — the framework sentence answers the query", hits[0].Index)
	}
}

// The Cohere-compatible shape, with the score under a different key. Parsing
// only one of the two shapes means half the reranker servers in the world
// disable reranking without ever erroring.
func TestAResultsObjectWithRelevanceScoreIsRead(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte(`{"results":[{"index":0,"relevance_score":0.4},{"index":1,"relevance_score":0.9}]}`))
	})
	defer done()

	hits, err := r.Rerank(context.Background(), "q", []string{"a", "b"})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 || hits[0].Index != 1 {
		t.Fatalf("got %+v, want index 1 first", hits)
	}
	if hits[0].Score != 0.9 {
		t.Errorf("score = %v, want 0.9 — relevance_score was not read", hits[0].Score)
	}
}

// An endpoint that returns its results unsorted must not invert recall. Nothing
// in either wire format promises an order.
func TestAnUnsortedResponseIsSorted(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte(`[{"index":0,"score":0.1},{"index":1,"score":0.8},{"index":2,"score":0.5}]`))
	})
	defer done()

	hits, err := r.Rerank(context.Background(), "q", []string{"a", "b", "c"})
	if err != nil {
		t.Fatal(err)
	}
	want := []int{1, 2, 0}
	for i, h := range hits {
		if h.Index != want[i] {
			t.Fatalf("hits = %+v, want indexes %v", hits, want)
		}
	}
}

// A duplicated index would double-count one candidate and drop another, showing
// up as a memory that is simply missing with nothing to explain it.
func TestADuplicateIndexIsRejected(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte(`[{"index":0,"score":0.9},{"index":0,"score":0.8}]`))
	})
	defer done()

	if _, err := r.Rerank(context.Background(), "q", []string{"a", "b"}); err == nil {
		t.Fatal("the same index twice was accepted")
	}
}

func TestAnOutOfRangeIndexIsRejected(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte(`[{"index":7,"score":0.9}]`))
	})
	defer done()

	if _, err := r.Rerank(context.Background(), "q", []string{"a"}); err == nil {
		t.Fatal("index 7 into a 1-element list was accepted")
	}
}

// A server that validates its request body strictly rejects the optional fields
// outright. One retry without them is the difference between "this endpoint
// speaks a slightly different dialect" and "reranking is broken".
func TestOptionalFieldsAreDroppedAfterA4xx(t *testing.T) {
	var bodies []rerankReq
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		var in rerankReq
		json.NewDecoder(req.Body).Decode(&in)
		bodies = append(bodies, in)
		if in.Truncate {
			w.WriteHeader(http.StatusUnprocessableEntity)
			w.Write([]byte(`{"error":{"message":"unknown field truncate"}}`))
			return
		}
		w.Write([]byte(`[{"index":0,"score":0.9}]`))
	})
	defer done()

	if _, err := r.Rerank(context.Background(), "q", []string{"a"}); err != nil {
		t.Fatalf("the retry without optional fields did not happen: %v", err)
	}
	if len(bodies) != 2 {
		t.Fatalf("made %d requests, want 2 (one rejected, one retried)", len(bodies))
	}
	// And it must be remembered, or every recall pays for the discovery again.
	if _, err := r.Rerank(context.Background(), "q", []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 3 {
		t.Errorf("made %d requests in total, want 3 — the dialect was not remembered", len(bodies))
	}
}

// A 5xx is an outage, not a dialect difference. Retrying it without the optional
// fields would blame the request for a server problem and double the load.
func TestA5xxIsNotRetried(t *testing.T) {
	calls := 0
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadGateway)
	})
	defer done()

	if _, err := r.Rerank(context.Background(), "q", []string{"a"}); err == nil {
		t.Fatal("a 502 was treated as success")
	}
	if calls != 1 {
		t.Errorf("made %d requests, want 1", calls)
	}
}

// An endpoint returning HTML — a login page, a proxy error — must say what came
// back rather than "invalid character '<'".
func TestANonJSONRerankResponseIsReadable(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte("<html>Sign in to continue</html>"))
	})
	defer done()

	_, err := r.Rerank(context.Background(), "q", []string{"a"})
	if err == nil || !strings.Contains(err.Error(), "Sign in") {
		t.Fatalf("error should quote what came back, got: %v", err)
	}
}

// Repeated failure must be visible, so a page can stop claiming a capability
// that has stopped working.
func TestRepeatedFailureMarksTheRerankerUnhealthy(t *testing.T) {
	r, done := fakeReranker(t, func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})
	defer done()

	if !r.Healthy() {
		t.Fatal("unhealthy before any call")
	}
	for i := 0; i < unhealthyAfter; i++ {
		r.Rerank(context.Background(), "q", []string{"a"})
	}
	if r.Healthy() {
		t.Errorf("still healthy after %d consecutive failures", unhealthyAfter)
	}
}

// The reference deployment serves both models behind one gateway, so an
// operator who configured embeddings has configured reranking too.
func TestTheRerankURLIsDerivedFromTheEmbedURL(t *testing.T) {
	t.Setenv("BUILDER_RERANK_URL", "")
	t.Setenv("BUILDER_RERANK_OFF", "")
	rr := RerankerFromEnv("https://think.example.com/v1/embeddings")
	if rr == nil {
		t.Fatal("no reranker derived from a configured embed URL")
	}
	got := rr.(*httpReranker).url
	if got != "https://think.example.com/rerank" {
		t.Errorf("derived %q, want https://think.example.com/rerank", got)
	}
}

// In-cluster the two models are separate services, so the derived URL is wrong
// and the explicit one has to win.
func TestAnExplicitRerankURLWins(t *testing.T) {
	t.Setenv("BUILDER_RERANK_URL", "http://tei-rerank:80/rerank")
	t.Setenv("BUILDER_RERANK_OFF", "")
	rr := RerankerFromEnv("http://tei-embed:80/v1/embeddings")
	if rr == nil {
		t.Fatal("no reranker from an explicit URL")
	}
	if got := rr.(*httpReranker).url; got != "http://tei-rerank:80/rerank" {
		t.Errorf("url = %q, want the explicit one", got)
	}
}

// A bare service name is the deployment form of this setting.
func TestABareOriginGetsTheWellKnownPath(t *testing.T) {
	t.Setenv("BUILDER_RERANK_URL", "http://tei-rerank:80")
	t.Setenv("BUILDER_RERANK_OFF", "")
	rr := RerankerFromEnv("")
	if got := rr.(*httpReranker).url; got != "http://tei-rerank:80/rerank" {
		t.Errorf("url = %q, want /rerank appended", got)
	}
}

func TestRerankCanBeTurnedOff(t *testing.T) {
	t.Setenv("BUILDER_RERANK_OFF", "true")
	if rr := RerankerFromEnv("https://think.example.com/v1/embeddings"); rr != nil {
		t.Fatal("reranking is on despite BUILDER_RERANK_OFF")
	}
}

// Fetching fewer candidates than the caller asked for would return fewer
// results with reranking on than without it.
func TestCandidatesNeverDropBelowTheLimit(t *testing.T) {
	t.Setenv("BUILDER_RERANK_CANDIDATES", "3")
	if got := Candidates(10); got != 10 {
		t.Errorf("Candidates(10) = %d with a cap of 3, want 10", got)
	}
	t.Setenv("BUILDER_RERANK_CANDIDATES", "99999")
	if got := Candidates(10); got != MaxCandidates {
		t.Errorf("Candidates(10) = %d, want it clamped to %d", got, MaxCandidates)
	}
}
