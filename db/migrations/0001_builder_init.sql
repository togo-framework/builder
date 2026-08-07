-- builder — initial schema. Postgres 16+ is the reference dialect.
--
-- Applied by `togo migrate`, never by service code. Rule 20 forbids
-- CREATE TABLE from a request path; autopilot and auth both do it today and
-- that is exactly the pattern this plugin does not copy.
--
-- Every table is prefixed `builder_` because this is a plugin dropped into
-- someone else's app, and `issues` / `agents` are names the host will want.
--
-- SQLite dev substitutions are applied by the scaffolder, not here:
--   uuid -> text, jsonb -> text, timestamptz -> text (RFC3339),
--   text[] -> JSON array, partial indexes dropped, FOR UPDATE SKIP LOCKED dropped.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE builder_issue_status   AS ENUM ('triage','ready','in_progress','blocked','in_review','done','rejected');
CREATE TYPE builder_issue_type     AS ENUM ('bug','feature','enhancement','question','discussion','chore');
CREATE TYPE builder_issue_priority AS ENUM ('low','normal','high','critical');
CREATE TYPE builder_actor_kind     AS ENUM ('human','agent','anon','system');
CREATE TYPE builder_agent_role     AS ENUM ('orchestrator','builder','advisor','reviewer');
CREATE TYPE builder_run_status     AS ENUM ('queued','running','needs_input','succeeded','failed','cancelled','expired');
CREATE TYPE builder_decision_kind  AS ENUM ('question','approval','destructive_db','plan_review','budget_raise');
CREATE TYPE builder_decision_state AS ENUM ('pending','answered','approved','rejected','cancelled','timed_out');
CREATE TYPE builder_link_type      AS ENUM ('parent_of','blocks','duplicates','relates');

-- ---------------------------------------------------------------------------
-- 2. Fleet, memory and vault come first: issues reference agents.
-- ---------------------------------------------------------------------------

CREATE TABLE builder_fleets (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL UNIQUE,
    -- The operator's plan, stored verbatim. Untrusted: it reaches a model
    -- prompt and must be wrapped in injection markers first.
    plan_md                 text NOT NULL,
    plan_digest             text NOT NULL DEFAULT '',
    generated_by_session_id text NOT NULL DEFAULT '',
    status                  text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','generating','active','superseded')),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builder_brains (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_slug         text NOT NULL UNIQUE,
    driver             text NOT NULL DEFAULT 'pgvector'
                         CHECK (driver IN ('pgvector','cabrain','none')),
    namespace          text NOT NULL UNIQUE,
    api_url            text NOT NULL DEFAULT '',
    -- A vault key NAME, never a token. Nothing in this column is a credential.
    token_secret_ref   text NOT NULL DEFAULT '',
    can_read           boolean NOT NULL DEFAULT true,
    can_write          boolean NOT NULL DEFAULT true,
    shared_namespaces  text[]  NOT NULL DEFAULT '{}',
    embedding_dim      integer NOT NULL DEFAULT 1024,
    memory_count       integer NOT NULL DEFAULT 0,
    open_gaps          integer NOT NULL DEFAULT 0,
    last_recall_at     timestamptz,
    last_retain_at     timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builder_agents (
    -- No ':' anywhere in a slug: Claude Code reserves it for plugin scoping and
    -- silently refuses to load such a file.
    slug            text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    fleet_id        uuid REFERENCES builder_fleets(id) ON DELETE SET NULL,
    display_name    text NOT NULL,
    -- The delegation trigger. Mirrored verbatim into the file's frontmatter.
    description     text NOT NULL,
    role            builder_agent_role NOT NULL DEFAULT 'advisor',
    model           text NOT NULL DEFAULT 'sonnet'
                      CHECK (model IN ('haiku','sonnet','opus','inherit')),
    tools           text[] NOT NULL DEFAULT '{}',
    skills          text[] NOT NULL DEFAULT '{}',
    areas           text[] NOT NULL DEFAULT '{}',
    issue_types     builder_issue_type[] NOT NULL DEFAULT '{}',
    max_turns       integer NOT NULL DEFAULT 24 CHECK (max_turns > 0),
    max_budget_usd  numeric(10,4) NOT NULL DEFAULT 2.00 CHECK (max_budget_usd >= 0),
    permission_mode text NOT NULL DEFAULT 'acceptEdits',
    -- Generated agents land disabled. A human flips them on.
    enabled         boolean NOT NULL DEFAULT false,
    brain_id        uuid REFERENCES builder_brains(id) ON DELETE SET NULL,
    spec_path       text NOT NULL,
    spec_sha256     text NOT NULL DEFAULT '',
    -- Empty persona => PersonaUnavailable, fail loud. An agent with an empty
    -- system prompt is a different agent, not a degraded one.
    persona_md      text NOT NULL DEFAULT '',
    exec_provider   text NOT NULL DEFAULT '' CHECK (exec_provider IN ('','local','coder')),
    generated_by    text NOT NULL DEFAULT 'wizard'
                      CHECK (generated_by IN ('baseline','wizard','operator')),
    last_run_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- A code-writer must have memory.
    CONSTRAINT builder_agents_builder_needs_brain
      CHECK (role <> 'builder' OR enabled = false OR brain_id IS NOT NULL)
);

CREATE INDEX builder_agents_dispatch ON builder_agents (enabled, role);
CREATE INDEX builder_agents_areas    ON builder_agents USING gin (areas);

ALTER TABLE builder_brains
  ADD CONSTRAINT builder_brains_agent_fk
  FOREIGN KEY (agent_slug) REFERENCES builder_agents(slug) ON DELETE CASCADE;

CREATE TABLE builder_fleet_members (
    fleet_id   uuid NOT NULL REFERENCES builder_fleets(id) ON DELETE CASCADE,
    agent_slug text NOT NULL REFERENCES builder_agents(slug) ON DELETE CASCADE,
    is_lead    boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (fleet_id, agent_slug)
);

-- Exactly one lead per fleet.
CREATE UNIQUE INDEX builder_fleet_members_one_lead
  ON builder_fleet_members (fleet_id) WHERE is_lead;

CREATE TABLE builder_brain_grants (
    namespace  text NOT NULL,
    agent_slug text NOT NULL REFERENCES builder_agents(slug) ON DELETE CASCADE,
    can_read   boolean NOT NULL DEFAULT true,
    can_write  boolean NOT NULL DEFAULT false,
    PRIMARY KEY (namespace, agent_slug)
);

-- ---------------------------------------------------------------------------
-- 3. Issue plane
-- ---------------------------------------------------------------------------

CREATE TABLE builder_issue_counters (
    scope    text PRIMARY KEY DEFAULT 'default',
    next_seq integer NOT NULL DEFAULT 1
);
INSERT INTO builder_issue_counters (scope, next_seq) VALUES ('default', 1);

CREATE TABLE builder_releases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version         text NOT NULL UNIQUE,   -- CalVer 2026.08.07.1
    notes_md        text NOT NULL DEFAULT '',
    cut_by_user_id  uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builder_decisions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id             uuid NOT NULL,
    run_id               uuid,
    agent_slug           text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    kind                 builder_decision_kind NOT NULL,
    state                builder_decision_state NOT NULL DEFAULT 'pending',
    question_md          text NOT NULL,
    context_md           text NOT NULL DEFAULT '',
    -- [{label,value}]; empty => free-text answer.
    options              jsonb NOT NULL DEFAULT '[]'::jsonb,
    recommendation       text NOT NULL DEFAULT '',
    urgency              text NOT NULL DEFAULT 'normal'
                           CHECK (urgency IN ('low','normal','critical')),
    answer               jsonb,
    answer_text          text NOT NULL DEFAULT '',
    target_user_id       uuid,
    answered_by_user_id  uuid,
    question_comment_id  uuid,
    answer_comment_id    uuid,
    notified_user_ids    uuid[] NOT NULL DEFAULT '{}',
    timeout_at           timestamptz NOT NULL DEFAULT now() + interval '48 hours',
    asked_at             timestamptz NOT NULL DEFAULT now(),
    answered_at          timestamptz
);

CREATE TABLE builder_issues (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number                   integer NOT NULL UNIQUE,
    title                    text NOT NULL CHECK (length(title) <= 255),
    -- UNTRUSTED. Wrapped in injection markers before it reaches any prompt.
    body_md                  text NOT NULL DEFAULT '',
    status                   builder_issue_status   NOT NULL DEFAULT 'triage',
    type                     builder_issue_type     NOT NULL DEFAULT 'bug',
    priority                 builder_issue_priority NOT NULL DEFAULT 'normal',
    -- The routing key: auth, billing, onboarding...
    area                     text NOT NULL DEFAULT '',
    labels                   text[] NOT NULL DEFAULT '{}',
    -- base-26 LexoRank; never ends in 'a' so subdivision is infinite.
    board_rank               text NOT NULL,
    human_only               boolean NOT NULL DEFAULT false,
    source                   text NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual','feedback','self_heal','agent','import')),
    route                    text NOT NULL DEFAULT '' CHECK (length(route) <= 512),
    page_url                 text NOT NULL DEFAULT '',
    locale                   text NOT NULL DEFAULT 'en',
    reporter_kind            builder_actor_kind NOT NULL,
    reporter_user_id         uuid,
    reporter_agent_id        text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    reporter_email           text NOT NULL DEFAULT '',
    assignee_user_id         uuid,
    assignee_agent_id        text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    claimed_by_run_id        uuid,
    -- The fencing token. Every write on behalf of a run carries it.
    claim_token              uuid,
    lease_expires_at         timestamptz,       -- NULL = unleased
    blocked_on_decision_id   uuid REFERENCES builder_decisions(id) ON DELETE SET NULL,
    attempt_count            integer NOT NULL DEFAULT 0,
    max_attempts             integer NOT NULL DEFAULT 3,
    routing_hops             integer NOT NULL DEFAULT 0,   -- A->B->A bounce guard
    branch                   text NOT NULL DEFAULT '',
    pr_url                   text NOT NULL DEFAULT '',
    head_sha                 text NOT NULL DEFAULT '',
    pr_number                integer,
    last_verdict             jsonb,
    vote_count               integer NOT NULL DEFAULT 0,
    comment_count            integer NOT NULL DEFAULT 0,
    parent_id                uuid REFERENCES builder_issues(id) ON DELETE SET NULL,
    release_id               uuid REFERENCES builder_releases(id) ON DELETE SET NULL,
    status_entered_at        timestamptz NOT NULL DEFAULT now(),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    closed_at                timestamptz,

    CONSTRAINT builder_issues_one_assignee
      CHECK (assignee_user_id IS NULL OR assignee_agent_id IS NULL)
);

ALTER TABLE builder_decisions
  ADD CONSTRAINT builder_decisions_issue_fk
  FOREIGN KEY (issue_id) REFERENCES builder_issues(id) ON DELETE CASCADE;

-- THE CLAIM INDEX. autopilot has none, so its claim full-scans on every 15s
-- tick, per runner. This is the single most important index in the schema.
CREATE INDEX builder_issues_claimable ON builder_issues (priority, created_at)
  WHERE status = 'ready' AND human_only = false AND blocked_on_decision_id IS NULL;
CREATE INDEX builder_issues_lease ON builder_issues (lease_expires_at)
  WHERE status = 'in_progress';
CREATE INDEX builder_issues_route ON builder_issues (route, created_at DESC);
CREATE INDEX builder_issues_board ON builder_issues (status, board_rank);
CREATE INDEX builder_issues_agent ON builder_issues (assignee_agent_id)
  WHERE assignee_agent_id IS NOT NULL;
CREATE INDEX builder_issues_fts ON builder_issues
  USING gin (to_tsvector('simple', title || ' ' || body_md));

-- ONE open question per issue, ever. Enforced by the database, not convention.
CREATE UNIQUE INDEX builder_decisions_one_pending
  ON builder_decisions (issue_id) WHERE state = 'pending';
CREATE INDEX builder_decisions_open ON builder_decisions (target_user_id, asked_at)
  WHERE state = 'pending';
CREATE INDEX builder_decisions_expiry ON builder_decisions (timeout_at)
  WHERE state = 'pending';

CREATE TABLE builder_issue_comments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id        uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    author_kind     builder_actor_kind NOT NULL,
    author_user_id  uuid,
    author_agent_id text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    author_email    text NOT NULL DEFAULT '',
    body_md         text NOT NULL,
    -- Thread root.
    parent_id       uuid REFERENCES builder_issue_comments(id) ON DELETE CASCADE,
    -- Quote card. Deleting the quoted comment drops the card; it must never
    -- cascade away the discussion that replied to it.
    reply_to_id     uuid REFERENCES builder_issue_comments(id) ON DELETE SET NULL,
    decision_id     uuid REFERENCES builder_decisions(id) ON DELETE SET NULL,
    run_id          uuid,
    mentions        text[] NOT NULL DEFAULT '{}',
    edited_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_issue_comments_issue  ON builder_issue_comments (issue_id, created_at);
CREATE INDEX builder_issue_comments_thread ON builder_issue_comments (issue_id, parent_id);

CREATE TABLE builder_issue_attachments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null while pre-uploaded: the anonymous reporter uploads before the issue
    -- exists, then the create call adopts the rows.
    issue_id           uuid REFERENCES builder_issues(id) ON DELETE CASCADE,
    comment_id         uuid REFERENCES builder_issue_comments(id) ON DELETE CASCADE,
    kind               text NOT NULL
                         CHECK (kind IN ('screenshot','image','video','recording','file','dom_snapshot')),
    -- Object storage, never base64 in a TEXT column: a 100MB screen recording
    -- is the highest-signal attachment there is and must not be inlined.
    storage_key        text NOT NULL,
    file_name          text NOT NULL DEFAULT '',
    content_type       text NOT NULL DEFAULT '',
    size_bytes         bigint NOT NULL DEFAULT 0,
    sha256             text NOT NULL DEFAULT '',
    width              integer,
    height             integer,
    duration_ms        integer,
    poster_key         text NOT NULL DEFAULT '',
    uploaded_by_user_id uuid,
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX builder_issue_attachments_dedup
  ON builder_issue_attachments (issue_id, sha256) WHERE sha256 <> '';

CREATE TABLE builder_issue_pins (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id                 uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    ordinal                  smallint NOT NULL DEFAULT 0,
    -- Resolution strategies, most durable first. testid survives both restyle
    -- and reorder; css_path survives neither reliably.
    testid                   text NOT NULL DEFAULT '',
    css_path                 text NOT NULL DEFAULT '' CHECK (length(css_path) <= 512),
    aria_role                text NOT NULL DEFAULT '',
    aria_name                text NOT NULL DEFAULT '',
    text_hint                text NOT NULL DEFAULT '' CHECK (length(text_hint) <= 120),
    tag_name                 text NOT NULL DEFAULT '',
    -- Viewport FRACTIONS, not pixels, so the rect survives a resize.
    rect_x                   real NOT NULL DEFAULT 0,
    rect_y                   real NOT NULL DEFAULT 0,
    rect_w                   real NOT NULL DEFAULT 0,
    rect_h                   real NOT NULL DEFAULT 0,
    scroll_y                 integer NOT NULL DEFAULT 0,
    viewport_w               integer NOT NULL DEFAULT 0,
    viewport_h               integer NOT NULL DEFAULT 0,
    dpr                      real NOT NULL DEFAULT 1,
    href                     text NOT NULL DEFAULT '' CHECK (length(href) <= 2048),
    dom_path_digest          text NOT NULL DEFAULT '',
    strategies_verified      text[] NOT NULL DEFAULT '{}',
    -- Telemetry is the only way anchor brittleness becomes measurable rather
    -- than folklore. This is why pins are a table and not a jsonb blob.
    resolved_state           text NOT NULL DEFAULT 'unknown'
                               CHECK (resolved_state IN ('unknown','exact','fuzzy','watching','lost')),
    resolved_by              text NOT NULL DEFAULT '',
    resolve_attempts         integer NOT NULL DEFAULT 0,
    resolve_hits             integer NOT NULL DEFAULT 0,
    last_resolved_at         timestamptz,
    screenshot_attachment_id uuid REFERENCES builder_issue_attachments(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_issue_pins_issue ON builder_issue_pins (issue_id, ordinal);

CREATE TABLE builder_issue_activity (
    id             bigserial PRIMARY KEY,
    issue_id       uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    action         text NOT NULL CHECK (action IN (
                     'created','moved','assigned','commented','edited','linked','unlinked',
                     'attached','pinned','claimed','released','blocked','unblocked',
                     'approved','rejected','pushed','pr_opened','reviewed','parked')),
    actor_kind     builder_actor_kind NOT NULL,
    actor_user_id  uuid,
    actor_agent_id text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
    run_id         uuid,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_issue_activity_issue ON builder_issue_activity (issue_id, created_at DESC);

CREATE TABLE builder_issue_links (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_issue_id uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    to_issue_id   uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    link_type     builder_link_type NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT builder_issue_links_no_self CHECK (from_issue_id <> to_issue_id),
    CONSTRAINT builder_issue_links_uniq UNIQUE (from_issue_id, to_issue_id, link_type)
);

CREATE TABLE builder_issue_votes (
    issue_id       uuid NOT NULL REFERENCES builder_issues(id) ON DELETE CASCADE,
    voter_user_id  uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (issue_id, voter_user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Runs — one row per Claude Code session
-- ---------------------------------------------------------------------------

CREATE TABLE builder_runs (
    -- Also the --session-id. Minted by us so the mapping is durable BEFORE the
    -- process starts; a crash between spawn and first write still has a row.
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id              uuid REFERENCES builder_issues(id) ON DELETE CASCADE,
    agent_slug            text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    delegated_by          text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    kind                  text NOT NULL
                            CHECK (kind IN ('triage','implement','review','answer','fleet_gen')),
    status                builder_run_status NOT NULL DEFAULT 'queued',
    attempt               integer NOT NULL DEFAULT 1,
    resumed_from          uuid REFERENCES builder_runs(id) ON DELETE SET NULL,
    claim_token           uuid NOT NULL,
    claimed_by            text NOT NULL DEFAULT '',   -- host:pid:nonce
    heartbeat_at          timestamptz,
    exec_provider         text NOT NULL DEFAULT '',
    workspace_ref         text NOT NULL DEFAULT '',
    worktree_path         text NOT NULL DEFAULT '',
    branch                text NOT NULL DEFAULT '',
    base_sha              text NOT NULL DEFAULT '',
    head_sha              text NOT NULL DEFAULT '',
    -- Written by the agent; the RUNNER derives every fact it acts on from the
    -- git diff, never from this blob.
    verdict               jsonb,
    gate_result           jsonb,
    files_changed         integer NOT NULL DEFAULT 0,
    lines_added           integer NOT NULL DEFAULT 0,
    lines_removed         integer NOT NULL DEFAULT 0,
    pushed                boolean NOT NULL DEFAULT false,
    pr_url                text NOT NULL DEFAULT '',
    cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
    input_tokens          bigint NOT NULL DEFAULT 0,
    output_tokens         bigint NOT NULL DEFAULT 0,
    cache_creation_tokens bigint NOT NULL DEFAULT 0,
    cache_read_tokens     bigint NOT NULL DEFAULT 0,
    num_turns             integer NOT NULL DEFAULT 0,
    terminal_reason       text NOT NULL DEFAULT ''
                            CHECK (terminal_reason IN ('','completed','budget_exhausted','max_turns','blocked','lease_lost','error')),
    error                 text NOT NULL DEFAULT '',
    journal_path          text NOT NULL DEFAULT '',
    started_at            timestamptz,
    ended_at              timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_runs_issue     ON builder_runs (issue_id, created_at DESC);
CREATE INDEX builder_runs_live      ON builder_runs (heartbeat_at) WHERE status = 'running';
CREATE INDEX builder_runs_agent     ON builder_runs (agent_slug, created_at DESC);

ALTER TABLE builder_issues
  ADD CONSTRAINT builder_issues_run_fk
  FOREIGN KEY (claimed_by_run_id) REFERENCES builder_runs(id) ON DELETE SET NULL;
ALTER TABLE builder_decisions
  ADD CONSTRAINT builder_decisions_run_fk
  FOREIGN KEY (run_id) REFERENCES builder_runs(id) ON DELETE SET NULL;
ALTER TABLE builder_issue_comments
  ADD CONSTRAINT builder_issue_comments_run_fk
  FOREIGN KEY (run_id) REFERENCES builder_runs(id) ON DELETE SET NULL;

CREATE TABLE builder_run_events (
    id                bigserial PRIMARY KEY,
    run_id            uuid NOT NULL REFERENCES builder_runs(id) ON DELETE CASCADE,
    seq               integer NOT NULL,
    type              text NOT NULL CHECK (type IN (
                        'system.init','assistant','tool_use','tool_result',
                        'api_retry','subagent','result','stderr')),
    -- Rebuilds the subagent tree from a flat stream.
    parent_tool_use_id text NOT NULL DEFAULT '',
    -- REDACTED before insert. A transcript is the easiest place to leak a
    -- secret that the vault was careful about.
    payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT builder_run_events_seq UNIQUE (run_id, seq)
);
-- Retention: rows older than 30 days are deleted by the reaper.
CREATE INDEX builder_run_events_age ON builder_run_events (created_at);

CREATE TABLE builder_agent_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_slug   text NOT NULL REFERENCES builder_agents(slug) ON DELETE CASCADE,
    -- HASH ONLY. The raw bat_… is returned exactly once, at mint time.
    -- cabrain stores tokens in plaintext and lets any admin list them. Do not.
    token_sha256 text NOT NULL UNIQUE,
    token_prefix text NOT NULL DEFAULT '',
    scopes       text[] NOT NULL DEFAULT '{}',
    run_id       uuid REFERENCES builder_runs(id) ON DELETE CASCADE,
    expires_at   timestamptz NOT NULL,   -- 5 minutes for run tokens
    revoked_at   timestamptz,
    last_used_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_agent_tokens_live ON builder_agent_tokens (expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Cost control
-- ---------------------------------------------------------------------------

CREATE TABLE builder_spend (
    day           date NOT NULL,
    scope         text NOT NULL CHECK (scope IN ('fleet','agent','issue')),
    scope_ref     text NOT NULL DEFAULT '',
    cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
    input_tokens  bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    run_count     integer NOT NULL DEFAULT 0,
    PRIMARY KEY (day, scope, scope_ref)
);

CREATE TABLE builder_budgets (
    scope        text NOT NULL CHECK (scope IN ('fleet','agent','issue')),
    scope_ref    text NOT NULL DEFAULT '',
    daily_usd    numeric(10,4) NOT NULL DEFAULT 25.00,
    per_run_usd  numeric(10,4) NOT NULL DEFAULT 2.00,
    per_issue_usd numeric(10,4) NOT NULL DEFAULT 6.00,
    enabled      boolean NOT NULL DEFAULT true,
    PRIMARY KEY (scope, scope_ref)
);
INSERT INTO builder_budgets (scope, scope_ref) VALUES ('fleet', '');

-- ---------------------------------------------------------------------------
-- 6. Memory (pgvector driver)
-- ---------------------------------------------------------------------------
-- The vector column is added by 0002 once the pgvector extension is confirmed,
-- so a Postgres without pgvector still boots with driver='none'.

CREATE TABLE builder_memories (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace    text NOT NULL,
    content      text NOT NULL,
    source_kind  text NOT NULL DEFAULT '',
    -- Identity for upsert: re-retaining the same source updates in place
    -- rather than growing a duplicate.
    source_ref   text NOT NULL DEFAULT '',
    importance   real NOT NULL DEFAULT 0.5,
    access_count integer NOT NULL DEFAULT 0,
    valid_at     timestamptz NOT NULL DEFAULT now(),
    invalid_at   timestamptz,
    superseded_by uuid REFERENCES builder_memories(id) ON DELETE SET NULL,
    metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
    tsv          tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_memories_ns  ON builder_memories (namespace, created_at DESC);
CREATE INDEX builder_memories_bm  ON builder_memories USING gin (tsv);
CREATE UNIQUE INDEX builder_memories_ref
  ON builder_memories (namespace, source_ref) WHERE source_ref <> '';

CREATE TABLE builder_memory_gaps (
    id         bigserial PRIMARY KEY,
    namespace  text NOT NULL,
    -- Lowercased, whitespace-collapsed, so near-identical misses coalesce.
    norm_query text NOT NULL,
    query      text NOT NULL,
    hits       integer NOT NULL DEFAULT 1,
    status     text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','indexed','dismissed')),
    resolution text NOT NULL DEFAULT '',
    first_seen timestamptz NOT NULL DEFAULT now(),
    last_seen  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT builder_memory_gaps_uniq UNIQUE (namespace, norm_query)
);

-- ---------------------------------------------------------------------------
-- 7. Vault
-- ---------------------------------------------------------------------------

CREATE TABLE builder_secrets (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope             text NOT NULL DEFAULT 'project' CHECK (scope IN ('project','agent')),
    agent_slug        text REFERENCES builder_agents(slug) ON DELETE CASCADE,
    name              text NOT NULL,
    kind              text NOT NULL DEFAULT '',
    ciphertext        text NOT NULL,          -- v1.<iv_b64>.<tag_b64>.<ct_b64>
    -- AES-GCM additional authenticated data, bound to the row's identity:
    -- <scope>:<agent_slug>:<name>. A ciphertext copied into another row FAILS
    -- to decrypt. This is what makes row-swapping a non-attack.
    aad               text NOT NULL,
    hint              text NOT NULL DEFAULT '',   -- masked sk-…a1b2, non-reversible
    version           integer NOT NULL DEFAULT 1,
    current           boolean NOT NULL DEFAULT true,
    created_by_user_id uuid,
    rotated_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT builder_secrets_uniq UNIQUE (scope, agent_slug, name, version)
);
CREATE UNIQUE INDEX builder_secrets_current
  ON builder_secrets (scope, coalesce(agent_slug,''), name) WHERE current;

CREATE TABLE builder_secret_grants (
    secret_id           uuid NOT NULL REFERENCES builder_secrets(id) ON DELETE CASCADE,
    agent_slug          text NOT NULL REFERENCES builder_agents(slug) ON DELETE CASCADE,
    -- Reveal is its OWN grant, not implied by write. cabrain requires WRITE on
    -- a brain to reveal a secret, so a read-only agent cannot read a
    -- credential — backwards, and not copied here.
    can_reveal          boolean NOT NULL DEFAULT false,
    can_list            boolean NOT NULL DEFAULT true,
    max_reveals_per_run integer NOT NULL DEFAULT 3,
    granted_by          uuid,
    expires_at          timestamptz,
    PRIMARY KEY (secret_id, agent_slug)
);

CREATE TABLE builder_secret_reads (
    id         bigserial PRIMARY KEY,
    secret_id  uuid NOT NULL REFERENCES builder_secrets(id) ON DELETE CASCADE,
    agent_slug text,
    run_id     uuid,
    issue_id   uuid,
    user_id    uuid,
    ip         inet,
    outcome    text NOT NULL CHECK (outcome IN ('ok','denied','rate_limited','expired')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_secret_reads_secret ON builder_secret_reads (secret_id, created_at DESC);
CREATE INDEX builder_secret_reads_run    ON builder_secret_reads (run_id);

-- ---------------------------------------------------------------------------
-- 8. Notifications, wizard, ingress
-- ---------------------------------------------------------------------------

CREATE TABLE builder_notifications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id uuid NOT NULL,
    kind              text NOT NULL,
    severity          text NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info','warn','action_required')),
    title             text NOT NULL,
    preview           text NOT NULL DEFAULT '',
    link              text NOT NULL DEFAULT '',
    issue_id          uuid REFERENCES builder_issues(id) ON DELETE CASCADE,
    decision_id       uuid REFERENCES builder_decisions(id) ON DELETE CASCADE,
    actor_agent_id    text REFERENCES builder_agents(slug) ON DELETE SET NULL,
    sound             text NOT NULL DEFAULT ''
                        CHECK (sound IN ('','alert-blocked','alert-mention','chime')),
    urgency           text NOT NULL DEFAULT 'normal',
    read_at           timestamptz,
    delivered_via     text[] NOT NULL DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_notifications_unread
  ON builder_notifications (recipient_user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE builder_push_subscriptions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL,
    endpoint     text NOT NULL UNIQUE,
    p256dh       text NOT NULL,
    auth         text NOT NULL,
    user_agent   text NOT NULL DEFAULT '',
    last_used_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builder_notification_prefs (
    user_id         uuid PRIMARY KEY,
    push_blocked    boolean NOT NULL DEFAULT true,
    push_mentions   boolean NOT NULL DEFAULT true,
    push_assigned   boolean NOT NULL DEFAULT true,
    push_run_failed boolean NOT NULL DEFAULT false,
    sound_enabled   boolean NOT NULL DEFAULT true,
    sound_volume    real NOT NULL DEFAULT 0.6 CHECK (sound_volume BETWEEN 0 AND 1),
    quiet_from      time,
    quiet_to        time
    -- action_required ignores quiet hours; enforced in Go, not here.
);

CREATE TABLE builder_setup_state (
    id               text PRIMARY KEY DEFAULT 'singleton',
    step             text NOT NULL DEFAULT 'welcome',
    answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
    preflight        jsonb NOT NULL DEFAULT '{}'::jsonb,
    plan_md          text NOT NULL DEFAULT '',
    fleet_id         uuid REFERENCES builder_fleets(id) ON DELETE SET NULL,
    generator_run_id uuid REFERENCES builder_runs(id) ON DELETE SET NULL,
    completed_at     timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT builder_setup_state_singleton CHECK (id = 'singleton')
);
INSERT INTO builder_setup_state (id) VALUES ('singleton');

CREATE TABLE builder_feedback_rate (
    ip_hash      text NOT NULL,
    window_start timestamptz NOT NULL,
    count        integer NOT NULL DEFAULT 0,
    PRIMARY KEY (ip_hash, window_start)
);
-- Policy (enforced in Go): 5 reports / 10 min / ip_hash, 60 / day.
-- autopilot's public feedback ingress has no rate limit at all.

COMMIT;
