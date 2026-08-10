package brain

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The brain page says "semantic" or it warns. Getting that wrong in either
// direction is the failure this file exists to prevent: a false "semantic"
// tells an operator to trust a related-memories panel showing keyword overlap,
// and a false warning tells them to go fix an embedder that is working.

// A store built without an embedder must not claim semantic recall. The
// original check was `_, hashed := emb.(HashEmbedder); semantic = !hashed`, and
// a nil interface is not a HashEmbedder — so a brain with no embedder at all,
// every vector column NULL, reported semantic recall.
func TestNoEmbedderIsNotSemantic(t *testing.T) {
	if IsSemantic(nil) {
		t.Error("a brain with no embedder claims semantic recall")
	}
	s := &Store{}
	if s.Semantic() {
		t.Error("a store with no embedder claims semantic recall")
	}
	if got := s.EmbedderName(); got != "none" {
		t.Errorf("EmbedderName() = %q, want \"none\"", got)
	}
}

// The honest default. Recall over a hashed bag of words is keyword overlap.
func TestTheHashEmbedderIsNotSemantic(t *testing.T) {
	if IsSemantic(HashEmbedder{}) {
		t.Error("the hash embedder claims semantic recall")
	}
}

// A working endpoint is the one case that should say yes.
func TestALiveHTTPEmbedderIsSemantic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":[{"index":0,"embedding":[1,2,3]}]}`))
	}))
	defer srv.Close()
	e := &httpEmbedder{url: srv.URL, model: "m", dim: 3, client: srv.Client()}

	if err := e.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !IsSemantic(e) {
		t.Error("a live embedding endpoint is not reported as semantic")
	}
}

// The third case, and the one the old check could not see at all: an endpoint
// that was configured, probed fine at boot, and has since stopped answering.
// The vectors already in the table are real; the ones being written now are
// NULL, and every recall from here on has no vector arm. That is not semantic
// recall and the page must stop saying it is.
func TestAnEmbedderWhoseEndpointDiedStopsBeingSemantic(t *testing.T) {
	down := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if down {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Write([]byte(`{"data":[{"index":0,"embedding":[1,2,3]}]}`))
	}))
	defer srv.Close()
	e := &httpEmbedder{url: srv.URL, model: "m", dim: 3, client: srv.Client()}

	if err := e.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !IsSemantic(e) {
		t.Fatal("not semantic while the endpoint was up")
	}

	down = true
	for i := 0; i < unhealthyAfter; i++ {
		e.Embed(context.Background(), []string{"x"})
	}
	if IsSemantic(e) {
		t.Errorf("still reporting semantic recall after %d consecutive failures", unhealthyAfter)
	}

	// And it comes back when the endpoint does. A latch that never resets would
	// need a restart to clear, which is how a warning becomes permanent
	// furniture nobody reads.
	down = false
	if _, err := e.Embed(context.Background(), []string{"x"}); err != nil {
		t.Fatal(err)
	}
	if !IsSemantic(e) {
		t.Error("still unhealthy after the endpoint recovered")
	}
}

// The boot check. A configured-but-unreachable endpoint must be discovered
// here, not on the first memory somebody tried to retain.
func TestProbeFailsOnAnUnreachableEndpoint(t *testing.T) {
	e := &httpEmbedder{
		// Reserved for documentation (RFC 5737) and routed nowhere.
		url: "http://192.0.2.1:1/v1/embeddings", model: "m", dim: 3,
		client: &http.Client{Timeout: 300_000_000},
	}
	if err := Probe(context.Background(), e); err == nil {
		t.Fatal("probing an unreachable endpoint succeeded")
	}
	if IsSemantic(HashEmbedder{}) {
		t.Error("the fallback claims semantic recall")
	}
}

// The hash embedder has no probe and needs none — Probe must be a no-op for it,
// or the offline default would fail to boot.
func TestProbingTheHashEmbedderIsANoOp(t *testing.T) {
	if err := Probe(context.Background(), HashEmbedder{}); err != nil {
		t.Errorf("probing the hash embedder failed: %v", err)
	}
}

// A bare service name is the deployment form of BUILDER_EMBED_URL.
func TestABareOriginBecomesTheEmbeddingsEndpoint(t *testing.T) {
	t.Setenv("BUILDER_EMBED_URL", "http://tei-embed:80")
	t.Setenv("BUILDER_EMBED_DIM", "")
	e := EmbedderFromEnv()
	if e == nil {
		t.Fatal("no embedder from a bare origin")
	}
	if got := e.(*httpEmbedder).url; got != "http://tei-embed:80/v1/embeddings" {
		t.Errorf("url = %q, want /v1/embeddings appended", got)
	}
	// And the default model must be one that fits the column, or New() rejects
	// every operator who set only the URL.
	if e.Dimensions() != Dim {
		t.Errorf("default width = %d, the schema stores %d", e.Dimensions(), Dim)
	}
}
