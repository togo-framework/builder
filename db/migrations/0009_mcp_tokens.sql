-- Tokens for the MCP servers.
--
-- The dashboard is protected by a session cookie, which an MCP client cannot
-- present: Claude Code, Codex and the rest send `Authorization: Bearer`. So the
-- MCP surface needs its own credential, and it has to be one the operator can
-- revoke without disturbing their own login.

CREATE TABLE IF NOT EXISTS builder_mcp_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What this token is for, in the operator's words ("my laptop", "Codex").
    -- The whole point of several tokens is being able to revoke exactly one.
    name        text NOT NULL,

    -- SHA-256 of the token, never the token. A leaked database must not hand
    -- over working credentials, and the plaintext is shown exactly once at
    -- creation — the same contract as every other API key the operator has met.
    token_hash  text NOT NULL UNIQUE,

    -- First 8 characters, so the UI can say WHICH token a row is without being
    -- able to reconstruct it.
    prefix      text NOT NULL DEFAULT '',

    -- 'agents' | 'feedback' | 'all'. Two servers with different blast radii:
    -- the feedback surface files and reads issues, the agents surface reaches
    -- personas, memory and the secret vault's key NAMES. A token wired into a
    -- shared editor should be able to do the first without the second.
    scope       text NOT NULL DEFAULT 'feedback'
                CHECK (scope IN ('agents','feedback','all')),

    created_at   timestamptz NOT NULL DEFAULT now(),
    -- Answers "is this still in use?" before revoking it.
    last_used_at timestamptz,
    revoked_at   timestamptz
);

-- The lookup on every single MCP request.
CREATE INDEX IF NOT EXISTS builder_mcp_tokens_live_idx
    ON builder_mcp_tokens (token_hash) WHERE revoked_at IS NULL;
