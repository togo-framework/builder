// Command builderd runs the builder as its own process.
//
// # WHY THIS EXISTS
//
// The builder began as a togo plugin mounted into the product's binary. That
// makes it trivial to adopt and it is exactly wrong for what the thing is for.
// The builder is how you report a bug, watch an agent fix it, and talk to the
// fleet — which is to say it is what you reach for when the product is
// BROKEN. Sharing the product's process means it is down at the only moment it
// matters:
//
//   - `go build` and restart: the board is gone for the length of the build.
//   - A deploy: gone until the new revision is healthy.
//   - A panic in the product: gone, and the place you would file the panic
//     went with it.
//   - An agent editing the product's own code: every save that restarts the
//     dev server takes the issue board with it.
//
// A tool that observes a system must not live inside it. So builderd is its
// own binary, its own port, its own database, its own session. The product
// embeds one script tag pointing at it and knows nothing else. Deploy the
// product, break the product, delete the product's containers — the board, the
// agents, the brain and the chat are still there, and still able to fix it.
//
// # WHAT IT SHARES WITH THE PLUGIN
//
// All of it. Every provider in this repository registers itself the same way
// whether the kernel belongs to a product or to this daemon, so there is one
// implementation of the issue plane, the fleet, the brain and the sources —
// not a daemon copy that drifts. The plugin build stays supported for anyone
// who genuinely wants it in-process.
package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/togo-framework/togo"

	// The builder itself. Its init() registers every provider — including the
	// one that mounts the embedded dashboard, which is why this is a named
	// import now: WebMount is where those pages are, and the daemon's front
	// door redirects there rather than repeating the path as a literal.
	"github.com/togo-framework/builder"

	// The togo plugins the builder actually depends on, and no others.
	//
	// A product's plugin list is its own business; this daemon takes the
	// smallest set that makes the builder work, because every extra plugin is
	// another thing that can fail in the process that is supposed to still be
	// running when everything else has.
	_ "github.com/togo-framework/auth"     // sessions for the dashboard
	_ "github.com/togo-framework/auth-dev" // the dev login the wizard uses
	_ "github.com/togo-framework/db-postgres"
	_ "github.com/togo-framework/realtime" // the SSE alert channel
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help") {
		fmt.Print(usage)
		return
	}

	// The daemon's OWN database and port, defaulted away from a product's.
	//
	// Defaults rather than requirements: an operator who has not read anything
	// yet should get a working builder, not an error. But they must not
	// silently land on the product's database — builder tables in the
	// product's schema is precisely the coupling this binary exists to undo.
	setDefault("DATABASE_URL", "postgres://"+currentUser()+"@localhost:5432/builder?sslmode=disable")
	// DB_DRIVER, not a guess: togo defaults to sqlite, and a builder that
	// silently ran on a throwaway sqlite file while DATABASE_URL pointed at
	// Postgres would look like it had lost every issue.
	setDefault("DB_DRIVER", "pgx")
	// ADDR is togo's own key. Setting PORT looked right and did nothing — the
	// daemon came up on the product's 8080 and the two fought over the port.
	setDefault("ADDR", ":8099")

	// Sources and the agent loop are opt-in here exactly as in the plugin. A
	// daemon that starts polling somebody's database and spending on model
	// calls the moment it is installed would be indefensible.
	k := togo.New()
	defer k.Close()

	fmt.Printf("→ builder running on %s\n", k.Config.Addr)
	fmt.Printf("  database  %s\n", redactDSN(os.Getenv("DATABASE_URL")))
	fmt.Printf("  workdir   %s\n", orDefault(os.Getenv("BUILDER_WORKDIR"), "(unset — agents have no repository to work in)"))
	if os.Getenv("BUILDER_RUNNER") != "1" {
		fmt.Print("  agents    idle (set BUILDER_RUNNER=1 to start the loop)\n")
	}
	fmt.Printf("\n  Embed in your product:\n"+
		"    <script src=\"%s/sdk/builder-sdk.js\"></script>\n"+
		"    <script>BuilderIssues.mount({ apiBase: \"%s\" })</script>\n\n", origin(), origin())

	// The health probe the dashboard actually asks for.
	//
	// The dashboard is built from the product's repository, and the product
	// registers /api/health in its OWN server — so served from here it polled
	// an endpoint nobody answered, took the 404 as "down", and drew its status
	// dot grey with "API offline". The daemon was running perfectly and its own
	// front page said it was not, which is the worst possible first impression
	// for a binary whose whole promise is that it stays up when the product
	// does not.
	serveHealth(k)

	if t := strings.TrimSpace(os.Getenv("BUILDER_TARGETS")); t == "" {
		fmt.Print("  targets   one (set BUILDER_TARGETS=\"app=…,auth=…\" to host several at /shell)\n")
	}

	// The daemon's front door. The pages come from the plugin's embedded
	// bundle at /builder/*; this points "/" at them.
	//
	// Surviving the product means serving the pages too: the product's
	// frontend is what used to serve /issues, so when it is down the browser
	// gets a connection refusal and there is no page for the widget to sit on.
	serveWeb(k)
	// Your product, framed, with the builder outside it.
	serveShell(k)

	if err := k.Serve(context.Background()); err != nil {
		panic(err)
	}
}

// serveHealth answers the dashboard's liveness probe.
//
// The shape matches the product's own /api/health, because the same compiled
// dashboard reads both and only looks at .status. "service" is what tells an
// operator WHICH of the two answered — on a machine running the product on
// 8080 and the daemon on 8099, that field is the difference between "I am
// looking at the builder" and "I am looking at the product".
//
// Registered on the router directly rather than behind auth: a liveness probe
// that requires a session cannot report that the thing handing out sessions is
// broken.
func serveHealth(k *togo.Kernel) {
	k.Router.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// No-store: a cached "ok" outliving the process it describes is worse
		// than no probe at all.
		w.Header().Set("Cache-Control", "no-store")
		if _, err := io.WriteString(w, `{"status":"ok","service":"builderd"}`); err != nil {
			// The client hung up mid-write. Nothing to recover and nothing to
			// say to them; log it rather than discarding the error silently.
			slog.Debug("health response write failed", "err", err)
		}
	})
}

// serveWeb points the daemon's front door at the dashboard.
//
// The pages themselves are NOT served here. The builder plugin mounts them at
// /builder/* from a bundle embedded in the binary (see web.go and web_embed.go
// in the plugin), which is what makes them work in a host application too —
// one implementation, mounted once, wherever the kernel happens to be running.
//
// This function used to BE the dashboard, reading BUILDER_WEB_DIR and file-
// serving whatever it found. That default was ../../builder-dev/web/dist — a
// sibling development checkout — so the "standalone" daemon was not standalone
// at all: on any machine without that project cloned AND built, it started,
// reported itself healthy, and served no pages. On a server it could never
// have worked. BUILDER_WEB_DIR still exists, still overrides, and is now read
// by the plugin as a development convenience rather than as the only source of
// a UI.
//
// What is left is the redirect. An operator opens http://localhost:8099 and
// must land on the board; they should not have to know the mount point.
func serveWeb(k *togo.Kernel) {
	k.Router.Get("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, builder.WebMount+"/", http.StatusFound)
	})

	// Anything else that is not a mounted route is a genuine 404. The daemon
	// hosts an API, the SDK, the shell and the dashboard; a catch-all that
	// answered every unknown path with the app shell would make a mistyped
	// endpoint look like a working page.
	k.Router.NotFound(http.NotFound)

	if dir := strings.TrimSpace(os.Getenv("BUILDER_WEB_DIR")); dir != "" {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
			fmt.Printf("  ! BUILDER_WEB_DIR has no index.html (%s) — serving the embedded dashboard\n", dir)
		} else {
			fmt.Printf("  dashboard %s%s/  (override: %s)\n", origin(), builder.WebMount, dir)
			return
		}
	}
	fmt.Printf("  dashboard %s%s/  (embedded in this binary)\n", origin(), builder.WebMount)
}

// origin is where this daemon answers, as an operator would type it.
func origin() string { return "http://localhost" + os.Getenv("ADDR") }

func setDefault(key, val string) {
	if strings.TrimSpace(os.Getenv(key)) == "" {
		_ = os.Setenv(key, val)
	}
}

func currentUser() string {
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	return "postgres"
}

func orDefault(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

// redactDSN prints where the database is without printing how to get into it.
// This line goes to a terminal that ends up in screenshots and bug reports.
func redactDSN(dsn string) string {
	at := strings.LastIndex(dsn, "@")
	if at < 0 {
		return dsn
	}
	scheme := strings.Index(dsn, "://")
	if scheme < 0 {
		return dsn
	}
	return dsn[:scheme+3] + "***" + dsn[at:]
}

const usage = `builderd — the builder, running as its own process.

It keeps its own database, port and session, so it stays up while the product
it watches is being built, deployed, restarted or debugged. That is the point:
the board is what you reach for when the product is broken.

  DATABASE_URL   its own database        (default: postgres://<user>@localhost:5432/builder)
  ADDR           its own port            (default: :8099)
  DB_DRIVER      pgx                     (togo defaults to sqlite; the builder needs Postgres)
  BUILDER_WORKDIR  the repository agents work in
  BUILDER_VAULT_KEY  required for the secrets vault
  BUILDER_RUNNER=1   start the agent loop (off by default: it spends money)
  BUILDER_WEB_DIR    OPTIONAL. The dashboard is compiled into this binary and served at
                     /builder/ — nothing needs to be built or checked out for it to work.
                     Set this only when developing the dashboard itself, to serve a
                     web/dist from disk instead. A path with no index.html is ignored.
  BUILDER_TARGET     one product to frame at /shell (default: http://localhost:3000)
  BUILDER_TARGETS    several, as name=url separated by commas or newlines. The shell
                     hosts them all at once and switches between them without losing
                     the panel; every report records which one it came from. Takes
                     precedence over BUILDER_TARGET, which stays the single-app shorthand:

                       BUILDER_TARGETS="app=https://app.co,auth=https://auth.app.co,dashboard=https://dashboard.app.co"

                     A bare url with no name= takes its host as the name.
  BUILDER_LOCALE     en (default) or ar — the shell's own copy and text direction.
                     Overridable per visit with /shell?lang=ar

Embed in any product, on any stack:

  <script src="http://localhost:8099/sdk/builder-sdk.js"></script>
  <script>BuilderIssues.mount({ apiBase: "http://localhost:8099" })</script>
`
