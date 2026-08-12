package setup

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// Probes verify that a configured capability actually works.
//
// They live beside the capability they check rather than in a separate list,
// because a hand-maintained preflight and the settings it verifies drift the
// moment one of them changes. Every probe reports what it TRIED and what came
// back — "failed" sends an operator to the source; "dial tcp 127.0.0.1:5432:
// connection refused" sends them to the right place.

func ok(format string, a ...any) ProbeResult {
	return ProbeResult{OK: true, Detail: fmt.Sprintf(format, a...)}
}

func fail(format string, a ...any) ProbeResult {
	return ProbeResult{OK: false, Detail: fmt.Sprintf(format, a...)}
}

func probeDatabase(ctx context.Context, env Env) ProbeResult {
	dsn := strings.TrimSpace(env.Get("DATABASE_URL"))
	if dsn == "" {
		return ProbeResult{Fatal: true, Detail: "DATABASE_URL is unset — nothing the builder does works without it"}
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return ProbeResult{Fatal: true, Detail: fmt.Sprintf("open: %v", err)}
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return ProbeResult{Fatal: true, Detail: fmt.Sprintf("ping: %v", err)}
	}
	return ok("connected")
}

func probeVaultKey(_ context.Context, env Env) ProbeResult {
	k := strings.TrimSpace(env.Get("BUILDER_VAULT_KEY"))
	if k == "" {
		return fail("unset — secrets cannot be stored or read")
	}
	// Length only. The value is never logged, echoed, or included in a report.
	if len(k) < 32 {
		return fail("too short (%d chars) — want at least 32", len(k))
	}
	return ok("present")
}

// probeExecutor is the honest one.
//
// BUILDER_EXEC is read at exactly one line in this codebase and has no
// implementation behind it: setting it to "coder" changes nothing. Before this
// registry there was nothing to tell an operator that, so the setting looked
// like a sandbox and was not one. The probe says so out loud, which is the
// entire reason capabilities carry their own verification.
func probeExecutor(_ context.Context, env Env) ProbeResult {
	v := strings.TrimSpace(env.Get("BUILDER_EXEC"))
	if v == "" || v == "local" {
		return ok("local — agents run inside this process")
	}
	return fail(
		"%q has no implementation: agents still run locally, inheriting DATABASE_URL "+
			"and the vault key with a Bash tool. Do not rely on this as a sandbox.", v)
}

func probeClaudeBin(ctx context.Context, env Env) ProbeResult {
	bin := strings.TrimSpace(env.Get("BUILDER_CLAUDE_BIN"))
	if bin == "" {
		bin = "claude"
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return fail("%q not found on PATH — the runner cannot start an agent", bin)
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, path, "--version").CombinedOutput()
	if err != nil {
		return fail("%s --version: %v", path, err)
	}
	return ok("%s — %s", path, strings.TrimSpace(string(out)))
}

func probeEmbedURL(ctx context.Context, env Env) ProbeResult {
	u := strings.TrimSpace(env.Get("BUILDER_EMBED_URL"))
	if u == "" {
		return ok("unset — recall falls back to lexical search")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u, nil)
	if err != nil {
		return fail("bad URL %q: %v", u, err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fail("HEAD %s: %v", u, err)
	}
	defer res.Body.Close()
	// A 4xx here is fine — it means something answered. We are checking
	// reachability, not that this exact verb is allowed.
	if res.StatusCode >= 500 {
		return fail("HEAD %s: %d", u, res.StatusCode)
	}
	return ok("reachable (%d)", res.StatusCode)
}
