package brain

import (
	"context"
	"strings"
	"testing"
)

// These run against a real Postgres (TEST_DATABASE_URL, a _test database) and a
// fake reranker, because the two things worth proving here are the seams
// between the ranking pass and everything else: that the second pass actually
// reorders what SQL returned, that a dead reranker costs nothing, and that a
// vector from a retired embedder never enters a ranking it cannot be part of.

// scriptedReranker ranks by a fixed preference over substrings, so a test can
// state the order it expects in the terms of the memory it wants first.
type scriptedReranker struct {
	prefer string
	fail   error
	calls  int
}

func (r *scriptedReranker) Name() string { return "scripted" }

func (r *scriptedReranker) Rerank(_ context.Context, _ string, texts []string) ([]RerankHit, error) {
	r.calls++
	if r.fail != nil {
		return nil, r.fail
	}
	hits := make([]RerankHit, len(texts))
	for i, t := range texts {
		score := 0.1
		if strings.Contains(t, r.prefer) {
			score = 0.99
		}
		hits[i] = RerankHit{Index: i, Score: score}
	}
	sortHits(hits)
	return hits, nil
}

// The whole point of the second pass: a memory the fused query ranked low comes
// back first because a model read it against the query.
func TestRerankingReordersWhatSQLReturned(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []string{
		"deploy runs on every push to main",
		"the token cache expires after fifteen minutes",
		"authentication fails when the clock drifts",
	} {
		if _, err := s.Retain(ctx, "proj:api-dev", c, "note", c, 0.5); err != nil {
			t.Fatal(err)
		}
	}

	plain, err := s.Recall(ctx, "api-dev", "token cache deploy authentication clock", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) < 2 {
		t.Fatalf("recalled %d memories, need at least 2 to reorder", len(plain))
	}

	rr := &scriptedReranker{prefer: "clock drifts"}
	s.SetReranker(rr)
	ranked, err := s.Recall(ctx, "api-dev", "token cache deploy authentication clock", 3)
	if err != nil {
		t.Fatal(err)
	}
	if rr.calls == 0 {
		t.Fatal("the reranker was never called")
	}
	if !strings.Contains(ranked[0].Content, "clock drifts") {
		t.Fatalf("top result is %q; the reranker's preference was not applied", ranked[0].Content)
	}
	// The score shown must be the model's judgement, not the fusion artefact.
	if ranked[0].Score != 0.99 {
		t.Errorf("score = %v, want the rerank score 0.99", ranked[0].Score)
	}
}

// A reranker that is down must cost the fused order, not the results. Recall is
// on the critical path of every agent run; a ranking service is not.
func TestADeadRerankerLeavesRecallWorking(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []string{"alpha memory one", "alpha memory two"} {
		if _, err := s.Retain(ctx, "proj:api-dev", c, "note", c, 0.5); err != nil {
			t.Fatal(err)
		}
	}

	s.SetReranker(&scriptedReranker{fail: context.DeadlineExceeded})
	got, err := s.Recall(ctx, "api-dev", "alpha memory", 5)
	if err != nil {
		t.Fatalf("recall failed because the reranker did: %v", err)
	}
	if len(got) == 0 {
		t.Fatal("a dead reranker emptied recall")
	}
}

// Scope beats relevance, still. The cross-encoder ranks a query against a
// passage; it has no idea that an agent's own conclusion outranks shared
// background, and that ordering was decided where the query is built.
func TestRerankingKeepsTheAgentsOwnMemoriesFirst(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Retain(ctx, "proj:project", "the retry budget is three attempts", "note", "shared", 0.9); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Retain(ctx, "proj:api-dev", "retry budget measured at two attempts here", "note", "own", 0.5); err != nil {
		t.Fatal(err)
	}

	// The reranker is told to prefer the SHARED memory, the opposite of the
	// order scope requires.
	s.SetReranker(&scriptedReranker{prefer: "three attempts"})
	got, err := s.Recall(ctx, "api-dev", "retry budget attempts", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) < 2 {
		t.Fatalf("recalled %d, need both memories", len(got))
	}
	if got[0].Namespace != "proj:api-dev" {
		t.Fatalf("first result is from %s; reranking overrode the scope ordering", got[0].Namespace)
	}
}

// A vector written by a different embedder shares this column and its distance
// operator but not its space. Letting one into the vector arm means ranking a
// meaningless number against real ones — so it must be excluded, while staying
// findable by keyword.
func TestAVectorFromAnotherEmbedderIsNotRankedAgainstThisOne(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Retain(ctx, "proj:api-dev", "the migration runner is idempotent", "note", "mig", 0.5); err != nil {
		t.Fatal(err)
	}

	var model string
	if err := db.QueryRowContext(ctx,
		`SELECT embedding_model FROM builder_memories WHERE namespace='proj:api-dev' AND source_ref='mig'`).
		Scan(&model); err != nil {
		t.Fatal(err)
	}
	if model != "hash-bow" {
		t.Fatalf("embedding_model = %q, want the embedder's own name", model)
	}

	// Relabel it as another model's work, exactly as migration 0018 leaves every
	// pre-existing row once a real embedder is configured.
	if _, err := db.ExecContext(ctx,
		`UPDATE builder_memories SET embedding_model = 'some-other-model'
		  WHERE namespace='proj:api-dev' AND source_ref='mig'`); err != nil {
		t.Fatal(err)
	}

	// Still there by keyword — nothing was lost, only excluded from a ranking it
	// could not take part in.
	got, err := s.Recall(ctx, "api-dev", "migration runner idempotent", 5)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, m := range got {
		if m.SourceRef == "mig" {
			found = true
		}
	}
	if !found {
		t.Fatal("a memory from a retired embedder became unfindable; it should still match by full text")
	}
}

// The backfill is what makes those rows semantic again. It must find them,
// rewrite them, and leave nothing behind.
func TestBackfillRewritesMemoriesFromAnotherEmbedder(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []string{"one", "two", "three"} {
		if _, err := s.Retain(ctx, "proj:api-dev", "memory "+c, "note", c, 0.5); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx,
		`UPDATE builder_memories SET embedding_model='hash-bow-v0' WHERE namespace='proj:api-dev'`); err != nil {
		t.Fatal(err)
	}

	// A semantic embedder, so the backfill agrees to run at all. Width must
	// match the column.
	s.emb = &fixedEmbedder{name: "http:bge-m3", dim: Dim}

	pending, err := s.PendingReembed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if pending < 3 {
		t.Fatalf("pending = %d, want at least the 3 relabelled memories", pending)
	}

	res, err := s.BackfillEmbeddings(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Written < 3 {
		t.Fatalf("wrote %d, want at least 3", res.Written)
	}
	after, err := s.PendingReembed(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after != 0 {
		t.Errorf("%d memories still on an old embedder after the backfill", after)
	}

	// And nothing was deleted on the way.
	var n int
	if err := db.QueryRowContext(ctx,
		`SELECT count(*) FROM builder_memories WHERE namespace='proj:api-dev'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n < 3 {
		t.Fatalf("%d memories left in the namespace; the backfill removed rows", n)
	}
}

// Re-embedding hash vectors with the hash embedder rewrites every row to the
// value it already holds. Refused, so a misconfigured boot does not spend an
// hour proving nothing changed.
func TestBackfillRefusesToRunWithoutASemanticEmbedder(t *testing.T) {
	db := open(t)
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.BackfillEmbeddings(context.Background(), 0); err == nil {
		t.Fatal("the backfill agreed to re-embed hash vectors with the hash embedder")
	}
}

// fixedEmbedder is a stand-in for a real model: it reports a model name that is
// not the hash embedder's, which is all the backfill needs to agree to run.
type fixedEmbedder struct {
	name string
	dim  int
}

func (f *fixedEmbedder) Name() string    { return f.name }
func (f *fixedEmbedder) Dimensions() int { return f.dim }
func (f *fixedEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i := range texts {
		v := make([]float32, f.dim)
		v[i%f.dim] = 1
		out[i] = v
	}
	return out, nil
}
