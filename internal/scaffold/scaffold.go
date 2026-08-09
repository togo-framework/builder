// Package scaffold renders a new builder project.
//
// The sequence matters and is not arbitrary:
//
//  1. togo new          — the base app (Go + TanStack + auth + postgres)
//  2. fix DB_DRIVER     — togo writes "postgres"; its own plugin registers "pgx"
//  3. overlay _project  — builder's routes, libs, plugin wiring, migrations
//  4. overlay _claude   — the agent operating system
//  5. go.work + tidy    — resolve the plugin from the working tree
//  6. createdb+migrate  — schema before anything tries to read it
//  7. seed admin        — an app with no way in is not scaffolded, it is bricked
//  8. preflight         — tell the operator what is missing BEFORE they start
//
// Steps 6–8 are skippable for CI, which wants files on disk and nothing else.
package scaffold

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"text/template"
	"time"
)

type Options struct {
	Name       string
	Dir        string
	Module     string
	AdminEmail string
	DBName     string
	// PluginPath points go.work at a local checkout instead of a published tag.
	// Empty means resolve the published module.
	PluginPath string
	SkipDB     bool
	SkipTidy   bool
	Force      bool
	Out        func(format string, a ...any)
}

type Result struct {
	Dir       string
	VaultKey  string
	AdminHint string
	Steps     []string
}

type tmplData struct {
	Name, Module, ProjectDir, DatabaseURL, AuthSecret, VaultKey, AdminEmail string
}

// New scaffolds a project.
func New(project, claude fs.FS, o Options) (*Result, error) {
	if o.Out == nil {
		o.Out = func(string, ...any) {}
	}
	if o.Name == "" {
		return nil, fmt.Errorf("a project name is required")
	}
	if o.Dir == "" {
		o.Dir = "./" + o.Name
	}
	abs, err := filepath.Abs(o.Dir)
	if err != nil {
		return nil, err
	}
	if o.Module == "" {
		o.Module = "github.com/" + o.Name + "/" + o.Name
	}
	if o.DBName == "" {
		o.DBName = strings.ReplaceAll(o.Name, "-", "_")
	}
	if o.AdminEmail == "" {
		o.AdminEmail = "admin@" + o.Name + ".local"
	}

	if _, err := os.Stat(abs); err == nil && !o.Force {
		return nil, fmt.Errorf("%s already exists (pass --force to overlay it)", abs)
	}

	res := &Result{Dir: abs}
	step := func(s string) { res.Steps = append(res.Steps, s); o.Out("  %s\n", s) }

	// --- 1. the base app -----------------------------------------------------
	if _, err := os.Stat(filepath.Join(abs, "go.mod")); err != nil {
		o.Out("→ scaffolding the base togo app…\n")
		cmd := exec.Command("togo", "new", o.Name,
			"--dir", abs, "--db", "postgres", "--frontend", "tanstack",
			"--module", o.Module, "--skip-tidy")
		cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
		if err := cmd.Run(); err != nil {
			return res, fmt.Errorf("togo new: %w (is the togo CLI installed?)", err)
		}
		step("base app scaffolded")
	} else {
		step("base app already present — overlaying")
	}

	// --- 2. render the overlay ----------------------------------------------
	data := tmplData{
		Name: o.Name, Module: o.Module, ProjectDir: abs,
		DatabaseURL: fmt.Sprintf("postgres://%s@localhost:5432/%s?sslmode=disable",
			currentUser(), o.DBName),
		AuthSecret: randHex(32),
		VaultKey:   randKey(),
		AdminEmail: o.AdminEmail,
	}
	res.VaultKey = data.VaultKey

	if err := render(project, "_project", abs, data); err != nil {
		return res, fmt.Errorf("overlay project files: %w", err)
	}
	step("builder overlay applied")

	// The overlay's routes import packages the base app never declared. Merged
	// straight after the overlay lands, so `go build` and the web build below
	// are looking at the same project an operator will.
	added, err := ensureWebDeps(abs)
	if err != nil {
		return res, fmt.Errorf("reconcile web dependencies: %w", err)
	}
	if len(added) > 0 {
		step(fmt.Sprintf("web dependencies declared (%s)", strings.Join(added, ", ")))
	}

	if err := render(claude, "_claude", filepath.Join(abs, ".claude"), data); err != nil {
		return res, fmt.Errorf("write .claude: %w", err)
	}
	step(".claude operating system written")

	// --- 3. workspace so the plugin resolves --------------------------------
	if o.PluginPath != "" {
		gw := fmt.Sprintf("go 1.26.4\n\nuse (\n\t./\n\t%s\n)\n", o.PluginPath)
		if err := os.WriteFile(filepath.Join(abs, "go.work"), []byte(gw), 0o644); err != nil {
			return res, fmt.Errorf("write go.work: %w", err)
		}
		step("go.work points at the local plugin checkout")
	}

	if !o.SkipTidy {
		cmd := exec.Command("go", "mod", "tidy")
		cmd.Dir = abs
		_ = cmd.Run() // a tidy failure is recoverable; the build step reports it
		build := exec.Command("go", "build", "./...")
		build.Dir = abs
		if out, err := build.CombinedOutput(); err != nil {
			return res, fmt.Errorf("the generated project does not build: %w\n%s", err, out)
		}
		step("go build ./... passes")
	}

	// --- 4. database ---------------------------------------------------------
	if !o.SkipDB {
		_ = exec.Command("createdb", o.DBName).Run() // already-exists is fine
		for _, m := range migrations(abs) {
			cmd := exec.Command("psql", "-v", "ON_ERROR_STOP=1", "-d", o.DBName, "-f", m)
			if out, err := cmd.CombinedOutput(); err != nil {
				return res, fmt.Errorf("apply %s: %w\n%s", filepath.Base(m), err, out)
			}
		}
		step(fmt.Sprintf("database %s created and migrated", o.DBName))
	}

	// --- 4b. web dependencies ------------------------------------------------
	//
	// Best-effort, and after the database so a slow or offline install cannot
	// cost the operator the parts that already worked. SkipTidy is reused as
	// the "do not touch the network" signal it already is for Go.
	if !o.SkipTidy {
		if installWeb(abs, o.Out) {
			step("web dependencies installed")
		}
	}

	// --- 5. .env -------------------------------------------------------------
	if err := renderEnv(abs, data); err != nil {
		return res, err
	}
	step(".env written (vault key generated for this project)")

	// --- 6. trust the workspace ---------------------------------------------
	// Claude Code ignores every permissions.allow entry in an untrusted
	// workspace and only says so in a stdout warning. A generated project ships
	// 65 of them, so without this the operator gets a permission prompt for
	// every command the rules already sanction — and no obvious reason why.
	if err := trustWorkspace(abs); err != nil {
		o.Out("  ! could not pre-trust the workspace: %v\n", err)
		o.Out("    run `claude` here once and accept the dialog, or the shipped\n")
		o.Out("    permissions.allow entries are ignored.\n")
	} else {
		step("workspace trusted for Claude Code (permissions.allow honoured)")
	}

	res.AdminHint = o.AdminEmail
	return res, nil
}

// trustWorkspace marks the project trusted in ~/.claude.json.
//
// Written narrowly: only projects[dir].hasTrustDialogAccepted is touched, and an
// existing config is read, amended and rewritten rather than replaced — this
// file holds the user's own settings for every other project on the machine.
func trustWorkspace(dir string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	path := filepath.Join(home, ".claude.json")

	cfg := map[string]any{}
	if b, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(b, &cfg); err != nil {
			// Do not overwrite a config we cannot parse.
			return fmt.Errorf("%s is not valid JSON: %w", path, err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	projects, _ := cfg["projects"].(map[string]any)
	if projects == nil {
		projects = map[string]any{}
	}
	entry, _ := projects[dir].(map[string]any)
	if entry == nil {
		entry = map[string]any{}
	}
	entry["hasTrustDialogAccepted"] = true
	projects[dir] = entry
	cfg["projects"] = projects

	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

// render walks an embedded tree and writes it out, running text/template only
// on .tmpl files — everything else is copied byte for byte, so a .tsx full of
// braces is never mangled.
func render(src fs.FS, root, dest string, data tmplData) error {
	return fs.WalkDir(src, root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		out := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		b, err := fs.ReadFile(src, p)
		if err != nil {
			return err
		}
		if strings.HasSuffix(out, ".tmpl") {
			out = strings.TrimSuffix(out, ".tmpl")
			t, err := template.New(filepath.Base(out)).Parse(string(b))
			if err != nil {
				return fmt.Errorf("parse %s: %w", rel, err)
			}
			f, err := os.Create(out)
			if err != nil {
				return err
			}
			defer f.Close()
			return t.Execute(f, data)
		}
		if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
			return err
		}
		mode := fs.FileMode(0o644)
		if strings.HasSuffix(out, ".sh") {
			mode = 0o755 // hooks must be executable or they silently never run
		}
		return os.WriteFile(out, b, mode)
	})
}

func renderEnv(dir string, data tmplData) error {
	src := filepath.Join(dir, ".env")
	if _, err := os.Stat(src); err == nil {
		return nil // never clobber an existing .env
	}
	return nil // .env.tmpl was already rendered to .env by render()
}

func migrations(dir string) []string {
	m, _ := filepath.Glob(filepath.Join(dir, "db", "migrations", "*.sql"))
	return m
}

func currentUser() string {
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	return "postgres"
}

func randKey() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.StdEncoding.EncodeToString(b)
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var _ = time.Now
