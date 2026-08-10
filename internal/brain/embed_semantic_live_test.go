package brain

import (
	"context"
	"os"
	"strings"
	"testing"
)

// The claim this whole change rests on, tested against a real model.
//
// Needs both a _test Postgres (TEST_DATABASE_URL) and a live embedding endpoint
// (BUILDER_EMBED_URL); skipped without them, because a test that quietly passes
// with the hash embedder would assert nothing at all.
//
//	BUILDER_EMBED_URL=https://think.fadymondy.com/v1/embeddings \
//	TEST_DATABASE_URL=postgres://localhost:5432/builder_test?sslmode=disable \
//	  go test ./internal/brain -run Semantic -v

func liveEmbedder(t *testing.T) Embedder {
	t.Helper()
	if os.Getenv("BUILDER_EMBED_URL") == "" {
		t.Skip("BUILDER_EMBED_URL not set")
	}
	e := EmbedderFromEnv()
	if e == nil {
		t.Fatal("BUILDER_EMBED_URL is set but produced no embedder")
	}
	if err := Probe(context.Background(), e); err != nil {
		t.Skipf("embedding endpoint not answering: %v", err)
	}
	return e
}

// The model has to be the width the column is, or nothing else matters.
func TestSemanticEmbedderMatchesTheSchemaWidth(t *testing.T) {
	e := liveEmbedder(t)
	vs, err := e.Embed(context.Background(), []string{"hello", "مرحبا بالعالم"})
	if err != nil {
		t.Fatal(err)
	}
	if len(vs) != 2 {
		t.Fatalf("got %d vectors for 2 inputs", len(vs))
	}
	for i, v := range vs {
		if len(v) != Dim {
			t.Fatalf("vector %d is %d wide, the schema stores %d", i, len(v), Dim)
		}
	}
	t.Logf("%s produced %d-dimension vectors for both English and Arabic", e.Name(), len(vs[0]))
}

// The failure the hash embedder cannot fix, stated as the docs state it: "the
// login button is broken" and "authentication fails" share no tokens, so a
// hashed bag of words embeds them orthogonally and full text cannot connect
// them either. A real model has to.
func TestSemanticRecallFindsAParaphraseWithNoSharedWords(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	emb := liveEmbedder(t)

	const (
		target   = "the login button is broken"
		distract = "the deploy pipeline runs on every push to main"
		query    = "authentication fails"
	)

	// First the honest baseline: the hash embedder, which is what the brain has
	// been running on.
	hash, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := hash.Retain(ctx, "proj:api-dev", target, "note", "target", 0.5); err != nil {
		t.Fatal(err)
	}
	if _, err := hash.Retain(ctx, "proj:api-dev", distract, "note", "distract", 0.5); err != nil {
		t.Fatal(err)
	}
	before, err := hash.Recall(ctx, "api-dev", query, 5)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("hash-bow recall for %q returned %d memories", query, len(before))
	for _, m := range before {
		t.Logf("  hash-bow: %q", m.Content)
	}

	// Now the same corpus, re-embedded by the real model. Same rows, same query,
	// same SQL — the only difference is what wrote the vectors.
	real, err := New(db, testLogger(), emb)
	if err != nil {
		t.Fatal(err)
	}
	res, err := real.BackfillEmbeddings(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("re-embedded %d memories with %s", res.Written, emb.Name())

	after, err := real.Recall(ctx, "api-dev", query, 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) == 0 {
		t.Fatalf("%s recalled nothing for %q", emb.Name(), query)
	}
	for _, m := range after {
		t.Logf("  %s: score=%.4f %q", emb.Name(), m.Score, m.Content)
	}
	if !strings.Contains(after[0].Content, "login button") {
		t.Fatalf("top result for %q is %q, want the paraphrase %q", query, after[0].Content, target)
	}

	// And the baseline must genuinely have missed it, or this test proves
	// nothing about the change.
	for _, m := range before {
		if strings.Contains(m.Content, "login button") {
			t.Errorf("the hash embedder ALSO found it — this corpus does not demonstrate the difference")
		}
	}
}

// Retrieval found the right row; ranking has to be able to say so.
//
// The fused score separates the answer from the distractor by 0.0003 — an
// artefact of rank position, not a judgement about either passage. That is the
// gap the cross-encoder exists to open, and this test is the measurement of it.
func TestRerankingSeparatesTheAnswerFromTheDistractor(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	emb := liveEmbedder(t)
	rr := RerankerFromEnv(os.Getenv("BUILDER_EMBED_URL"))
	if rr == nil {
		t.Skip("no reranker configured")
	}

	s, err := New(db, testLogger(), emb)
	if err != nil {
		t.Fatal(err)
	}
	// The distractors are deliberately auth-adjacent — 0.456 and 0.307 cosine
	// from the query, both inside SemanticMaxDistance. Separating obvious junk
	// is the floor's job and it does it (a sentence about bananas never reaches
	// the reranker). Separating three plausible passages is the reranker's, and
	// a test that fed it junk would prove only that the floor works.
	for ref, content := range map[string]string{
		"target":   "the login button is broken",
		"distract": "the session token is refreshed every fifteen minutes",
		"noise":    "the signup form rejects valid email addresses",
	} {
		if _, err := s.Retain(ctx, "proj:api-dev", content, "note", ref, 0.5); err != nil {
			t.Fatal(err)
		}
	}

	const query = "authentication fails"

	fused, err := s.Recall(ctx, "api-dev", query, 5)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("--- fused (vector + full text, no rerank) ---")
	for i, m := range fused {
		t.Logf("  %d. score=%.4f  %q", i+1, m.Score, m.Content)
	}

	s.SetReranker(rr)
	ranked, err := s.Recall(ctx, "api-dev", query, 5)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("--- reranked by %s ---", rr.Name())
	for i, m := range ranked {
		t.Logf("  %d. score=%.4f  %q", i+1, m.Score, m.Content)
	}

	if len(ranked) < 2 {
		t.Fatalf("recalled %d memories, need at least 2 to compare", len(ranked))
	}
	if !strings.Contains(ranked[0].Content, "login button") {
		t.Fatalf("top reranked result is %q, want the paraphrase", ranked[0].Content)
	}
	// The separation is the point. Fused scores differ in the fourth decimal;
	// the cross-encoder's differ by orders of magnitude, which is what makes a
	// cutoff possible at all.
	if len(fused) >= 2 {
		t.Logf("fused separation:    %.6f", fused[0].Score-fused[1].Score)
	}
	t.Logf("reranked separation: %.6f", ranked[0].Score-ranked[1].Score)
	if ranked[0].Score-ranked[1].Score <= fused[0].Score-fused[1].Score {
		t.Errorf("reranking did not widen the gap between the answer and the next result")
	}
}
