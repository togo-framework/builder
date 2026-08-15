-- The outbox: every outbound send, recorded before it is attempted.
--
-- The ordering is the whole point. A row is written, committed, and only then
-- does the provider call happen — so a crash between the two leaves a row in
-- 'sending' with an idempotency key, which is answerable. The alternative
-- (record the result afterwards) loses exactly the case you most need: the
-- process died mid-send and nobody can say whether the message went out.
--
-- This is the same reasoning as internal/orchestrator/claim.go, which writes the
-- run row before the session process exists, and it is Rule 43 applied to
-- sending rather than to batching.
--
-- Nothing here reads or stores a credential. The payload column holds what was
-- SENT, which for a Slack message is a channel and some text; the token that
-- authorised it lives in the vault and is named, never copied (Rule 34).

BEGIN;

CREATE TABLE IF NOT EXISTS builder_connection_outbox (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The connection that sent it. ON DELETE CASCADE would erase the audit
    -- trail with the connection, so the reference is deliberately soft: a
    -- deleted connection leaves its history behind.
    connection_id uuid REFERENCES builder_sources(id) ON DELETE SET NULL,
    kind        text NOT NULL,
    action      text NOT NULL,

    -- WHO asked. Free text rather than a foreign key, on purpose: this is an
    -- audit record, and an audit record that cannot be written because the
    -- principal was deleted is not an audit record. (The FK version of this
    -- mistake is SF-001.)
    actor_kind  text NOT NULL,
    actor_slug  text NOT NULL,

    -- UNIQUE per effect. This is what makes "did the first call land?"
    -- answerable, and what a retry is keyed on.
    idem        text NOT NULL,

    -- pending  — approved and queued, nothing attempted
    -- sending  — the provider call is in flight (or the process died during it)
    -- sent     — the provider accepted it
    -- failed   — the provider refused, or the call errored
    -- cancelled— a human declined the approval
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sending','sent','failed','cancelled')),

    -- Exactly what would be / was sent, as shown in the approval UI. A human
    -- approving a send must see the bytes, not a summary of them.
    preview     text NOT NULL DEFAULT '',
    params      jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- The provider's own id: a Slack ts, a Telegram message_id, an email id.
    -- This is the join key an inbound delivery receipt resolves against.
    provider_ref text,
    result      jsonb,
    error       text,
    retryable   boolean NOT NULL DEFAULT false,

    -- Set when the action is External and a human approved it. NULL means
    -- nobody did, which for an External action means it must not send.
    approval_id text,
    approved_by text,
    approved_at timestamptz,

    attempts    int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The idempotency guarantee, enforced by the database rather than by a check in
-- Go that races itself. Two concurrent sends with the same key: one inserts,
-- the other gets a violation and reads the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS builder_connection_outbox_idem_uniq
    ON builder_connection_outbox (kind, action, idem);

-- "What is stuck?" — the query an operator runs when something did not arrive.
CREATE INDEX IF NOT EXISTS builder_connection_outbox_status_idx
    ON builder_connection_outbox (status, created_at DESC);

-- Resolving an inbound receipt to the row that produced it.
CREATE INDEX IF NOT EXISTS builder_connection_outbox_ref_idx
    ON builder_connection_outbox (provider_ref)
    WHERE provider_ref IS NOT NULL;

COMMENT ON TABLE builder_connection_outbox IS
  'Every outbound send, written before the provider call so a crash mid-send is answerable.';

COMMIT;
