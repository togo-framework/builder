package builder

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/togo-framework/togo"

	"github.com/togo-framework/builder/internal/fleet"
	"github.com/togo-framework/builder/internal/issues"
	"github.com/togo-framework/builder/internal/orchestrator"
	"github.com/togo-framework/builder/internal/runner"
	"github.com/togo-framework/builder/internal/setup"
	"github.com/togo-framework/builder/internal/vault"
)

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
	k.Router.Route("/api/builder/vault", svc.Routes)
	return nil
}

func provideBrain(k *togo.Kernel) error {
	// Phase 3. Driver interface with pgvector as the default in the app's own
	// Postgres; cabrain in-process is the recommended upgrade and the hosted
	// instance is opt-in only (it answered 502 during research, runs with no
	// HA, and resolves tokenless callers as admin).
	k.Set(ProviderBrain, nil)
	return nil
}

func provideNotify(k *togo.Kernel) error {
	// Phase 4. Realtime private-user channel + Web Push + the audible alert.
	k.Set(ProviderNotify, nil)
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
	k.Router.Route("/api/builder", svc.Routes)

	// Serve the SDK bundle so a host page needs one script tag and no build step.
	if dir := sdkDir(); dir != "" {
		k.Router.Handle("/sdk/*", http.StripPrefix("/sdk/", http.FileServer(http.Dir(dir))))
	}
	return nil
}

// sdkDir resolves the built SDK bundle. Overridable so a deployment can serve
// it from wherever its assets live.
func sdkDir() string {
	if d := os.Getenv("BUILDER_SDK_DIR"); d != "" {
		return d
	}
	for _, c := range []string{"sdk/dist", "../builder/sdk/dist"} {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
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
	k.Router.Route("/api/builder/setup", wiz.Routes)
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
		orch := orchestrator.New(db, k.Log, cfg)
		k.Set(ProviderOrchestrator, orch)

		// Detached: the loop outlives any request.
		go orch.Run(context.Background())
		k.Log.Info("builder.orchestrator running",
			"triage_model", cfg.TriageModel,
			"poll", cfg.PollInterval,
			"daily_budget_usd", cfg.DailyBudgetUSD)
	} else {
		k.Set(ProviderOrchestrator, nil)
		if dbErr == nil && k.Log != nil {
			k.Log.Info("builder.orchestrator idle — set BUILDER_RUNNER=1 to start the agent loop")
		}
	}

	// Preflight is live from Phase 0 — the wizard refuses to proceed without it
	// and the CLI `doctor` verb calls the same function.
	k.Router.Get("/api/builder/preflight", func(w http.ResponseWriter, r *http.Request) {
		report := runner.Preflight(r.Context())
		w.Header().Set("Content-Type", "application/json")
		if !report.OK() {
			// 424: the dependencies this app needs are not satisfied. Not 500 —
			// nothing here failed, the environment is simply not ready.
			w.WriteHeader(http.StatusFailedDependency)
		}
		_ = json.NewEncoder(w).Encode(report)
	})

	k.Router.Get("/api/builder/_meta", func(w http.ResponseWriter, r *http.Request) {
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
		ProviderIssues, ProviderFleet, ProviderOrchestrator,
	}
	out := make([]string, 0, len(all))
	for _, name := range all {
		if !disabled(name) {
			out = append(out, name)
		}
	}
	return out
}
