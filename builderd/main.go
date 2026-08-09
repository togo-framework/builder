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
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/togo-framework/togo"

	// The builder itself. Its init() registers every provider.
	_ "github.com/togo-framework/builder"

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
	origin := "http://localhost" + os.Getenv("ADDR")
	fmt.Printf("\n  Embed in your product:\n"+
		"    <script src=\"%s/sdk/builder-sdk.js\"></script>\n"+
		"    <script>BuilderIssues.mount({ apiBase: \"%s\" })</script>\n\n", origin, origin)

	// The dashboard itself, served by the daemon.
	//
	// Without this the daemon keeps the DATA alive and gives you nowhere to
	// look at it: the product's frontend is what serves /issues, so when it is
	// down the browser gets a connection refusal and there is no page for the
	// widget to sit on. Surviving the product means serving the pages too.
	serveWeb(k)
	// Your product, framed, with the builder outside it.
	serveShell(k)

	if err := k.Serve(context.Background()); err != nil {
		panic(err)
	}
}

// serveWeb mounts the dashboard, with an SPA fallback.
//
// A directory rather than an embedded bundle, for now: the UI is built from
// the app repository and embedding it here would make every plugin release
// carry a megabyte of somebody else's compiled JavaScript. BUILDER_WEB_DIR
// points at the built dist.
//
// The fallback is the whole trick with a client-routed app: /issues exists
// only in the browser's router, so a request for it must return index.html and
// let the router resolve it. Returning 404 — which a plain file server does —
// means every deep link and every refresh lands on nothing.
func serveWeb(k *togo.Kernel) {
	dir := strings.TrimSpace(os.Getenv("BUILDER_WEB_DIR"))
	if dir == "" {
		fmt.Print("  dashboard not served — set BUILDER_WEB_DIR to the built web/dist\n")
		return
	}
	index := filepath.Join(dir, "index.html")
	if _, err := os.Stat(index); err != nil {
		fmt.Printf("  ! BUILDER_WEB_DIR has no index.html: %s\n", dir)
		return
	}

	files := http.FileServer(http.Dir(dir))
	k.Router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		// The API and the SDK are real routes and must keep their own 404s: a
		// mistyped endpoint answering with a page of HTML is a debugging
		// session nobody needs.
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/sdk/") {
			http.NotFound(w, r)
			return
		}
		// A real file wins; anything else is a client route.
		if p := filepath.Join(dir, filepath.Clean(r.URL.Path)); r.URL.Path != "/" {
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				files.ServeHTTP(w, r)
				return
			}
		}
		// No-store on the shell only. The hashed assets beside it are
		// immutable and cached by the file server above; the shell is what
		// must not go stale after a deploy.
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, index)
	})
	fmt.Printf("  dashboard %s\n", dir)
}

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
  BUILDER_WEB_DIR    the built dashboard (web/dist) — without it there are no pages to look at
  BUILDER_TARGET     the product to frame at /shell (default: http://localhost:3000)

Embed in any product, on any stack:

  <script src="http://localhost:8099/sdk/builder-sdk.js"></script>
  <script>BuilderIssues.mount({ apiBase: "http://localhost:8099" })</script>
`
