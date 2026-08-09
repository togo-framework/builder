-- Chat sessions and their turns.
--
-- The first cut of the chat surface kept the conversation in React state and
-- posted it back with each question. That works until the tab is closed, which
-- is when an operator discovers the answer they wanted to keep is gone — and it
-- means the same question is re-asked and re-billed because nothing remembers
-- it was answered an hour ago.
--
-- WHY THIS IS NOT THE BRAIN
-- A chat is advisory and often idle curiosity. Retaining every exchange as a
-- memory would make what the project "knows" a function of what someone
-- wondered about on a Tuesday. Sessions live here; only what an operator
-- explicitly keeps is promoted into the brain.

CREATE TABLE IF NOT EXISTS builder_chat_sessions (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The agent answering. No foreign key: an agent can be retired, and the
    -- conversation it had is still worth reading afterwards.
    agent_slug text NOT NULL,
    -- Derived from the first question, so the list reads as what was asked
    -- rather than as a column of timestamps.
    title text NOT NULL DEFAULT '',
    started_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_chat_sessions_recent_idx
    ON builder_chat_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS builder_chat_turns (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES builder_chat_sessions(id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('you','agent')),
    body_md    text NOT NULL,
    -- The memories the answer was grounded in, as the API returned them.
    -- Stored with the turn rather than re-derived: recall is not stable across
    -- an embedder change, and a citation that silently becomes a different
    -- memory is worse than no citation.
    citations  jsonb NOT NULL DEFAULT '[]'::jsonb,
    grounded   boolean NOT NULL DEFAULT false,
    cost_usd   numeric(10,4) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_chat_turns_session_idx
    ON builder_chat_turns (session_id, created_at);
