-- Inbound webhooks: a push endpoint anything can POST to, landing in the brain.
--
-- Three separate things, because they are one feature:
--
--   1. A brain that belongs to no agent. Every ingestion source — a webhook, a
--      polled datasource, a human pasting a customer email — produces knowledge
--      about the PROJECT, not about an agent. Until now `builder_brains.agent_slug`
--      was `text NOT NULL`, so the project brain could not exist and there was
--      nowhere for such a memory to go.
--   2. The source registry: one row per endpoint, holding its URL token, its
--      signing key NAME, its template and its rate limit.
--   3. The delivery log, so a stuck integration can be debugged.
--
-- The naming decision behind (1), from the operator: the canonical project
-- namespace is `<fleet>:project` — `default:project` for a single-fleet install.
-- It is not a new convention; every agent brain is already `<fleet>:<slug>`, and
-- the project brain is the same shape with `project` in the slug position. The
-- `project:<name>` phrasing that circulated earlier is withdrawn.
--
-- Writing this file is not applying it. Rule 20/27: `togo migrate` applies it
-- against a database a human chose.

-- ---------------------------------------------------------------------------
-- 1. A brain with no agent
-- ---------------------------------------------------------------------------

-- The FK to builder_agents(slug) STAYS: a NULL satisfies it, so an agent brain
-- is still forced to name a real agent. The UNIQUE on agent_slug also stays —
-- Postgres permits many NULLs in a unique column, and a second ownerless brain
-- would need its own namespace regardless, which `namespace text NOT NULL
-- UNIQUE` already enforces.
ALTER TABLE builder_brains ALTER COLUMN agent_slug DROP NOT NULL;

-- A brain is owned by an agent, or it is a project brain. Nothing else. Without
-- this, dropping NOT NULL would also permit an anonymous brain under an
-- arbitrary namespace — memory belonging to nobody, readable by whoever guessed
-- the string.
ALTER TABLE builder_brains
  DROP CONSTRAINT IF EXISTS builder_brains_owner_check;
ALTER TABLE builder_brains
  ADD CONSTRAINT builder_brains_owner_check
  CHECK (agent_slug IS NOT NULL OR namespace LIKE '%:project');

-- The `default:project` row itself is NOT seeded here. Seeding it, granting
-- every agent read on it, and surfacing it in the dashboard is issue #35's
-- work; this migration only makes the row expressible.

-- ---------------------------------------------------------------------------
-- 2. The source registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS builder_webhook_sources (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Same slug shape as an agent: it appears in URLs and in log lines.
    slug            text NOT NULL UNIQUE
                      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    display_name    text NOT NULL,

    -- The random segment in the endpoint URL. Stored as SHA-256, never in the
    -- clear — the same contract as builder_mcp_tokens, and for the same reason:
    -- a URL containing a secret is a credential, it turns up in proxy logs and
    -- browser history, and a leaked database must not hand over working ones.
    -- The plaintext is shown once, at creation.
    path_token_hash text NOT NULL UNIQUE,
    -- First 8 characters, so the UI can say WHICH endpoint a row is without
    -- being able to reconstruct it.
    path_token_prefix text NOT NULL DEFAULT '',

    -- A vault key NAME, never the HMAC key itself (Rule 34) — the same column
    -- contract as builder_brains.token_secret_ref. Nothing in this column is a
    -- credential; the handler resolves it through the vault in-process.
    signing_secret_ref text NOT NULL DEFAULT '',
    signature_header   text NOT NULL DEFAULT 'X-Builder-Signature',
    signature_algo     text NOT NULL DEFAULT 'hmac-sha256'
                         CHECK (signature_algo IN ('hmac-sha256','hmac-sha512')),

    -- The template mapping the JSON body to memory text. Empty means the source
    -- is not ready, which is why it may not be enabled empty either.
    template        text NOT NULL DEFAULT '',

    -- Where a delivery's memory lands. A column rather than a constant because
    -- a multi-fleet install has more than one project brain — but constrained,
    -- because an unauthenticated POST must never be able to write into an
    -- agent's PRIVATE namespace. That is the whole scoping rule (Rule 40) and
    -- it belongs in the schema, not only in the handler that happens to be
    -- written today.
    namespace       text NOT NULL DEFAULT 'default:project'
                      CHECK (namespace LIKE '%:project'),

    -- Passed to brain.Retain. An automated firehose should not outrank what an
    -- agent concluded by reading the code, so the default sits at the middle.
    importance      numeric(3,2) NOT NULL DEFAULT 0.50
                      CHECK (importance > 0 AND importance <= 1),

    -- "A stuck integration must not flood the brain." A deploy notifier in a
    -- crash loop can POST thousands of times a minute; without a ceiling the
    -- brain fills with one message repeated until recall is useless.
    rate_limit_per_min integer NOT NULL DEFAULT 60
                         CHECK (rate_limit_per_min > 0),

    -- A source lands DISABLED, like a generated agent. Creating an endpoint and
    -- opening it to the internet are two decisions, and a migration must not
    -- make the second one.
    enabled         boolean NOT NULL DEFAULT false,

    last_delivery_at timestamptz,
    delivery_count   integer NOT NULL DEFAULT 0,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- An enabled source is a live, public, unauthenticated URL. It must have
    -- something to verify the caller with and something to render — otherwise
    -- it is an open pipe into the project's memory. Expressed here rather than
    -- in a handler so no future code path can skip it.
    CONSTRAINT builder_webhook_sources_enabled_is_signed
      CHECK (enabled = false OR (signing_secret_ref <> '' AND template <> ''))
);

-- ---------------------------------------------------------------------------
-- 3. The delivery log
-- ---------------------------------------------------------------------------
--
-- WHAT IS DELIBERATELY NOT HERE: the request body.
--
-- The issue asked for recent deliveries "with their bodies, for debugging". CI
-- results, deploy notifiers and form posts routinely carry bearer tokens,
-- signed URLs and customer data in the body, and a debugging table is exactly
-- the one nobody remembers is full of them. A TTL does not fix it: the exposure
-- window for a token starts when the row is written, not when it expires.
--
-- So a delivery keeps the header NAMES (never their values — that is where an
-- Authorization header lives), a SHA-256 of the raw body, its byte size, and
-- the rendered memory text. The rendered text is safe to keep because it is by
-- definition already going into the brain; storing it reveals nothing the
-- memory row does not. If a delivery cannot be diagnosed from the hash plus the
-- rendered text, that is an argument for a better renderer, not for keeping
-- credentials.

CREATE TABLE IF NOT EXISTS builder_webhook_deliveries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     uuid NOT NULL REFERENCES builder_webhook_sources(id) ON DELETE CASCADE,

    -- 'accepted'     — verified, rendered, retained
    -- 'rejected'     — bad signature, unknown token, or the source is disabled
    -- 'rate_limited' — over rate_limit_per_min
    -- 'failed'       — accepted, then the render or the retain errored
    --
    -- A rejected delivery is logged too. An integration whose signature is
    -- misconfigured looks identical to one that was never wired up unless the
    -- failures are visible, and that is the first thing anyone debugs.
    status        text NOT NULL DEFAULT 'accepted'
                    CHECK (status IN ('accepted','rejected','rate_limited','failed')),
    http_status   integer NOT NULL DEFAULT 0,

    -- Names only. Never values.
    header_names  text[] NOT NULL DEFAULT '{}',
    body_sha256   text NOT NULL DEFAULT '',
    body_bytes    integer NOT NULL DEFAULT 0 CHECK (body_bytes >= 0),

    -- The renderer's output: what the template made of the body, which is the
    -- artefact worth reading when a mapping is wrong.
    rendered_text text NOT NULL DEFAULT '',

    -- SET NULL, not CASCADE: forgetting a memory must not erase the evidence
    -- that a delivery arrived and produced it.
    memory_id     uuid REFERENCES builder_memories(id) ON DELETE SET NULL,

    error         text NOT NULL DEFAULT '',
    received_at   timestamptz NOT NULL DEFAULT now()
);

-- The deliveries list for one source, newest first. Also the range scan the
-- per-source rate limiter runs on every request ("how many in the last
-- minute?"), which is why received_at is in the index and not just the filter.
CREATE INDEX IF NOT EXISTS builder_webhook_deliveries_source_idx
    ON builder_webhook_deliveries (source_id, received_at DESC);

-- The lookup a delivery does the other way: which delivery produced this
-- memory. Partial, because most rows never produce one.
CREATE INDEX IF NOT EXISTS builder_webhook_deliveries_memory_idx
    ON builder_webhook_deliveries (memory_id)
    WHERE memory_id IS NOT NULL;
