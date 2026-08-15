package integrations

// The OAuth endpoints.
//
//	POST /authorize/{slug}  mint state+PKCE, store them, return the vendor URL
//	GET  /callback          exchange the code, store the tokens
//
// The split matters. Authorize is a POST from the authenticated app, because it
// WRITES the state row; the callback is a GET the vendor redirects a browser to,
// so it is the one endpoint here that cannot require our session cookie in the
// usual way — the browser arrives from accounts.google.com. What stands in for
// authentication there is the state parameter: single-use, short-lived, minted
// by us, and matched against a stored row. Without it, anyone who can reach the
// callback can bind their own account to this installation.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// OAuthStore persists in-flight states and issued tokens.
type OAuthStore interface {
	SaveState(ctx context.Context, st AuthState, integration, createdBy string) error
	// TakeState consumes a state, returning it exactly once. A replayed
	// callback must not succeed twice.
	TakeState(ctx context.Context, state string) (AuthState, string, error)
	SaveToken(ctx context.Context, integration string, tok Token) error
}

type Token struct {
	Account      string
	AccessToken  string
	RefreshToken string
	Scopes       string
	TokenType    string
	ExpiresAt    *time.Time
}

// OAuthRoutes registers the flow. Mounted alongside the rest of the service.
func (s *Service) OAuthRoutes(r chi.Router) {
	r.Post("/authorize/{slug}", s.handleAuthorize)
	r.Get("/callback", s.handleCallback)
}

func (s *Service) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	i, ok := Get(chi.URLParam(r, "slug"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	name, p, ok := ProviderFor(i.Slug)
	if !ok {
		httpErr(w, http.StatusUnprocessableEntity, i.Slug+" does not authorise with OAuth")
		return
	}
	if configured, missing := p.Configured(r.Context()); !configured {
		// Named precisely. "OAuth is not configured" sends someone reading
		// docs; naming the variable sends them to a .env file.
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": fmt.Sprintf("%s is not set — create an OAuth app for %s and set it", missing, name),
		})
		return
	}

	st, err := NewAuthState(s.callbackURL(r))
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not start authorization")
		return
	}
	if s.oauth == nil {
		httpErr(w, http.StatusInternalServerError, "no oauth store")
		return
	}
	if err := s.oauth.SaveState(r.Context(), st, i.Slug, actorOf(r)); err != nil {
		s.log.Error("save oauth state", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not start authorization")
		return
	}
	u, err := p.AuthorizeURL(r.Context(), st)
	if err != nil {
		httpErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": u})
}

func (s *Service) handleCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// The vendor reports a refusal here rather than by status code. Showing it
	// verbatim matters: "access_denied" means the human clicked Cancel, and
	// telling them something failed would be wrong.
	if e := q.Get("error"); e != "" {
		s.finish(w, false, fmt.Sprintf("%s: %s", e, q.Get("error_description")))
		return
	}
	code, state := q.Get("code"), q.Get("state")
	if code == "" || state == "" {
		s.finish(w, false, "the callback was missing its code or state")
		return
	}
	if s.oauth == nil {
		s.finish(w, false, "no oauth store")
		return
	}

	// Single-use. A replayed callback finds nothing and is refused, which is
	// the whole point of storing the state rather than signing it.
	st, slug, err := s.oauth.TakeState(r.Context(), state)
	if err != nil {
		s.log.Warn("oauth callback with an unknown or expired state")
		s.finish(w, false, "this authorization link has expired or was already used")
		return
	}
	name, p, ok := ProviderFor(slug)
	if !ok {
		s.finish(w, false, "unknown integration")
		return
	}

	tok, err := s.exchange(r.Context(), p, code, st)
	if err != nil {
		s.log.Error("oauth exchange", "slug", slug, "err", err)
		s.finish(w, false, "the provider refused the exchange")
		return
	}
	// Stored under the PROVIDER, not the integration slug.
	//
	// Five Google integrations share one Google OAuth app and one set of
	// scopes, so a token obtained for Gmail is the same token Analytics needs.
	// Keying by slug would make the operator walk the consent screen five
	// times to get five identical rows — and then hold five refresh tokens for
	// one grant, any of which could be rotated out from under the others.
	//
	// One row per provider means authorising once connects every integration
	// that provider serves, which is also how Google's own incremental consent
	// is meant to work.
	if err := s.oauth.SaveToken(r.Context(), name, tok); err != nil {
		s.log.Error("save oauth token", "slug", slug, "err", err)
		s.finish(w, false, "could not store the token")
		return
	}
	s.log.Info("oauth connected", "slug", slug, "account", tok.Account)
	s.finish(w, true, tok.Account)
}

// exchange trades the code for tokens.
func (s *Service) exchange(ctx context.Context, p Provider, code string, st AuthState) (Token, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", st.RedirectURI)
	form.Set("client_id", credential(ctx, p.ClientIDEnv))
	form.Set("client_secret", credential(ctx, p.ClientSecretEnv))
	if p.UsesPKCE {
		form.Set("code_verifier", st.Verifier)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return Token{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// GitHub answers form-encoded unless asked otherwise, and the difference is
	// invisible until the JSON decode returns a zero-valued token.
	req.Header.Set("Accept", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return Token{}, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return Token{}, fmt.Errorf("token endpoint returned %d", res.StatusCode)
	}

	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		Scope        string `json:"scope"`
		ExpiresIn    int    `json:"expires_in"`
		// Slack nests its own shape; the fields we want are at the top level
		// for everyone else.
		Team struct {
			Name string `json:"name"`
		} `json:"team"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return Token{}, fmt.Errorf("decode token response: %w", err)
	}
	if out.Error != "" {
		return Token{}, errors.New(out.Error)
	}
	if out.AccessToken == "" {
		return Token{}, errors.New("the provider returned no access token")
	}

	tok := Token{
		AccessToken:  out.AccessToken,
		RefreshToken: out.RefreshToken,
		Scopes:       out.Scope,
		TokenType:    out.TokenType,
		Account:      out.Team.Name,
	}
	if out.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
		tok.ExpiresAt = &t
	}
	// A provider may grant FEWER scopes than were asked for. Recording what was
	// actually granted — rather than what we requested — is what stops a
	// confusing 403 later from a call nobody realised was unauthorised.
	return tok, nil
}

// callbackURL is where the vendor sends the browser back.
//
// Derived from the request rather than configured, so it is correct on
// localhost, behind a proxy and in production without three settings that can
// disagree. It must match the redirect URI registered with the vendor exactly.
func (s *Service) callbackURL(r *http.Request) string {
	scheme := "https"
	if r.TLS == nil && !strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "http"
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return fmt.Sprintf("%s://%s/api/builder/integrations/callback", scheme, host)
}

// finish renders the end of the flow.
//
// HTML rather than JSON: a human's browser lands here, and a raw JSON body is a
// dead end for them. It closes itself when it was opened as a popup and
// otherwise tells them to go back.
func (s *Service) finish(w http.ResponseWriter, ok bool, detail string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	title := "Connected"
	if !ok {
		title = "Not connected"
		w.WriteHeader(http.StatusBadRequest)
	}
	// detail is escaped: it can carry a provider's error string, which is
	// attacker-influenced in the sense that anyone can send a crafted callback.
	fmt.Fprintf(w, `<!doctype html><meta charset="utf-8">
<title>%s</title>
<body style="font:15px system-ui;padding:3rem;text-align:center">
<h1>%s</h1><p style="color:#666">%s</p>
<p><a href="/builder/sources">Back to Connections</a></p>
<script>try{if(window.opener){window.opener.postMessage({t:"oauth",ok:%t},"*");window.close()}}catch(e){}</script>`,
		htmlEscape(title), htmlEscape(title), htmlEscape(detail), ok)
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return r.Replace(s)
}

func actorOf(r *http.Request) string {
	if v := r.Header.Get("X-Actor"); v != "" {
		return v
	}
	return "operator"
}

// ─────────────────────────── the SQL store ───────────────────────────

type SQLOAuthStore struct{ DB *sql.DB }

func (s SQLOAuthStore) SaveState(ctx context.Context, st AuthState, integration, by string) error {
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO builder_oauth_states (state, integration, verifier, redirect_uri, created_by)
		VALUES ($1,$2,$3,$4,$5)`,
		st.State, integration, st.Verifier, st.RedirectURI, by)
	return err
}

func (s SQLOAuthStore) TakeState(ctx context.Context, state string) (AuthState, string, error) {
	var st AuthState
	var integration string
	// DELETE ... RETURNING makes consumption atomic: two concurrent callbacks
	// with the same state cannot both succeed, which a SELECT-then-DELETE would
	// allow.
	err := s.DB.QueryRowContext(ctx, `
		DELETE FROM builder_oauth_states
		 WHERE state = $1 AND expires_at > now()
		RETURNING state, verifier, redirect_uri, integration`, state).
		Scan(&st.State, &st.Verifier, &st.RedirectURI, &integration)
	return st, integration, err
}

func (s SQLOAuthStore) SaveToken(ctx context.Context, integration string, tok Token) error {
	// A second authorization REPLACES the first rather than accumulating, so
	// "which token is current?" has exactly one answer.
	_, err := s.DB.ExecContext(ctx, `
		INSERT INTO builder_oauth_tokens
		    (integration, account, access_token, refresh_token, scopes, token_type, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (integration, COALESCE(connection_id,'00000000-0000-0000-0000-000000000000'::uuid))
		DO UPDATE SET account=EXCLUDED.account, access_token=EXCLUDED.access_token,
		              refresh_token=COALESCE(EXCLUDED.refresh_token, builder_oauth_tokens.refresh_token),
		              scopes=EXCLUDED.scopes, token_type=EXCLUDED.token_type,
		              expires_at=EXCLUDED.expires_at, updated_at=now()`,
		integration, tok.Account, []byte(tok.AccessToken), nullBytes(tok.RefreshToken),
		tok.Scopes, tok.TokenType, tok.ExpiresAt)
	return err
}

// nullBytes keeps an absent refresh token NULL rather than empty.
//
// It matters because the refresh sweep selects on `refresh_token IS NOT NULL`,
// and a zero-length value would enrol a token that cannot be refreshed into a
// job that will try forever.
func nullBytes(s string) any {
	if s == "" {
		return nil
	}
	return []byte(s)
}
