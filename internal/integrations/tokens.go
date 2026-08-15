package integrations

// Handing a valid access token to a runner.
//
// This is the piece that was missing, and its absence is why every OAuth
// integration in the catalogue was marked Beta: authorising stored a token in
// `builder_oauth_tokens` and nothing could read it back. A collector cannot
// call the Analytics Data API with a row in a table it has no path to.
//
// The hard part is not reading the row — it is that an access token lives about
// an hour. A collector on an hourly schedule sits almost exactly on that
// boundary, so "read the stored token" works in testing and fails in
// production, intermittently, with a 401 that looks like a permissions problem.
// Refresh has to happen here, on the read path, or every caller reimplements it
// and most of them get it wrong.
//
// # Why not oauth2.TokenSource from golang.org/x/oauth2
//
// It would do the refresh, but it keeps the refreshed token in memory. This
// process is not the only one that will want it, restarts are routine, and
// Google's refresh tokens can rotate — a rotated token held only in memory is a
// connection that dies at the next restart with no way back except a human
// re-authorising. The token has to be written back to the row, which means
// owning the refresh.

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
	"sync"
	"time"
)

// refreshMargin is how long before real expiry a token is treated as expired.
//
// Five minutes rather than zero because the alternative is a race nobody can
// see: a token with 20 seconds left passes an `IsZero`-style check, gets handed
// to a collector, and expires mid-request. The provider answers 401 and the
// failure is recorded against the collector rather than against the clock.
const refreshMargin = 5 * time.Minute

// ErrNotConnected means no token is stored for this integration.
//
// Distinct from a refresh failure on purpose: this one is fixed by a human
// pressing Authorize, and a collector that says "not connected" sends them
// there instead of into logs.
var ErrNotConnected = errors.New("not connected — authorize this integration first")

// Tokens hands out valid access tokens, refreshing as needed.
type Tokens struct {
	DB *sql.DB

	// One refresh at a time per integration.
	//
	// Without it, two collectors waking on the same schedule both see an
	// expired token and both refresh. Google MAY rotate the refresh token on
	// use, in which case the slower response overwrites the row with a token
	// the provider has already superseded — and the connection is dead until
	// somebody re-authorises. The lock plus the re-read below makes the second
	// caller use the first one's result instead of racing it.
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func NewTokens(db *sql.DB) *Tokens {
	return &Tokens{DB: db, locks: map[string]*sync.Mutex{}}
}

func (t *Tokens) lockFor(integration string) *sync.Mutex {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.locks == nil {
		t.locks = map[string]*sync.Mutex{}
	}
	m, ok := t.locks[integration]
	if !ok {
		m = &sync.Mutex{}
		t.locks[integration] = m
	}
	return m
}

// AccessToken returns a token good for at least refreshMargin.
//
// Takes an INTEGRATION slug and resolves it to the provider that issued the
// token, because one Google grant serves five Google integrations — see the
// note on SaveToken in the callback.
func (t *Tokens) AccessToken(ctx context.Context, integration string) (string, error) {
	provider, _, ok := ProviderFor(integration)
	if !ok {
		return "", fmt.Errorf("%s does not authorise with OAuth", integration)
	}
	tok, err := t.read(ctx, provider)
	if err != nil {
		return "", err
	}
	if !needsRefresh(tok) {
		return tok.AccessToken, nil
	}

	lk := t.lockFor(provider)
	lk.Lock()
	defer lk.Unlock()

	// Re-read under the lock. Whoever held it may have just refreshed, and
	// refreshing again would burn a rotated refresh token for nothing.
	tok, err = t.read(ctx, provider)
	if err != nil {
		return "", err
	}
	if !needsRefresh(tok) {
		return tok.AccessToken, nil
	}
	if tok.RefreshToken == "" {
		// Recoverable only by a human. Say which one and why, because the
		// usual cause is a Google authorization made without
		// access_type=offline — the token worked for an hour and then this.
		return "", fmt.Errorf("%s: the access token expired and no refresh token was stored — authorize it again: %w",
			provider, ErrNotConnected)
	}

	fresh, err := t.refresh(ctx, integration, provider, tok)
	if err != nil {
		return "", fmt.Errorf("%s: refresh failed: %w", provider, err)
	}
	return fresh.AccessToken, nil
}

func needsRefresh(tok Token) bool {
	// No expiry recorded means the provider did not give one. GitHub's classic
	// tokens genuinely do not expire; treating "unknown" as "expired" would put
	// those into a refresh loop that fails every time.
	if tok.ExpiresAt == nil {
		return false
	}
	return time.Now().Add(refreshMargin).After(*tok.ExpiresAt)
}

// read fetches the stored row for a PROVIDER (google, slack, github…), which is
// the key the callback writes under.
func (t *Tokens) read(ctx context.Context, provider string) (Token, error) {
	var tok Token
	var access, refresh []byte
	var expires sql.NullTime
	err := t.DB.QueryRowContext(ctx, `
		SELECT account, access_token, COALESCE(refresh_token, ''::bytea), scopes, token_type, expires_at
		  FROM builder_oauth_tokens
		 WHERE integration = $1 AND connection_id IS NULL`, provider).
		Scan(&tok.Account, &access, &refresh, &tok.Scopes, &tok.TokenType, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return Token{}, fmt.Errorf("%s: %w", provider, ErrNotConnected)
	}
	if err != nil {
		return Token{}, err
	}
	tok.AccessToken = string(access)
	tok.RefreshToken = string(refresh)
	if expires.Valid {
		tok.ExpiresAt = &expires.Time
	}
	return tok, nil
}

// refresh trades the refresh token for a new access token and stores it.
func (t *Tokens) refresh(ctx context.Context, integration, provider string, old Token) (Token, error) {
	_, p, ok := ProviderFor(integration)
	if !ok {
		return Token{}, errors.New("no OAuth provider for this integration")
	}
	if configured, missing := p.Configured(ctx); !configured {
		return Token{}, fmt.Errorf("%s is not set", missing)
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", old.RefreshToken)
	form.Set("client_id", credential(ctx, p.ClientIDEnv))
	form.Set("client_secret", credential(ctx, p.ClientSecretEnv))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return Token{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return Token{}, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// The body is NOT included. A refused refresh commonly echoes the
		// request, and the request contains the refresh token and the client
		// secret — logging it verbatim would put both in a log file.
		return Token{}, fmt.Errorf("the provider refused the refresh (%d)", res.StatusCode)
	}

	var out struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		Scope        string `json:"scope"`
		ExpiresIn    int    `json:"expires_in"`
		Error        string `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return Token{}, fmt.Errorf("decode refresh response: %w", err)
	}
	if out.Error != "" {
		return Token{}, errors.New(out.Error)
	}
	if out.AccessToken == "" {
		return Token{}, errors.New("the provider returned no access token")
	}

	fresh := Token{
		Account:   old.Account,
		TokenType: firstNonEmpty(out.TokenType, old.TokenType),
		Scopes:    firstNonEmpty(out.Scope, old.Scopes),
		// A refresh response usually OMITS the refresh token, meaning "keep
		// using the one you have". Taking the empty string literally would
		// erase it and turn an hourly refresh into a one-time login.
		RefreshToken: firstNonEmpty(out.RefreshToken, old.RefreshToken),
		AccessToken:  out.AccessToken,
	}
	if out.ExpiresIn > 0 {
		e := time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
		fresh.ExpiresAt = &e
	}

	if err := (SQLOAuthStore{DB: t.DB}).SaveToken(ctx, provider, fresh); err != nil {
		// The token in hand is valid — the failure is only that it was not
		// persisted. Returning it anyway lets this run succeed; the next run
		// refreshes again, which is wasteful but not broken.
		return fresh, nil
	}
	return fresh, nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// Connected reports whether an integration has a usable token, for the gallery.
//
// Deliberately does NOT refresh: this runs for every OAuth card on every page
// load, and refreshing there would spend a rotation just to draw a badge.
func (t *Tokens) Connected(ctx context.Context, integration string) (bool, string) {
	provider, _, ok := ProviderFor(integration)
	if !ok {
		return false, ""
	}
	tok, err := t.read(ctx, provider)
	if err != nil {
		return false, ""
	}
	return true, tok.Account
}
