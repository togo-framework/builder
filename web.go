package builder

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/togo-framework/togo"
)

// WebMount is where the dashboard lives, in every build that serves it.
//
// ONE prefix, and not one of the screens' own names. The routes are /issues,
// /agents, /chat, /vault, /terminal — words a host application is entirely
// likely to have already used, and whose handlers its own router would answer
// first. Mounting each at the root of somebody else's product is a collision
// waiting to happen and, in the case of a Next.js or SPA host, a guaranteed
// 404: the host serves its own index for /issues and the builder's router
// never sees the request.
//
// /builder is claimed once, is unlikely to be taken, and reads as what it is.
// It matches vite's `base` in web/vite.config.ts — the asset URLs in the built
// index.html are stamped with the same prefix, so this constant and the bundle
// cannot disagree.
const WebMount = "/builder"

// provideWeb serves the dashboard from the embedded bundle.
//
// Registered as its own provider, deliberately: the screens must come up even
// when the database is down. The issue plane is what fails without Postgres,
// and the page that tells an operator the API is unreachable is exactly the
// page they need at that moment. Folding this into provideIssues would have
// made "no database" mean "no pages", which is the failure mode the whole
// daemon exists to avoid.
func provideWeb(k *togo.Kernel) error {
	files, from, err := webRoot()
	if err != nil {
		// Not fatal. A host application with a broken builder UI is still a
		// working application, and the API surface underneath is untouched.
		if k.Log != nil {
			k.Log.Error("builder.web unavailable — the dashboard will not be served", "err", err)
		}
		return nil
	}

	h := webHandler(files)
	// Both forms. chi's "/builder/*" does not match a bare "/builder", so
	// without this the operator who types the obvious URL gets a 404 from the
	// host application and concludes the plugin is not installed.
	k.Router.Get(WebMount, http.RedirectHandler(WebMount+"/", http.StatusMovedPermanently).ServeHTTP)
	k.Router.Handle(WebMount+"/*", h)

	if k.Log != nil {
		k.Log.Info("builder.web ready", "mount", WebMount+"/", "source", from)
	}
	return nil
}

// webRoot picks the bundle: the operator's override if they set one, the
// embedded build otherwise.
//
// The override exists for developing the dashboard itself — point it at
// web/dist and rebuild the frontend without rebuilding Go. It is NOT the
// default and must never become one again: defaulting to a path on disk is
// precisely how the daemon ended up serving a sibling project's build output,
// and serving nothing at all on every machine that did not have it.
func webRoot() (fs.FS, string, error) {
	if dir := strings.TrimSpace(os.Getenv("BUILDER_WEB_DIR")); dir != "" {
		// Checked for index.html, not merely for existence. A directory that
		// happens to exist but holds no app produces a file server that 404s
		// every request — indistinguishable, from the browser, from the plugin
		// not being installed.
		if st, err := os.Stat(path.Join(dir, "index.html")); err == nil && !st.IsDir() {
			return os.DirFS(dir), dir, nil
		}
		// Falling back rather than failing: an override that points at a stale
		// path must degrade to the working built-in, not take the UI down.
		if sub, err := WebFiles(); err == nil {
			return sub, "embedded (BUILDER_WEB_DIR=" + dir + " has no index.html)", nil
		}
	}
	sub, err := WebFiles()
	if err != nil {
		return nil, "", err
	}
	return sub, "embedded", nil
}

// webHandler serves the bundle with the SPA fallback the router needs.
//
// The fallback is the whole trick with a client-routed app: /builder/issues
// exists only in the browser's router, so a request for it must return
// index.html and let the router resolve it. A plain file server returns 404,
// which means every deep link, every refresh and every link an operator pastes
// to a colleague lands on nothing.
func webHandler(files fs.FS) http.Handler {
	server := http.FileServer(http.FS(files))

	// The app shell, written out directly.
	//
	// NOT handed to the file server, which cannot serve it: net/http redirects
	// any request whose path ends in "/index.html" to "./" before it looks at
	// anything else. Rewriting the request path to /index.html and delegating
	// therefore answered /builder/ with "301 Location: ./" — a redirect to
	// itself, which a browser follows until it gives up.
	//
	// Read on every request rather than cached at boot so a BUILDER_WEB_DIR
	// rebuild is picked up without restarting Go. It is one small file, only on
	// navigations, and the alternative is a dashboard that serves yesterday's
	// shell to the person developing it.
	index := func(w http.ResponseWriter, _ *http.Request) {
		b, err := fs.ReadFile(files, "index.html")
		if err != nil {
			http.Error(w, "builder: dashboard index is unreadable", http.StatusInternalServerError)
			return
		}
		// The shell is not content-hashed and must never be cached, or a
		// deployed fix keeps loading yesterday's chunks. The hashed assets
		// beside it are handled below.
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// A failed write means the client hung up. The status is already sent;
		// there is nothing to recover and nothing to tell them.
		_, _ = w.Write(b)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rel := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, WebMount), "/")
		// path.Clean on the already-slash-separated URL path. http.FileServer is
		// safe on its own, but this handler opens names against the FS itself
		// below and must not be the weak link.
		clean := path.Clean("/" + rel)[1:]

		// The mount root and the shell by name are the same thing: the app.
		if clean == "" || clean == "." || clean == "index.html" {
			index(w, r)
			return
		}

		if f, err := files.Open(clean); err == nil {
			st, statErr := f.Stat()
			_ = f.Close()
			if statErr == nil && !st.IsDir() {
				// Vite's assets are content-hashed, so their names change when
				// their contents do and a year-long cache is correct.
				if strings.HasPrefix(clean, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				r2 := r.Clone(r.Context())
				r2.URL.Path = "/" + clean
				server.ServeHTTP(w, r2)
				return
			}
		}

		// Everything else is a client route: /builder/issues exists only in the
		// browser's router.
		index(w, r)
	})
}
