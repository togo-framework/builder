package integrations

// The HTTP surface behind the Connections app.
//
//	GET  /catalog            the gallery: categories + every integration
//	GET  /status             probe every terminal integration, concurrently
//	GET  /status/{slug}      probe one
//	POST /connect/{slug}     start the vendor's login in a terminal session
//	POST /disconnect/{slug}  run the vendor's logout
//
// Connect is the interesting one, and it is deliberately thin: it does not
// implement a login. It creates a tmux session, types the vendor's own command
// into it, and hands back the session name for the Terminal app to attach to.
// The operator then talks to gh, or gcloud, or Claude — directly.
//
// That is the whole reason terminal integrations work at all. These logins ask
// questions (paste this code, approve in the browser, pick a project) that no
// form can answer, and the honest way to support them is to get out of the way
// rather than to reimplement three vendors' auth flows badly.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type Service struct {
	log *slog.Logger
	// oauth persists in-flight states and issued tokens. nil disables the
	// OAuth endpoints rather than crashing them.
	oauth OAuthStore
	// tmux runs the login. Injected so a test can assert what would be run
	// without a terminal multiplexer on the machine.
	tmux Tmux

	// tokens reports which OAuth integrations hold a stored token. nil leaves
	// their cards without a badge rather than failing the whole status call.
	tokens interface {
		Connected(ctx context.Context, integration string) (bool, string)
	}
}

// Tmux is the slice of terminal control this package needs.
type Tmux interface {
	// Ensure creates the session if absent, and reports the name.
	Ensure(ctx context.Context, name string) error
	// SendKeys types a command into it, as if the operator had.
	SendKeys(ctx context.Context, name string, args ...string) error
}

func New(log *slog.Logger, t Tmux, o OAuthStore) *Service {
	if log == nil {
		log = slog.Default()
	}
	return &Service{log: log, tmux: t, oauth: o}
}

// WithTokens supplies the OAuth token reader used for status badges.
func (s *Service) WithTokens(t interface {
	Connected(ctx context.Context, integration string) (bool, string)
}) *Service {
	s.tokens = t
	return s
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/catalog", s.handleCatalog)
	r.Get("/status", s.handleStatusAll)
	r.Get("/status/{slug}", s.handleStatusOne)
	r.Post("/connect/{slug}", s.handleConnect)
	r.Post("/disconnect/{slug}", s.handleDisconnect)
	s.OAuthRoutes(r)
	s.OAuthAppRoutes(r)
	s.SmartRoutes(r)
}

func (s *Service) handleCatalog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"categories":   Categories(),
		"integrations": All(),
	})
}

func (s *Service) handleStatusAll(w http.ResponseWriter, r *http.Request) {
	// Bounded independently of any one probe: ProbeAll runs them concurrently,
	// so the whole call should cost about one slow probe, not the sum.
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	writeJSON(w, http.StatusOK, map[string]any{
		"statuses": append(ProbeAll(ctx), s.oauthStatuses(ctx)...),
	})
}

// oauthStatuses reports which OAuth integrations hold a token.
//
// Without this, an OAuth card showed an Authorize button and nothing else —
// forever, whether or not the operator had already authorised. There was no way
// to tell "connected" from "never connected" except by configuring a source and
// watching it fail, which is the most expensive possible feedback loop.
//
// It reads the stored row and deliberately does NOT refresh: this runs for
// every OAuth card on every page load, and spending a token rotation to draw a
// badge would be a poor trade. A token that has expired but holds a refresh
// token is still a live connection — the next collector run renews it.
func (s *Service) oauthStatuses(ctx context.Context) []Status {
	if s.tokens == nil {
		return nil
	}
	var out []Status
	for _, i := range All() {
		if i.Auth != AuthOAuth {
			continue
		}
		st := Status{Slug: i.Slug, State: StateDisconnected}
		if ok, account := s.tokens.Connected(ctx, i.Slug); ok {
			st.State = StateConnected
			// Naming the account is the point. An operator with a personal and
			// a work Google account WILL authorise the wrong one, and
			// "Connected" on its own gives them no way to notice.
			st.Detail = account
			if account == "" {
				st.Detail = "authorized"
			}
		}
		out = append(out, st)
	}
	return out
}

func (s *Service) handleStatusOne(w http.ResponseWriter, r *http.Request) {
	i, ok := Get(chi.URLParam(r, "slug"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, Probe(r.Context(), i))
}

// sessionFor is the tmux session name for an integration's login.
//
// Stable per integration rather than per attempt: a login the operator
// abandoned and restarts should land in the same window they already have open,
// not accumulate `connect-gh-1`, `connect-gh-2` behind them.
func sessionFor(slug string) string {
	return "connect-" + safeName.ReplaceAllString(slug, "-")
}

var safeName = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

type connectResult struct {
	Session string `json:"session"`
	Command string `json:"command"`
	// Hint is what to tell the operator to do next, because a terminal that
	// has just been handed a login command looks like a terminal doing nothing.
	Hint Text `json:"hint"`
}

func (s *Service) handleConnect(w http.ResponseWriter, r *http.Request) {
	i, ok := Get(chi.URLParam(r, "slug"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	if i.Auth != AuthTerminal || i.Terminal == nil {
		httpErr(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("%s does not connect through a terminal", i.Slug))
		return
	}
	// Refuse before opening a window. A terminal that appears and immediately
	// prints "command not found" is a worse answer than not opening one.
	if _, err := exec.LookPath(i.Terminal.Bin); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":   i.Terminal.Bin + " is not installed",
			"install": i.Terminal.Install,
		})
		return
	}
	if err := s.run(r.Context(), i, i.Terminal.Login); err != nil {
		s.log.Error("connect", "slug", i.Slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not start the login session")
		return
	}
	writeJSON(w, http.StatusOK, connectResult{
		Session: sessionFor(i.Slug),
		Command: strings.Join(i.Terminal.Login, " "),
		Hint: Text{
			EN: "Answer the prompts in the terminal, then press Refresh here.",
			AR: "أجب عن الأسئلة في الطرفية ثم اضغط تحديث هنا.",
		},
	})
}

func (s *Service) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	i, ok := Get(chi.URLParam(r, "slug"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	if i.Terminal == nil || len(i.Terminal.Logout) == 0 {
		httpErr(w, http.StatusUnprocessableEntity, "this integration has no logout command")
		return
	}
	if err := s.run(r.Context(), i, i.Terminal.Logout); err != nil {
		s.log.Error("disconnect", "slug", i.Slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not start the logout session")
		return
	}
	writeJSON(w, http.StatusOK, connectResult{
		Session: sessionFor(i.Slug),
		Command: strings.Join(i.Terminal.Logout, " "),
		Hint: Text{
			EN: "Confirm in the terminal if it asks, then press Refresh.",
			AR: "أكّد في الطرفية إن طُلب منك، ثم اضغط تحديث.",
		},
	})
}

// run makes the session and types the command into it.
func (s *Service) run(ctx context.Context, i Integration, argv []string) error {
	if s.tmux == nil {
		return errors.New("no terminal available")
	}
	name := sessionFor(i.Slug)
	if err := s.tmux.Ensure(ctx, name); err != nil {
		return fmt.Errorf("ensure session: %w", err)
	}
	// The command is built from the REGISTRY, never from the request. Nothing
	// an HTTP caller sends reaches a shell here — the only thing they choose is
	// which registered integration to connect, and the argv is a Go literal in
	// terminal.go. That is what keeps this endpoint from being a remote shell.
	if err := s.tmux.SendKeys(ctx, name, argv...); err != nil {
		return fmt.Errorf("send keys: %w", err)
	}
	s.log.Info("integration login started", "slug", i.Slug, "session", name,
		"cmd", strings.Join(argv, " "))
	return nil
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
