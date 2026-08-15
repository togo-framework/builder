package builder

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"

	"github.com/togo-framework/builder/customapps"
	"github.com/togo-framework/builder/internal/brain"
	"github.com/togo-framework/builder/internal/chat"
	"github.com/togo-framework/builder/internal/deploy"
	"github.com/togo-framework/builder/internal/docs"
	"github.com/togo-framework/builder/internal/fleet"
	"github.com/togo-framework/builder/internal/integrations"
	"github.com/togo-framework/builder/internal/issues"
	mcpsrv "github.com/togo-framework/builder/internal/mcp"
	"github.com/togo-framework/builder/internal/notify"
	"github.com/togo-framework/builder/internal/orchestrator"
	"github.com/togo-framework/builder/internal/runner"
	"github.com/togo-framework/builder/internal/setup"
	"github.com/togo-framework/builder/internal/skills"
	"github.com/togo-framework/builder/internal/sources"
	"github.com/togo-framework/builder/internal/term"
	"github.com/togo-framework/builder/internal/vault"
)

// mountAuthed mounts a builder surface behind the auth plugin's session
// middleware, and FAILS CLOSED: when auth is unavailable the surface is not
// mounted at all rather than served to anonymous callers.
//
// Every builder API surface must go through here. The terminal and the custom-app
// registry already did this by hand, and the comment above the terminal mount
// stated the reason plainly — "no builder route is session-authenticated; the
// global chain is recovery, requestLogger and CORS; auth.Middleware is opt-in
// per route and nothing here opted in". That was true of the OTHER twelve mounts
// too, and it was found in production: /api/builder/brain, /issues, /skills,
// /docs, /fleet, /preflight and /_meta all answered anonymous callers over the
// public internet, and the write halves of those services (POST /issues,
// POST /issues/bulk-delete, POST /skills/import, DELETE /skills/{name},
// POST /docs, POST /deploy/issues/{n}/deploy) accepted anonymous mutations.
//
// A read-only leak of an empty database looks harmless; it stops being harmless
// the moment a source ingests anything. The write half was never harmless: a
// skill is an instruction an agent obeys, so anonymous skill import is remote
// prompt injection into a loop that runs Claude Code with shell access.
//
// Centralised rather than repeated so a NEW mount cannot silently omit it: the
// bug was never that someone removed a guard, it was that adding a route did not
// require thinking about one.
func mountAuthed(k *togo.Kernel, pattern string, fn func(chi.Router)) {
	as, ok := auth.FromKernel(k)
	if !ok || as == nil {
		if k.Log != nil {
			k.Log.Warn("builder: surface NOT mounted — the auth plugin is unavailable, "+
				"and builder surfaces are not served unauthenticated", "pattern", pattern)
		}
		return
	}
	k.Router.Route(pattern, func(r chi.Router) {
		r.Use(as.Middleware)
		fn(r)
	})
}

// mountAuthedGet is mountAuthed for a single handler mounted with Get rather
// than a Routes group — preflight and _meta, both of which describe the host's
// environment and so are operator information, not public information.
func mountAuthedGet(k *togo.Kernel, pattern string, h http.HandlerFunc) {
	mountAuthed(k, pattern, func(r chi.Router) { r.Get("/", h) })
}

// ---------------------------------------------------------------------------
// Phase 0 wires the surfaces that exist today: the vault (self-contained, and a
// dependency of everything that holds a credential) and the preflight probes
// (which the setup wizard and the CLI both call through one code path).
//
// The remaining providers register their names and health surface now so boot
// order, disable-by-env and the /api/builder/_meta contract are exercised from
// the first commit. Their behaviour lands in the phases named below.
// ---------------------------------------------------------------------------

func provideVault(k *togo.Kernel) error {
	svc, err := vault.New(k)
	if err != nil {
		// A missing or malformed BUILDER_VAULT_KEY is fatal: booting with a
		// broken vault means every later secret read fails at the worst
		// possible moment instead of here.
		return err
	}
	k.Set(ProviderVault, svc)

	// The HTTP surface needs the database for audit; without one the crypto is
	// still available in-process but nothing is exposed, because a reveal that
	// cannot be recorded must not happen.
	if db, dbErr := k.SQL(context.Background()); dbErr == nil {
		store := vault.NewStore(svc, db, k.Log)
		k.Set(ProviderVault+".store", store)
		mountAuthed(k, "/api/builder/vault", store.Routes)

		// OAuth app credentials resolve from the vault, falling back to the
		// environment. Installed here, in the vault's own provider, because
		// this is the first moment a decrypting store exists — and an
		// integrations package that reached back for one would invert the
		// dependency for no gain.
		integrations.SetCredentialStore(store)
		integrations.SetCredentialWriter(store)
	} else if k.Log != nil {
		k.Log.Warn("vault HTTP surface disabled: no database", "err", dbErr)
	}
	return nil
}

func provideBrain(k *togo.Kernel) error {
	// pgvector in the app's own Postgres. cabrain in-process is the recommended
	// upgrade; the hosted instance stays opt-in only (it answered 502 during
	// research, runs with no HA, and resolves tokenless callers as admin).
	//
	// This used to be `k.Set(ProviderBrain, nil)` — a stub. The store, its
	// schema and its tests all existed, so everything LOOKED finished, but
	// nothing ever constructed it: builder_memories stayed empty forever and
	// every agent started each run knowing nothing.
	db, err := k.SQL(context.Background())
	if err != nil {
		k.Set(ProviderBrain, nil)
		return nil // no database: the loop still runs, just without memory
	}
	// A real model when one is configured AND answering, the hash embedder
	// otherwise.
	//
	// HashEmbedder has no semantic content: "the login button is broken" and
	// "authentication fails" share no tokens and embed orthogonally, so recall
	// over it is keyword overlap wearing relevance's clothes. Which one is in
	// use is logged at boot, because "is this real recall?" must be answerable
	// without reading the source.
	//
	// The endpoint is PROBED before it is accepted. A configured-but-unreachable
	// model used to leave the brain with an embedder that failed on every call:
	// each retain warned and stored a NULL vector, so recall silently had no
	// vector arm and nothing said so. Falling back to the hash embedder is worse
	// recall and a working brain, which is the right way round for a harness
	// whose whole premise is that it runs on day 0 with nothing else up.
	var emb brain.Embedder = brain.HashEmbedder{}
	if real := brain.EmbedderFromEnv(); real != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		err := brain.Probe(ctx, real)
		cancel()
		if err != nil {
			// Error, not Warn. The operator asked for semantic recall, is not
			// getting it, and every "related memories" panel is about to show
			// keyword overlap — that is not a footnote.
			k.Log.Error("builder.brain embedding endpoint did not answer — "+
				"FALLING BACK to keyword-only recall", "embedder", real.Name(), "err", err)
		} else {
			emb = real
		}
	}
	store, err := brain.New(db, k.Log, emb)
	if err != nil {
		k.Log.Warn("builder.brain unavailable — agents will run without memory", "err", err)
		k.Set(ProviderBrain, nil)
		return nil
	}

	// Reranking is independent of embedding and degrades independently: without
	// it recall returns the fused order, which is what it has always returned.
	if rr := brain.RerankerFromEnv(os.Getenv("BUILDER_EMBED_URL")); rr != nil && brain.IsSemantic(emb) {
		store.SetReranker(rr)
		k.Log.Info("builder.brain reranking enabled", "reranker", rr.Name())
	} else if rr != nil {
		// Reranking a keyword-overlap candidate set is not wrong, but it spends
		// a model on a list the first pass had no real basis for choosing. Said
		// out loud so it does not read as reranking being broken.
		k.Log.Info("builder.brain reranking configured but idle — " +
			"the candidate set comes from keyword overlap; fix the embedder first")
	}

	k.Set(ProviderBrain, store)
	k.Log.Info("builder.brain ready",
		"embedder", emb.Name(), "dim", emb.Dimensions(), "semantic", brain.IsSemantic(emb))
	if !brain.IsSemantic(emb) {
		k.Log.Info("builder.brain recall is KEYWORD-ONLY — " +
			"set BUILDER_EMBED_URL to a /v1/embeddings endpoint for semantic recall")
		return nil
	}
	startReembedBackfill(k, store)
	return nil
}

// startReembedBackfill rewrites memories left over from a previous embedder.
//
// In the background, and never blocking boot: it is a long job over a network
// service, the brain is completely usable while it runs, and a harness that
// takes four minutes to start because it is re-embedding ten thousand rows is a
// harness people stop starting.
func startReembedBackfill(k *togo.Kernel, store *brain.Store) {
	if !brain.BackfillEnabled() {
		return
	}
	pending, err := store.PendingReembed(context.Background())
	if err != nil {
		k.Log.Warn("builder.brain could not count memories to re-embed", "err", err)
		return
	}
	if pending == 0 {
		return
	}
	k.Log.Info("builder.brain re-embedding memories written by a previous embedder",
		"pending", pending, "note", "they stay findable by keyword until this completes")

	go func() {
		start := time.Now()
		res, err := store.BackfillEmbeddings(context.Background(), brain.BackfillPause())
		if err != nil {
			// Partial progress is kept, not rolled back. The remaining rows are
			// found by the same predicate on the next boot.
			k.Log.Warn("builder.brain re-embedding stopped early",
				"written", res.Written, "failed", res.Failed, "err", err)
			return
		}
		k.Log.Info("builder.brain re-embedding complete",
			"written", res.Written, "failed", res.Failed, "took", time.Since(start).Round(time.Second))
	}()
}

func provideNotify(k *togo.Kernel) error {
	db, err := k.SQL(context.Background())
	if err != nil {
		if k.Log != nil {
			k.Log.Warn("builder.notify disabled: no database", "err", err)
		}
		k.Set(ProviderNotify, nil)
		return nil
	}
	svc := notify.New(db, k.Log)
	k.Set(ProviderNotify, svc)
	mountAuthed(k, "/api/builder/notify", svc.Routes)
	return nil
}

func provideIssues(k *togo.Kernel) error {
	db, err := k.SQL(context.Background())
	if err != nil {
		// Without a database there is no issue plane. Warn rather than fail the
		// boot, so the rest of the app still serves — but say so loudly.
		if k.Log != nil {
			k.Log.Warn("builder.issues disabled: no database", "err", err)
		}
		return nil
	}

	var origins []string
	if raw := os.Getenv("BUILDER_FEEDBACK_ORIGINS"); raw != "" {
		origins = strings.Split(raw, ",")
	}

	// Loopback origins are accepted only outside production.
	env := strings.ToLower(os.Getenv("APP_ENV"))
	dev := env == "" || env == "local" || env == "development" || env == "dev"

	svc := issues.New(db, k.Log, origins, dev)
	k.Set(ProviderIssues, svc)
	// Optional: comments are attributed to the signed-in user when the auth
	// plugin is present, and read "anonymous" when it is not.
	if a, ok := k.Get("auth"); ok && a != nil {
		if as, ok := a.(*auth.Service); ok {
			svc.SetAuth(as)
		}
	}
	// The operator's half of the merge gate: verify, merge, and let the dev
	// watcher restart. Mounted next to issues because it acts on an issue.
	mountAuthed(k, "/api/builder/deploy", deploy.New(db, k.Log).Routes)

	// Feedback ingress is mounted FIRST and unauthenticated, on its own path.
	//
	// Order matters: chi matches the more specific pattern regardless, but
	// registering it here keeps the public surface visible at the mount site
	// rather than buried inside a Routes func that every other line on this
	// screen wraps in auth. The guards it does have — origin allowlist and rate
	// limit — live in handleFeedback and are unaffected.
	k.Router.Route("/api/builder/feedback", svc.PublicRoutes)

	mountAuthed(k, "/api/builder", svc.Routes)

	// Serve the SDK bundle so a host page needs one script tag and no build step.
	//
	// From the embedded FS by default: a scaffolded project has no sdk/ source
	// tree, so a filesystem path works here and 404s in every generated app.
	// BUILDER_SDK_DIR still overrides, for developing the widget itself.
	if dir := os.Getenv("BUILDER_SDK_DIR"); dir != "" {
		if _, err := os.Stat(dir); err == nil {
			k.Router.Handle("/sdk/*", noStaleSDK(http.StripPrefix("/sdk/", http.FileServer(http.Dir(dir)))))
			return nil
		}
		if k.Log != nil {
			k.Log.Warn("BUILDER_SDK_DIR does not exist; serving the embedded SDK", "dir", dir)
		}
	}
	if sub, err := SDKFiles(); err == nil {
		k.Router.Handle("/sdk/*", noStaleSDK(http.StripPrefix("/sdk/", http.FileServer(http.FS(sub)))))
	} else if k.Log != nil {
		k.Log.Error("the embedded SDK is unavailable", "err", err)
	}

	// Static assets that are not the widget — today the terminal's icon font.
	//
	// Shipped with the plugin rather than relying on the operator's machine: a
	// zsh prompt draws its separators and language icons from the Private Use
	// Area, and a machine without a Nerd Font renders every one as a box. That
	// worked here only because this laptop happens to have MesloLGS installed,
	// which is exactly the kind of "works for me" that does not survive
	// reaching anyone else.
	if sub, err := AssetFiles(); err == nil {
		k.Router.Handle("/builder-assets/*", http.StripPrefix("/builder-assets/",
			cacheForever(http.FileServer(http.FS(sub)))))
	} else if k.Log != nil {
		k.Log.Error("the embedded assets are unavailable", "err", err)
	}
	return nil
}

// cacheForever marks immutable, content-addressed assets. The font is 600 kB
// and never changes within a build, so re-fetching it on every navigation is
// pure waste.
func cacheForever(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		next.ServeHTTP(w, r)
	})
}

func provideFleet(k *togo.Kernel) error {
	db, err := k.SQL(context.Background())
	if err != nil {
		if k.Log != nil {
			k.Log.Warn("builder.fleet disabled: no database", "err", err)
		}
		return nil
	}
	root := os.Getenv("BUILDER_WORKDIR")
	if root == "" {
		root = "."
	}
	gen := fleet.NewGenerator(db, k.Log, root)
	k.Set(ProviderFleet, gen)

	// The wizard runs before the dashboard is usable, so it mounts here rather
	// than behind the orchestrator.
	wiz := setup.New(db, k.Log, gen)
	mountAuthed(k, "/api/builder/setup", wiz.Routes)

	// The agents roster and profile surface. Mounted alongside setup because it
	// reads the same fleet the wizard generates.
	if db, err := k.SQL(context.Background()); err == nil {
		mountAuthed(k, "/api/builder/fleet", fleet.NewAgentsService(db, k.Log).Routes)
	}

	// The skill catalogue.
	//
	// Rooted at the APP's own directory, not BUILDER_WORKDIR. Skills live in
	// .claude/skills/ next to the application's other Claude configuration,
	// while BUILDER_WORKDIR is the repository AGENTS branch from — and since
	// agents now carry per-agent workdirs spanning more than one repository,
	// there is no single "the agents' repo" to read skills from. Using it here
	// scanned the plugin and found none of the app's 29 skills.
	skillsRoot := os.Getenv("BUILDER_SKILLS_DIR")
	if skillsRoot == "" {
		skillsRoot = "." // the process's own directory: this app
	}
	mountAuthed(k, "/api/builder/skills", skills.New(db, k.Log, skillsRoot).Routes)

	// The reference library. Mounted here because it needs the brain, which is
	// bound by now, and because an upload with nowhere to be ingested is a file
	// store pretending to be a knowledge base.
	if b, ok := k.Get(ProviderBrain); ok && b != nil {
		if bs, ok := b.(*brain.Store); ok {
			mountAuthed(k, "/api/builder/docs", docs.New(db, k.Log, bs).Routes)
		}
	}

	// The project brain's own surface. Every agent brain had a page; the one
	// every agent reads and every source writes into had none.
	if b, ok := k.Get(ProviderBrain); ok && b != nil {
		if bs, ok := b.(*brain.Store); ok {
			mountAuthed(k, "/api/builder/brain", bs.Routes)
			// The advisory surface. Same brain, no tools, no lease.
			mountAuthed(k, "/api/builder/chat", chat.New(db, k.Log, bs).Routes)
		}
	}

	// The MCP surface: this fleet, reachable from any MCP client.
	//
	// Its own prefix, not /api/builder — the issue plane already mounts there
	// and chi panics on a second Mount of the same path (it did, at boot, which
	// is the right place for that to be found). The two servers under it
	// authenticate with their own bearer tokens rather than the dashboard
	// session, because an MCP client cannot present a cookie.
	//
	// Bound into the container as well as mounted, because the custom-app
	// registry boots later and has to hand itself to the MCP tools. Without the
	// binding there is no way to reach this instance, and a second one would
	// mean agents creating apps into a registry the running builder never reads.
	mcpSvc := mcpsrv.New(db, k.Log)
	k.Set(ProviderFleet+".mcp", mcpSvc)
	k.Router.Route("/api/builder/mcp", mcpSvc.Routes)

	// The terminal. Off unless BUILDER_TERMINAL=1, and never in production —
	// the service refuses at construction, so the routes exist but answer 403
	// rather than the mount being conditional. A missing route reads as a bug;
	// a route that says why it will not run reads as a decision.
	termRoot := os.Getenv("BUILDER_WORKDIR")
	if termRoot == "" {
		termRoot = "."
	}
	// Behind auth, and NOT MOUNTED AT ALL if auth is unavailable.
	//
	// The package used to claim it was "session-authenticated by the router it
	// is mounted under, exactly like the rest of the dashboard API". That
	// sentence was accurate and was the bug: no builder route is
	// session-authenticated. The global chain is recovery, requestLogger and
	// CORS — auth.Middleware is opt-in per route and nothing here opted in. An
	// adversarial review found it: with BUILDER_TERMINAL=1, anyone who could
	// reach the port had an unauthenticated shell running as this process, with
	// its whole environment — the operator's gh and claude credentials included.
	// The default listen address is :8080 on all interfaces, so that is the LAN,
	// not loopback.
	//
	// Failing closed matters more here than anywhere else in the plugin: an
	// absent terminal is a nuisance, an unauthenticated one is a compromise.
	if as, ok := auth.FromKernel(k); ok && as != nil {
		t := term.New(db, k.Log, termRoot)
		k.Router.Route("/api/builder/term", func(r chi.Router) {
			r.Use(as.Middleware, as.RequireRole("admin"))
			t.Routes(r)
		})
	} else {
		k.Log.Warn("builder.terminal NOT mounted: the auth plugin is unavailable, and an unauthenticated shell will not be served")
	}

	// Integrations — the Connections app's catalogue, status probes and the
	// terminal connect flow.
	//
	// Behind the SAME admin gate as the terminal, and failing closed for the
	// same reason: /connect runs a command in a tmux session on this machine.
	// The command itself always comes from the registry and never from the
	// request (see integrations.Service.run, and the test that pins it), so
	// this is not a shell — but it does start an authenticated vendor login as
	// the operator, and that is not something to serve to whoever can reach the
	// port.
	if as, ok := auth.FromKernel(k); ok && as != nil {
		ints := integrations.New(k.Log, integrations.NewTmux(termRoot), integrations.SQLOAuthStore{DB: db}).
			WithTokens(integrations.NewTokens(db))
		k.Router.Route("/api/builder/integrations", func(r chi.Router) {
			r.Use(as.Middleware, as.RequireRole("admin"))
			ints.Routes(r)
		})
	} else {
		k.Log.Warn("builder.integrations NOT mounted: the auth plugin is unavailable")
	}
	return nil
}

// provideSources mounts the ingestion registry and starts its scheduler.
//
// Everything in internal/sources was unreachable before this: the registry
// could build a connector, the scheduler could lease and run one, and nothing
// constructed either. A subsystem with no provider is dead code that compiles.
//
// NOT gated on BUILDER_RUNNER. That flag exists because the agent loop spends
// money on model calls; a source spends nobody's budget and every row is
// created disabled (0011 makes `enabled` DEFAULT false), so the only sources
// that ever run are ones an operator deliberately switched on. Gating this on
// the agent loop would mean a source you enabled silently never collecting.
func provideSources(k *togo.Kernel) error {
	db, err := k.SQL(context.Background())
	if err != nil {
		if k.Log != nil {
			k.Log.Warn("builder.sources disabled: no database", "err", err)
		}
		k.Set(ProviderSources, nil)
		return nil
	}

	// The brain is the only place a source writes, and the vault the only place
	// it reads a credential from. Without both, the surface would accept a
	// configuration it could never run.
	b, _ := k.Get(ProviderBrain)
	bs, okBrain := b.(*brain.Store)
	v, _ := k.Get(ProviderVault + ".store")
	vs, okVault := v.(*vault.Store)
	if !okBrain || bs == nil {
		k.Log.Warn("builder.sources disabled: the brain is unavailable, so there is nowhere to collect into")
		k.Set(ProviderSources, nil)
		return nil
	}
	if !okVault || vs == nil {
		k.Log.Warn("builder.sources disabled: the vault is unavailable, and a source reads its credentials by name")
		k.Set(ProviderSources, nil)
		return nil
	}

	// Install the OAuth token source BEFORE the scheduler starts.
	//
	// Ordering is load-bearing: sources.SetTokens is a package-level seam (see
	// internal/sources/oauth.go), and a Gmail or Calendar collector that runs
	// before it is set fails with ErrNoTokens. store.Run below is what starts
	// claiming rows, so anything after this line is safe and anything before it
	// is a race.
	sources.SetTokens(integrations.NewTokens(db))

	store := sources.New(db, k.Log, bs, vs)
	k.Set(ProviderSources, store)

	// Smart connect: one model call plans, this store executes.
	//
	// Both halves are installed here rather than in the integrations provider
	// because THIS is where the store exists — and the store is the piece that
	// validates and inserts, so wiring it from anywhere else would mean handing
	// the same object to two owners.
	integrations.SetPlanner(integrations.SessionPlanner{Log: k.Log})
	integrations.SetCreator(store)
	mountAuthed(k, "/api/builder/sources", store.Routes)

	// Detached, like the orchestrator: the schedule outlives any request.
	go store.Run(context.Background())
	k.Log.Info("builder.sources running", "kinds", strings.Join(append(sources.Kinds(), "sql"), ", "))
	return nil
}

// provideApps mounts the custom-app registry: screens a user added, discovered
// at boot rather than named in any file here.
//
// Two properties are load-bearing and both are enforced below rather than by
// convention:
//
//   - Nothing a custom app does can fail this boot. Scan swallows every
//     per-app failure into a problems list, so a malformed app.json costs one
//     tile. The provider returns nil in every path.
//
//   - The surface fails CLOSED when auth is unavailable. This serves
//     third-party JavaScript and accepts writes to a file on disk, and the
//     terminal already taught this plugin what an unauthenticated surface on a
//     :8080 bound to every interface costs. An absent feature is a nuisance;
//     an unauthenticated one that serves attacker-supplied script into an
//     authenticated origin is a compromise.
func provideApps(k *togo.Kernel) error {
	db, err := k.SQL(context.Background())
	if err != nil {
		// Not fatal, and not even a reason to skip: a drop-in app needs no
		// database. Compiled apps are handed a nil DB and told to check it.
		db = nil
		if k.Log != nil {
			k.Log.Warn("builder.apps: no database; custom apps receive a nil DB handle", "err", err)
		}
	}

	// Rooted at the APP's own directory, not BUILDER_WORKDIR — the same
	// correction the skill catalogue already carries. BUILDER_WORKDIR is the
	// repository agents branch from; a custom app belongs to the application
	// that serves it. Defaulting to the workdir here scanned the builder's own
	// checkout and found nothing, which is exactly how that bug read in skills.
	root := os.Getenv("BUILDER_APPS_DIR")
	if root == "" {
		root = filepath.Join(".", "apps")
	}

	svc := customapps.New(db, k.Log, root)
	svc.Scan(context.Background())
	k.Set(ProviderApps, svc)

	// Hand the registry to the MCP surface, so an agent mid-run can add a screen
	// with create_app instead of filing an issue asking a human to type
	// `togo-builder app new`. THIS instance and no other: the tool scaffolds into
	// this root and rescans this registry, which is what makes a created app
	// appear in the launcher without a restart.
	//
	// Bound rather than missing when MCP is absent: provideFleet skips the mount
	// when it has no database, and a nil registry there simply means create_app
	// reports that custom apps are unavailable. A boot with no MCP must still
	// serve the apps it discovered.
	if m, ok := k.Get(ProviderFleet + ".mcp"); ok && m != nil {
		if ms, ok := m.(*mcpsrv.Service); ok {
			ms.SetApps(svc)
			k.Log.Info("builder.apps reachable over mcp", "surface", "/api/builder/mcp/agents", "dir", root)
		}
	}

	as, ok := auth.FromKernel(k)
	if !ok || as == nil {
		k.Log.Warn("builder.apps NOT mounted: the auth plugin is unavailable, and a surface that serves third-party script and accepts writes will not be served unauthenticated",
			"dir", root, "discovered", len(svc.List()))
		return nil
	}
	k.Router.Route("/api/builder/apps", func(r chi.Router) {
		r.Use(as.Middleware)
		svc.Routes(r)
	})
	return nil
}

func provideOrchestrator(k *togo.Kernel) error {
	db, dbErr := k.SQL(context.Background())

	// The loop is OPT-IN. A blueprint that started spending on model calls the
	// moment someone ran `togo serve` would be indefensible, so nothing runs
	// until BUILDER_RUNNER=1 is set deliberately.
	if dbErr == nil && os.Getenv("BUILDER_RUNNER") == "1" {
		cfg := orchestrator.DefaultConfig()
		if v := os.Getenv("BUILDER_DAILY_BUDGET_USD"); v != "" {
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				cfg.DailyBudgetUSD = f
			}
		}
		if v := os.Getenv("BUILDER_TRIAGE_MODEL"); v != "" {
			cfg.TriageModel = v
		}
		// Publishing is a SECOND, separate opt-in on top of BUILDER_RUNNER.
		// Running the loop means letting agents write code on local branches;
		// it must not also mean letting them push to a remote. An operator who
		// wants PRs says so explicitly.
		cfg.OpenPR = os.Getenv("BUILDER_OPEN_PR") == "1"
		if v := os.Getenv("BUILDER_PR_BASE"); v != "" {
			cfg.PRBase = v
		}
		if v := os.Getenv("BUILDER_PR_REMOTE"); v != "" {
			cfg.PRRemote = v
		}
		orch := orchestrator.New(db, k.Log, cfg)
		if n, ok := k.Get(ProviderNotify); ok && n != nil {
			if ns, ok := n.(*notify.Service); ok {
				orch.SetNotifier(ns)
			}
		}
		if b, ok := k.Get(ProviderBrain); ok && b != nil {
			if bs, ok := b.(*brain.Store); ok {
				orch.SetBrain(brainAdapter{bs})
				k.Log.Info("builder.orchestrator wired to the brain")
			}
		}
		k.Set(ProviderOrchestrator, orch)

		// Detached: the loop outlives any request.
		go orch.Run(context.Background())
		k.Log.Info("builder.orchestrator running",
			"triage_model", cfg.TriageModel,
			"poll", cfg.PollInterval,
			"daily_budget_usd", cfg.DailyBudgetUSD,
			"open_pr", cfg.OpenPR)
		if !cfg.OpenPR {
			k.Log.Info("builder.orchestrator will NOT push — " +
				"work lands on local branches; set BUILDER_OPEN_PR=1 to open pull requests")
		}
	} else {
		k.Set(ProviderOrchestrator, nil)
		if dbErr == nil && k.Log != nil {
			k.Log.Info("builder.orchestrator idle — set BUILDER_RUNNER=1 to start the agent loop")
		}
	}

	// Preflight is live from Phase 0 — the wizard refuses to proceed without it
	// and the CLI `doctor` verb calls the same function.
	mountAuthedGet(k, "/api/builder/preflight", func(w http.ResponseWriter, r *http.Request) {
		report := runner.Preflight(r.Context())
		w.Header().Set("Content-Type", "application/json")
		if !report.OK() {
			// 424: the dependencies this app needs are not satisfied. Not 500 —
			// nothing here failed, the environment is simply not ready.
			w.WriteHeader(http.StatusFailedDependency)
		}
		_ = json.NewEncoder(w).Encode(report)
	})

	mountAuthedGet(k, "/api/builder/_meta", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"plugin":    Name,
			"version":   Version,
			"blueprint": BlueprintVersion,
			"providers": activeProviders(),
		})
	})
	return nil
}

// activeProviders reports which providers actually registered, so an operator
// can see the effect of BUILDER_DISABLE without reading logs.
func activeProviders() []string {
	all := []string{
		ProviderVault, ProviderBrain, ProviderNotify,
		ProviderIssues, ProviderFleet, ProviderOrchestrator, ProviderSources,
		ProviderApps,
	}
	out := make([]string, 0, len(all))
	for _, name := range all {
		if !disabled(name) {
			out = append(out, name)
		}
	}
	return out
}

// brainAdapter bridges *brain.Store to orchestrator.Brain.
//
// The two Recall signatures differ only in their element type, so the adapter
// exists purely to keep the orchestrator free of a compile-time dependency on
// the brain package — the same reason Notifier is an interface.
type brainAdapter struct{ s *brain.Store }

func (a brainAdapter) Recall(ctx context.Context, agentSlug, query string, limit int) ([]orchestrator.Memory, error) {
	mems, err := a.s.Recall(ctx, agentSlug, query, limit)
	if err != nil {
		return nil, err
	}
	out := make([]orchestrator.Memory, 0, len(mems))
	for _, m := range mems {
		out = append(out, orchestrator.Memory{
			Content: m.Content, SourceKind: m.SourceKind,
			SourceRef: m.SourceRef, Score: m.Score,
		})
	}
	return out, nil
}

func (a brainAdapter) Writable(ctx context.Context, agentSlug string) (string, error) {
	return a.s.Writable(ctx, agentSlug)
}

func (a brainAdapter) Retain(ctx context.Context, ns, content, sourceKind, sourceRef string, importance float64) (string, error) {
	return a.s.Retain(ctx, ns, content, sourceKind, sourceRef, importance)
}

// noStaleSDK makes the browser revalidate the widget's entry points.
//
// Both files here are ENTRY POINTS with stable, unhashed names —
// /sdk/builder-sdk.js and /sdk/shell.html — so the default heuristic caching a
// browser applies to a 200 with no Cache-Control is exactly wrong for them: it
// pins whatever the user first loaded until they clear their cache.
//
// This was not theoretical. Shipping a rebuilt shell left the running page on
// the previous one, so a fix that was verifiably present in the served bytes
// was absent in the browser — and the only visible symptom was the OLD
// behaviour persisting, which reads as "the change did not work" rather than
// "the change did not load". Hours can go into that.
//
// `no-cache` rather than `no-store`: the file is still cached, the browser just
// has to ask first. An unchanged shell answers 304 and costs nothing.
func noStaleSDK(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		h.ServeHTTP(w, r)
	})
}
