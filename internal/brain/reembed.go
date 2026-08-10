package brain

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Re-embedding the memories a previous embedder wrote.
//
// The brain has been accumulating rows since before there was a real model, and
// every one of them holds a hashed bag of words. Switching the embedder does not
// migrate them — a vector is not recomputable from the vector, only from the
// text — so without this they would stay invisible to semantic recall forever,
// which is the same as having lost them.
//
// The alternative answers were both worse. Deleting the old vectors throws away
// rows that still work by keyword for no gain. Leaving them in the vector arm
// poisons it: distances between two different models' vectors are meaningless
// and rank against real ones anyway. Recall filters them out (see migration
// 0018) and this puts them back, one batch at a time.
//
// It runs in the background because it is not on anybody's critical path: the
// brain is fully usable while it drains, memories re-enter semantic recall as
// they are rewritten, and an interrupted run resumes from wherever it stopped
// because the work queue is a predicate over the table rather than a cursor.
//
//	BUILDER_EMBED_BACKFILL=off    do not re-embed on boot
//	BUILDER_EMBED_BACKFILL_RATE   pause between batches, e.g. 250ms

// reembedBatch is how many memories are rewritten per round trip.
//
// Matched to maxEmbedBatch so one batch is one embedding request and one UPDATE
// — a larger number would split into several requests inside one transaction
// and hold row locks across a network call for no benefit.
const reembedBatch = maxEmbedBatch

// BackfillResult is what one backfill pass did.
type BackfillResult struct {
	Scanned int
	Written int
	Failed  int
}

// BackfillEmbeddings rewrites every memory whose vector did not come from the
// current embedder, until there are none left or ctx ends.
//
// Returns the counts rather than an error for a partial run: a backfill that
// re-embedded 900 of 1000 rows and then lost the endpoint has done 900 rows of
// real good, and reporting that as a failure would invite a caller to discard it
// and start over.
func (s *Store) BackfillEmbeddings(ctx context.Context, pause time.Duration) (BackfillResult, error) {
	var res BackfillResult
	if s.emb == nil {
		return res, errors.New("no embedder configured")
	}
	if !IsSemantic(s.emb) {
		// Re-embedding hash vectors with the hash embedder rewrites every row to
		// the value it already holds. Refused rather than allowed to run, so a
		// misconfigured boot does not spend an hour proving nothing changed.
		return res, fmt.Errorf("embedder %s is not semantic; nothing to backfill", s.emb.Name())
	}
	model := s.emb.Name()

	for {
		if err := ctx.Err(); err != nil {
			return res, err
		}
		ids, texts, err := s.staleBatch(ctx, model, reembedBatch)
		if err != nil {
			return res, err
		}
		if len(ids) == 0 {
			return res, nil
		}
		res.Scanned += len(ids)

		vecs, err := s.emb.Embed(ctx, texts)
		if err != nil {
			// Stop, do not skip. The rows are still selected by the same
			// predicate next time, so a transient outage costs a delay rather
			// than a permanently unembedded batch — whereas marking them done to
			// keep moving would lose them silently.
			return res, fmt.Errorf("re-embed batch: %w", err)
		}
		if len(vecs) != len(ids) {
			return res, fmt.Errorf("re-embed batch: %d vectors for %d memories", len(vecs), len(ids))
		}

		for i, id := range ids {
			if _, err := s.db.ExecContext(ctx,
				`UPDATE builder_memories
				    SET embedding = $2::vector, embedding_model = $3
				  WHERE id = $1`,
				id, vecLiteral(vecs[i]), model); err != nil {
				// One row failing is not the batch failing. Counted and logged;
				// the predicate will offer it again on the next pass.
				res.Failed++
				s.log.Warn("re-embed: memory not written", "id", id, "err", err)
				continue
			}
			res.Written++
		}

		if pause > 0 {
			select {
			case <-ctx.Done():
				return res, ctx.Err()
			case <-time.After(pause):
			}
		}
	}
}

// staleBatch reads the next memories to re-embed.
//
// Ordered oldest-first so a partially drained backfill has a comprehensible
// state ("everything before this date is on the new model") rather than a
// scattered one. invalid_at IS NULL because a forgotten memory is not worth an
// embedding call — it is excluded from every recall already.
func (s *Store) staleBatch(ctx context.Context, model string, n int) ([]string, []string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, content FROM builder_memories
		  WHERE invalid_at IS NULL
		    AND embedding_model IS DISTINCT FROM $1
		  ORDER BY created_at
		  LIMIT $2`, model, n)
	if err != nil {
		return nil, nil, fmt.Errorf("scan for memories to re-embed: %w", err)
	}
	defer rows.Close()

	var ids, texts []string
	for rows.Next() {
		var id, content string
		if err := rows.Scan(&id, &content); err != nil {
			return nil, nil, fmt.Errorf("scan for memories to re-embed: %w", err)
		}
		ids = append(ids, id)
		texts = append(texts, content)
	}
	return ids, texts, rows.Err()
}

// PendingReembed counts memories not yet on the current embedder, so a boot log
// or a status page can say how much of the brain semantic recall can currently
// see.
func (s *Store) PendingReembed(ctx context.Context) (int, error) {
	if s.emb == nil {
		return 0, nil
	}
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM builder_memories
		  WHERE invalid_at IS NULL AND embedding_model IS DISTINCT FROM $1`,
		s.emb.Name()).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count memories to re-embed: %w", err)
	}
	return n, nil
}

// BackfillEnabled reports whether boot should start a backfill. On by default:
// the whole point of configuring a real embedder is that recall gets better, and
// an operator who has to find and run a separate command to make the memories
// they already have participate will reasonably conclude it did not work.
func BackfillEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("BUILDER_EMBED_BACKFILL")))
	switch v {
	case "off", "0", "false", "no":
		return false
	}
	return true
}

// BackfillPause is the gap between batches.
//
// Non-zero by default. The endpoint that serves the backfill also serves live
// recall, and a backfill that saturates it turns "recall got better" into
// "recall got slow" on the day it is switched on. 250ms across 64-row batches
// drains ten thousand memories in about a minute while leaving the model mostly
// idle for real queries.
func BackfillPause() time.Duration {
	if v := strings.TrimSpace(os.Getenv("BUILDER_EMBED_BACKFILL_RATE")); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d >= 0 {
			return d
		}
		if ms, err := strconv.Atoi(v); err == nil && ms >= 0 {
			return time.Duration(ms) * time.Millisecond
		}
	}
	return 250 * time.Millisecond
}
