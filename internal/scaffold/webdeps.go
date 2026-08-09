package scaffold

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
)

// The overlay's web dependencies.
//
// `togo new --frontend tanstack` writes a package.json for a plain TanStack
// app. The builder overlay then drops in routes that import things that app
// never heard of, and nothing reconciled the two — so a freshly scaffolded
// project had .tsx files importing packages it had not declared, and the first
// `npm run build` failed on a generated project that had reported success.
//
// Declared here rather than shipped as a package.json in the blueprint: the
// base file belongs to togo and carries its own React and Vite versions. An
// overlay that replaced it would silently pin whatever this repo happened to
// use, and an overlay that could not replace it would be ignored. Merging adds
// what is missing and touches nothing that is already there.
//
// Keep in step with builder-dev/web/package.json — that app is the reference
// install, and a version that drifts from it is a bug report waiting to happen.
var webDeps = map[string]string{
	"@tanstack/react-query":  "^5.62.0",
	"@tanstack/react-router": "^1.95.0",
	"@togo-framework/ui":     "^0.1.11",
	"lucide-react":           "^0.462.0",
	"react":                  "^19.0.0",
	"react-dom":              "^19.0.0",

	// Imported dynamically by the terminal route, so no bundler or type check
	// will tell you they are missing — the page just fails at runtime, in the
	// browser, on the one screen an operator opens when something else is
	// already wrong.
	"@xterm/xterm":     "^5.5.0",
	"@xterm/addon-fit": "^0.10.0",
}

// ensureWebDeps adds any missing dependency to the generated web/package.json.
//
// Existing entries are never rewritten. The base app may legitimately be ahead
// of this list, and a scaffold step that downgrades somebody's React because a
// plugin had an older constant is a considerably worse failure than the one
// this function exists to prevent.
//
// Returns the names it added, so the caller can say so rather than claiming a
// step it may not have needed to take.
func ensureWebDeps(projectDir string) ([]string, error) {
	path := filepath.Join(projectDir, "web", "package.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		// No web directory is a legitimate shape for a generated project — an
		// API-only app never runs `togo new --frontend`. Nothing to reconcile.
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	// Decoded into an ordered-agnostic map and re-encoded: package.json key
	// order is not meaningful, and preserving it would mean hand-rolling a JSON
	// writer for no benefit.
	var pkg map[string]any
	if err := json.Unmarshal(raw, &pkg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}

	deps, _ := pkg["dependencies"].(map[string]any)
	if deps == nil {
		deps = map[string]any{}
	}

	var added []string
	for name, version := range webDeps {
		if _, ok := deps[name]; ok {
			continue
		}
		deps[name] = version
		added = append(added, name)
	}
	if len(added) == 0 {
		return nil, nil
	}
	sort.Strings(added)
	pkg["dependencies"] = deps

	out, err := json.MarshalIndent(pkg, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", path, err)
	}
	if err := os.WriteFile(path, append(out, '\n'), 0o644); err != nil {
		return nil, fmt.Errorf("write %s: %w", path, err)
	}
	return added, nil
}

// installWeb runs the project's package manager, if one is on PATH.
//
// Best-effort on purpose. A scaffold that fails because the machine is offline
// has thrown away a working project over a step the operator can repeat in one
// command, so a failure here is reported and not returned.
//
// pnpm first: this project's own lockfile is pnpm's, and npm cannot parse the
// yarn `patch:` protocol that appears in some togo dependency trees.
func installWeb(projectDir string, out func(string, ...any)) bool {
	web := filepath.Join(projectDir, "web")
	if _, err := os.Stat(web); err != nil {
		return false
	}
	for _, pm := range []string{"pnpm", "npm"} {
		bin, err := exec.LookPath(pm)
		if err != nil {
			continue
		}
		cmd := exec.Command(bin, "install")
		cmd.Dir = web
		if b, err := cmd.CombinedOutput(); err != nil {
			out("  ! %s install failed; run it yourself in web/: %v\n", pm, err)
			if len(b) > 400 {
				b = b[len(b)-400:]
			}
			out("    %s\n", b)
			return false
		}
		return true
	}
	out("  ! no pnpm or npm on PATH — run `pnpm install` in web/ before `npm run dev`\n")
	return false
}
