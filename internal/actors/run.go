package actors

// The send path.
//
// Order of operations, and it is the only order that survives a crash:
//
//  1. Validate. Everything the caller could have got wrong fails here, before
//     anything is written or sent.
//  2. DryRun short-circuits. It renders the payload and returns; no row, no
//     network, no credential read.
//  3. Insert the outbox row and COMMIT it. Now a durable record exists saying
//     "we are about to send this, under this idempotency key".
//  4. Call the provider.
//  5. Record the outcome on that row.
//
// A process that dies between 3 and 5 leaves a row in 'sending' — which is the
// answerable state. Doing it the other way round (send, then record) loses
// exactly the case that matters: nobody can say whether the message went out.
// Same reasoning as orchestrator/claim.go, and Rule 43 applied to sending.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

// Store is the persistence an actor run needs. An interface so the tests can
// exercise the ordering without a database.
type Store interface {
	// Claim inserts the outbox row, or returns the existing one for this
	// idempotency key. `fresh` is false when the key was already present.
	Claim(ctx context.Context, row OutboxRow) (id string, fresh bool, err error)
	// Finish records the terminal state.
	Finish(ctx context.Context, id string, status string, out ActOutput, sendErr error) error
}

type OutboxRow struct {
	ConnectionID string
	Kind         string
	Action       string
	Actor        Principal
	Idem         string
	Preview      string
	Params       json.RawMessage
	ApprovalID   string
}

// Runner performs actions. One per process.
type Runner struct {
	Store Store
	Log   *slog.Logger
	// Secrets resolves a connection's credential. Blocked{} until SF-001 is
	// decided — see secrets.go.
	Secrets func(kind, name string) Secrets
}

// Run validates, records, and performs one action.
func (r *Runner) Run(ctx context.Context, connID, kind string, cfg json.RawMessage, in ActInput) (ActOutput, error) {
	log := r.Log
	if log == nil {
		log = slog.Default()
	}

	spec, err := Validate(kind, in)
	if err != nil {
		return ActOutput{}, err
	}
	a, _ := Get(kind)

	// A dry run renders and returns. Deliberately BEFORE the outbox insert: a
	// preview is not a send, and filling the outbox with rows that never
	// intended to go anywhere would make "what is stuck?" unanswerable.
	if in.DryRun {
		out, err := a.Act(ctx, in, cfg, dryRunSecrets{})
		if err != nil {
			return out, err
		}
		if out.Preview == "" {
			// An actor that ignores DryRun is the one bug this whole design is
			// meant to prevent, so it is an error rather than a warning.
			return out, fmt.Errorf("%s.%s: dry run produced no preview", kind, in.Action)
		}
		return out, nil
	}

	sec := Secrets(Blocked{Kind: kind, Name: in.Action})
	if r.Secrets != nil {
		sec = r.Secrets(kind, in.Action)
	}

	// 3. Durable record FIRST.
	id, fresh, err := r.Store.Claim(ctx, OutboxRow{
		ConnectionID: connID,
		Kind:         kind,
		Action:       in.Action,
		Actor:        in.Actor,
		Idem:         in.Idem,
		Preview:      "",
		Params:       in.Params,
		ApprovalID:   in.ApprovalID,
	})
	if err != nil {
		return ActOutput{}, fmt.Errorf("outbox claim: %w", err)
	}
	if !fresh {
		// The key has been used. This is the idempotency guarantee doing its
		// job: return without sending again, and let the caller read the
		// existing row's outcome.
		log.Info("outbox: idempotency key already used, not resending",
			"kind", kind, "action", in.Action, "idem", in.Idem, "id", id)
		return ActOutput{}, ErrAlreadySent
	}

	// 4. Send.
	out, sendErr := a.Act(ctx, in, cfg, sec)

	// 5. Record. Both branches, always — an unrecorded outcome is the state
	// this ordering exists to avoid.
	status := "sent"
	if sendErr != nil {
		status = "failed"
	}
	if err := r.Store.Finish(ctx, id, status, out, sendErr); err != nil {
		// The send may well have succeeded; only the bookkeeping failed. Say so
		// precisely, because "failed" here would be a lie about the message.
		log.Error("outbox: could not record the outcome of a send that already happened",
			"id", id, "status", status, "err", err)
	}
	if sendErr != nil {
		return out, sendErr
	}
	_ = spec
	return out, nil
}

// ErrAlreadySent is returned when an idempotency key has been used before.
// Not an error condition so much as the guarantee working.
var ErrAlreadySent = errors.New("this idempotency key has already been used; not sending again")

// dryRunSecrets refuses every read.
//
// A dry run that can reach the vault is a dry run that can leak a credential
// into a preview, and it removes the guarantee that DryRun touches nothing.
// Any actor that reads a secret before checking in.DryRun fails loudly here
// rather than quietly working.
type dryRunSecrets struct{}

func (dryRunSecrets) Reveal(context.Context, string) (string, error) {
	return "", errors.New("a dry run must not read a credential; check in.DryRun before revealing")
}

// ─────────────────────────── the SQL store ───────────────────────────

type SQLStore struct{ DB *sql.DB }

func (s SQLStore) Claim(ctx context.Context, row OutboxRow) (string, bool, error) {
	var connID any
	if row.ConnectionID != "" {
		connID = row.ConnectionID
	}
	params := row.Params
	if len(params) == 0 {
		params = json.RawMessage(`{}`)
	}

	var id string
	err := s.DB.QueryRowContext(ctx, `
		INSERT INTO builder_connection_outbox
		    (connection_id, kind, action, actor_kind, actor_slug, idem, params, approval_id, status, attempts)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),'sending',1)
		ON CONFLICT (kind, action, idem) DO NOTHING
		RETURNING id`,
		connID, row.Kind, row.Action, row.Actor.Kind, row.Actor.Slug,
		row.Idem, []byte(params), row.ApprovalID).Scan(&id)

	if errors.Is(err, sql.ErrNoRows) {
		// DO NOTHING fired: the key exists. Read the row that owns it.
		if err := s.DB.QueryRowContext(ctx,
			`SELECT id FROM builder_connection_outbox WHERE kind=$1 AND action=$2 AND idem=$3`,
			row.Kind, row.Action, row.Idem).Scan(&id); err != nil {
			return "", false, fmt.Errorf("read existing outbox row: %w", err)
		}
		return id, false, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, true, nil
}

func (s SQLStore) Finish(ctx context.Context, id, status string, out ActOutput, sendErr error) error {
	var errText any
	if sendErr != nil {
		errText = sendErr.Error()
	}
	var result any
	if len(out.Result) > 0 {
		result = []byte(out.Result)
	}
	_, err := s.DB.ExecContext(ctx, `
		UPDATE builder_connection_outbox
		   SET status=$2, provider_ref=NULLIF($3,''), preview=$4, result=$5,
		       error=$6, retryable=$7, updated_at=now()
		 WHERE id=$1`,
		id, status, out.ProviderRef, out.Preview, result, errText, out.Retryable)
	return err
}

// RetryAfterOr returns the provider's requested backoff, or a default.
// The CALLER waits; an actor never sleeps.
func RetryAfterOr(out ActOutput, def time.Duration) time.Duration {
	if out.RetryAfter > 0 {
		return out.RetryAfter
	}
	return def
}
