package brain

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// No live endpoint is contacted. Everything worth testing here is the handling
// of what a real one sends back — including the shapes that would corrupt the
// brain silently rather than failing loudly.

func fakeEmbedder(t *testing.T, h http.HandlerFunc) (*httpEmbedder, func()) {
	t.Helper()
	srv := httptest.NewServer(h)
	return &httpEmbedder{url: srv.URL, model: "test-model", dim: 3, client: srv.Client()}, srv.Close
}

func vec(n int, v float32) []float32 {
	out := make([]float32, n)
	for i := range out {
		out[i] = v
	}
	return out
}

// The endpoint is allowed to answer out of order. Trusting arrival order would
// pair every chunk with its neighbour's vector — a corruption that never
// errors, only makes recall quietly wrong.
func TestVectorsAreOrderedByTheirIndexNotByArrival(t *testing.T) {
	e, done := fakeEmbedder(t, func(w http.ResponseWriter, r *http.Request) {
		var in embedReq
		json.NewDecoder(r.Body).Decode(&in)
		if len(in.Input) != 3 {
			t.Errorf("sent %d inputs, want 3", len(in.Input))
		}
		// Deliberately reversed.
		json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{
			{"index": 2, "embedding": vec(3, 2)},
			{"index": 0, "embedding": vec(3, 0)},
			{"index": 1, "embedding": vec(3, 1)},
		}})
	})
	defer done()

	got, err := e.Embed(context.Background(), []string{"a", "b", "c"})
	if err != nil {
		t.Fatal(err)
	}
	for i := range got {
		if got[i][0] != float32(i) {
			t.Errorf("vector %d = %v, want all %d — results were taken in arrival order", i, got[i], i)
		}
	}
}

// A short response must fail rather than return a partial slice. Fewer vectors
// than inputs means the pairing is already wrong.
func TestAShortResponseIsAnError(t *testing.T) {
	e, done := fakeEmbedder(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{
			{"index": 0, "embedding": vec(3, 1)},
		}})
	})
	defer done()

	if _, err := e.Embed(context.Background(), []string{"a", "b"}); err == nil {
		t.Fatal("two inputs and one vector was accepted")
	}
}

// The wrong model is the likeliest misconfiguration, and pgvector reports it as
// a cast error naming neither the model nor the expectation.
func TestAWidthMismatchNamesTheModelAndBothWidths(t *testing.T) {
	e, done := fakeEmbedder(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{
			{"index": 0, "embedding": vec(768, 1)},
		}})
	})
	defer done()

	_, err := e.Embed(context.Background(), []string{"a"})
	if err == nil {
		t.Fatal("a 768-wide vector was accepted into a 3-wide column")
	}
	for _, want := range []string{"test-model", "768", "3"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should name %q, got: %v", want, err)
		}
	}
}

// An endpoint that is not an embeddings endpoint at all — a login page, a proxy
// error — must say what it returned rather than "invalid character '<'".
func TestANonJSONResponseIsReadable(t *testing.T) {
	e, done := fakeEmbedder(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("<html><body>Sign in to continue</body></html>"))
	})
	defer done()

	_, err := e.Embed(context.Background(), []string{"a"})
	if err == nil || !strings.Contains(err.Error(), "Sign in") {
		t.Fatalf("error should quote what came back, got: %v", err)
	}
}

// A batch larger than one request must still come back in order, end to end.
func TestLargeInputsAreBatchedAndStayInOrder(t *testing.T) {
	const n = maxEmbedBatch + 7
	calls := 0
	e, done := fakeEmbedder(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var in embedReq
		json.NewDecoder(r.Body).Decode(&in)
		data := make([]map[string]any, len(in.Input))
		for i, s := range in.Input {
			// Echo the input's own number back, so misordering is detectable.
			data[i] = map[string]any{"index": i, "embedding": vec(3, float32(len(s)))}
		}
		json.NewEncoder(w).Encode(map[string]any{"data": data})
	})
	defer done()

	texts := make([]string, n)
	for i := range texts {
		texts[i] = strings.Repeat("x", i+1)
	}
	got, err := e.Embed(context.Background(), texts)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != n {
		t.Fatalf("got %d vectors for %d inputs", len(got), n)
	}
	if calls != 2 {
		t.Errorf("made %d requests, want 2 — the batch cap is not being applied", calls)
	}
	for i := range got {
		if got[i][0] != float32(i+1) {
			t.Fatalf("vector %d carries %v — batches were reassembled out of order", i, got[i][0])
		}
	}
}

// Unset means unset. A fallback that silently produced the hash embedder here
// would make a typo in the URL indistinguishable from working semantic recall.
func TestNoURLMeansNoEmbedder(t *testing.T) {
	t.Setenv("BUILDER_EMBED_URL", "")
	if e := EmbedderFromEnv(); e != nil {
		t.Fatalf("got %s with no URL configured", e.Name())
	}
}

func TestEnvConfiguresTheEndpoint(t *testing.T) {
	t.Setenv("BUILDER_EMBED_URL", "http://localhost:11434/v1/embeddings")
	t.Setenv("BUILDER_EMBED_MODEL", "nomic-embed-text:v1.5")
	t.Setenv("BUILDER_EMBED_DIM", "768")
	e := EmbedderFromEnv()
	if e == nil {
		t.Fatal("a configured URL produced no embedder")
	}
	if e.Dimensions() != 768 {
		t.Errorf("dim = %d, want 768", e.Dimensions())
	}
	if !strings.Contains(e.Name(), "nomic-embed-text") {
		t.Errorf("name = %q, should name the model", e.Name())
	}
}
