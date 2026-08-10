// Command togo-builder scaffolds and operates builder projects.
//
// Named togo-builder because that is what makes `togo builder <verb>` work with
// zero changes to togo-framework/cli: its root command resolves an unknown verb
// to a togo-<name> binary on PATH.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver

	"github.com/togo-framework/builder/blueprint"
	"github.com/togo-framework/builder/internal/db/seeders"
	"github.com/togo-framework/builder/internal/runner"
	"github.com/togo-framework/builder/internal/scaffold"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: togo-builder <new|app|doctor|seed|version>")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "doctor":
		os.Exit(doctor(jsonFlag()))
	case "new":
		os.Exit(newProject(os.Args[2:]))
	case "app":
		os.Exit(appCmd(os.Args[2:]))
	case "seed":
		os.Exit(seed(os.Args[2:]))
	case "version":
		fmt.Println("togo-builder dev")
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

// seed runs the seeders. Today: `togo-builder seed admin`.
//
// The password is read from stdin or BUILDER_ADMIN_PASSWORD and is never
// defaulted, generated or echoed — a generated-and-printed admin password ends
// up in CI logs and shell history, which is worse than asking for one.
func seed(args []string) int {
	if len(args) == 0 || args[0] != "admin" {
		fmt.Fprintln(os.Stderr, "usage: togo-builder seed admin [--email you@example.com] [--force]")
		fmt.Fprintln(os.Stderr, "  the password is read from stdin, or from BUILDER_ADMIN_PASSWORD")
		return 2
	}

	opts := seeders.AdminOptions{Email: os.Getenv("BUILDER_ADMIN_EMAIL")}
	for i := 1; i < len(args); i++ {
		switch args[i] {
		case "--email":
			if i+1 < len(args) {
				i++
				opts.Email = args[i]
			}
		case "--force":
			opts.Force = true
		}
	}

	// Only read stdin when it is piped; a bare invocation must not hang.
	if info, err := os.Stdin.Stat(); err == nil && info.Mode()&os.ModeCharDevice == 0 {
		if b, err := io.ReadAll(os.Stdin); err == nil {
			opts.Password = strings.TrimRight(string(b), "\r\n")
		}
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is unset")
		return 1
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer db.Close()

	res, err := seeders.SeedAdmin(context.Background(), db, opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, "seed admin:", err)
		return 1
	}
	switch {
	case res.Created:
		fmt.Printf("created admin %s with %d permissions\n", res.Email, res.GrantedN)
	case res.Updated:
		fmt.Printf("rotated password for %s\n", res.Email)
	case res.Skipped:
		fmt.Printf("admin %s already exists — grants refreshed, password untouched\n", res.Email)
		fmt.Println("  (pass --force to rotate the password)")
	}
	return 0
}

func jsonFlag() bool {
	for _, a := range os.Args[2:] {
		if a == "--json" {
			return true
		}
	}
	return false
}

func doctor(asJSON bool) int {
	report := runner.Preflight(context.Background())

	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(report)
	} else {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		for _, c := range report.Checks {
			mark := map[runner.Status]string{
				runner.StatusPass: "ok", runner.StatusWarn: "warn",
				runner.StatusFail: "FAIL", runner.StatusSkip: "skip",
			}[c.Status]
			req := ""
			if c.Required {
				req = " (required)"
			}
			fmt.Fprintf(w, "%2d\t%s\t%s%s\t%s\n", c.ID, mark, c.Label, req, c.Detail)
		}
		_ = w.Flush()
		for _, c := range report.Blocking() {
			fmt.Fprintf(os.Stderr, "\nBLOCKED: %s\n  %s\n  fix: %s\n", c.Label, c.Detail, c.Remedy)
		}
	}
	if !report.OK() {
		return 1
	}
	return 0
}

// newProject scaffolds a project from the embedded blueprint.
func newProject(args []string) int {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		fmt.Fprintln(os.Stderr, "usage: togo-builder new <name> [--dir D] [--module M] [--admin E] [--plugin-path P] [--skip-db] [--force]")
		return 2
	}
	opts := scaffold.Options{Name: args[0], Out: func(f string, a ...any) { fmt.Printf(f, a...) }}
	for i := 1; i < len(args); i++ {
		next := func() string {
			if i+1 < len(args) {
				i++
				return args[i]
			}
			return ""
		}
		switch args[i] {
		case "--dir":
			opts.Dir = next()
		case "--module":
			opts.Module = next()
		case "--admin":
			opts.AdminEmail = next()
		case "--db-name":
			opts.DBName = next()
		case "--plugin-path":
			opts.PluginPath = next()
		case "--skip-db":
			opts.SkipDB = true
		case "--skip-tidy":
			opts.SkipTidy = true
		case "--force":
			opts.Force = true
		}
	}

	fmt.Printf("Creating %s\n", opts.Name)
	res, err := scaffold.New(blueprint.Project, blueprint.Claude, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nscaffold failed: %v\n", err)
		return 1
	}

	fmt.Printf("\n%s is ready.\n\n", res.Dir)
	fmt.Println("Next:")
	fmt.Printf("  cd %s\n", res.Dir)
	fmt.Println("  printf 'your-password' | togo-builder seed admin   # you choose it; nothing is generated")
	fmt.Println("  set -a && . ./.env && set +a && go run ./cmd/api   # API  :8080")
	fmt.Println("  (cd web && pnpm install && pnpm dev)               # web  :3000")
	fmt.Println()
	fmt.Println("Then open http://localhost:3000 — setup runs before the dashboard,")
	fmt.Println("so the agent fleet is built from your plan first.")
	return 0
}
