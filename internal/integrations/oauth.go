package integrations

// OAuth, declared once and reused.
//
// "Anything that can support OAuth should support it the easy way" means the
// per-provider part has to be DATA — an authorize URL, a token URL, some scopes
// — and everything hard has to be shared: the state parameter, PKCE, the
// exchange, refresh-before-expiry, and storage.
//
// # Why this is not blocked by SF-001
//
// The vault models a secret a human placed once and several principals later
// ask to reveal. An OAuth token is a different shape: the provider issues it to
// one connection, it expires on its own, a refresh replaces it silently, and
// nobody else reads it. Pushing that through the grants table would need a
// principal per connection — which is exactly the foreign-key impossibility
// SF-001 describes. It gets its own table instead (migration 0021), so OAuth
// integrations work today.
//
// # The two security properties that matter
//
//  1. `state` is generated here, stored, single-use and short-lived. Without it
//     an attacker hands a victim a callback carrying the attacker's own code,
//     and the victim's connection ends up bound to the attacker's account.
//  2. PKCE, on every provider that accepts it. An authorization code
//     intercepted in transit is useless without the verifier that never left
//     this process.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Provider is the per-vendor half of an OAuth flow — all data.
type Provider struct {
	// AuthURL and TokenURL are the vendor's endpoints.
	AuthURL  string
	TokenURL string
	// Scopes are what we ask for. Least privilege: read-only wherever the
	// vendor offers a read-only scope, because an integration that collects
	// analytics has no business being able to change them.
	Scopes []string
	// ClientIDEnv / ClientSecretEnv name the env vars holding the app
	// credentials. The NAMES are declared; the values are never in code.
	ClientIDEnv     string
	ClientSecretEnv string
	// Extra query parameters on the authorize leg. Google needs
	// access_type=offline to issue a refresh token at all, and prompt=consent
	// to reissue one when the user has authorised before — without both, a
	// second authorization silently returns no refresh token and the
	// integration dies an hour later.
	AuthParams map[string]string
	// UsesPKCE — send a code challenge. Harmless where supported.
	UsesPKCE bool
	// AccountFrom names the field in the token or userinfo response that
	// identifies the account, so the UI can say whose it is.
	AccountFrom string
}

// providers is the whole per-vendor surface. Adding one is this literal plus a
// registry entry — no new flow code.
var providers = map[string]Provider{
	"google": {
		AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL: "https://oauth2.googleapis.com/token",
		// One Google app covers every Google integration, so this is the union
		// of what any of them needs. That is a real trade: the consent screen
		// asks for Gmail even when the operator only wants Analytics, which is
		// more than that person is agreeing to and looks alarming.
		//
		// The alternative — a provider entry per Google product — means the
		// operator registers and configures several OAuth apps in Google Cloud
		// to connect several Google products, and re-does it for each. Google
		// itself treats these as one app with incremental consent.
		//
		// Every scope here is READONLY. Nothing in this list can send mail,
		// change a calendar, or alter an analytics property, so the blast
		// radius of the over-broad consent is "reads more than it uses" rather
		// than "can act".
		Scopes: []string{
			"https://www.googleapis.com/auth/analytics.readonly",
			"https://www.googleapis.com/auth/webmasters.readonly",
			// Gmail: metadata and bodies of messages, never send. `gmail.send`
			// is deliberately absent — an agent that can email from the
			// operator's own address is a different risk, and Rule 41 makes
			// external sending a human's decision anyway.
			"https://www.googleapis.com/auth/gmail.readonly",
			// Calendar covers Meet: a Meet conference is a field on a calendar
			// event, not a separate API, so there is no meet.readonly to ask
			// for.
			"https://www.googleapis.com/auth/calendar.readonly",
			"openid", "email",
		},
		ClientIDEnv:     "GOOGLE_OAUTH_CLIENT_ID",
		ClientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
		AuthParams: map[string]string{
			"access_type": "offline",
			"prompt":      "consent",
		},
		UsesPKCE:    true,
		AccountFrom: "email",
	},
	"slack": {
		AuthURL:         "https://slack.com/oauth/v2/authorize",
		TokenURL:        "https://slack.com/api/oauth.v2.access",
		Scopes:          []string{"channels:history", "channels:read", "chat:write", "users:read"},
		ClientIDEnv:     "SLACK_OAUTH_CLIENT_ID",
		ClientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
		AccountFrom:     "team",
	},
	"github": {
		AuthURL:         "https://github.com/login/oauth/authorize",
		TokenURL:        "https://github.com/login/oauth/access_token",
		Scopes:          []string{"repo", "read:org"},
		ClientIDEnv:     "GITHUB_OAUTH_CLIENT_ID",
		ClientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
		AccountFrom:     "login",
	},
	"discord": {
		AuthURL:         "https://discord.com/oauth2/authorize",
		TokenURL:        "https://discord.com/api/oauth2/token",
		Scopes:          []string{"bot", "identify", "guilds"},
		ClientIDEnv:     "DISCORD_OAUTH_CLIENT_ID",
		ClientSecretEnv: "DISCORD_OAUTH_CLIENT_SECRET",
		UsesPKCE:        true,
		AccountFrom:     "username",
	},
}

// ProviderFor returns the OAuth provider an integration authorises against.
func ProviderFor(slug string) (string, Provider, bool) {
	name := map[string]string{
		"google-analytics":      "google",
		"google-search-console": "google",
		"gmail":                 "google",
		"google-calendar":       "google",
		"google-meet":           "google",
		"slack":                 "slack",
		"discord":               "discord",
		"gh":                    "github",
	}[slug]
	if name == "" {
		return "", Provider{}, false
	}
	p, ok := providers[name]
	return name, p, ok
}

// ─────────────────────── where the app credentials live ───────────────────────
//
// The VAULT first, the environment second.
//
// Reading these only from os.Getenv made connecting a provider a deployment
// operation: edit .env, restart the process. That is fine for a human at a
// terminal and impossible for anything else — an agent asked to "connect Google
// Analytics" could store the credential nowhere it would be read, and no
// endpoint could accept one, because the value was resolved from the process
// environment at every use.
//
// Putting them in the vault makes an OAuth app the same kind of thing as every
// other credential this system holds: stored once, by name, encrypted at rest,
// and readable at the moment of use without a restart.
//
// The environment is kept as a FALLBACK rather than removed. Installations
// already running have these in .env, and a change that silently disconnects
// them is not an improvement.

// vaultSecretName is where a provider's credential lives in the vault.
//
// Derived from the env var name rather than invented, so the two spellings of
// "the Google client secret" cannot drift: oauth.GOOGLE_OAUTH_CLIENT_SECRET.
func vaultSecretName(envName string) string { return "oauth." + envName }

// creds is the reader used to resolve app credentials. nil means env-only,
// which is the correct behaviour before the vault is wired at boot.
var creds interface {
	RevealSystem(ctx context.Context, name, reason string) (string, error)
	HasSecret(ctx context.Context, name string) bool
}

// SetCredentialStore installs the vault reader. Called once during boot.
func SetCredentialStore(v interface {
	RevealSystem(ctx context.Context, name, reason string) (string, error)
	HasSecret(ctx context.Context, name string) bool
}) {
	creds = v
}

// credential resolves one app credential: vault, then environment.
func credential(ctx context.Context, envName string) string {
	if creds != nil {
		if v, err := creds.RevealSystem(ctx, vaultSecretName(envName), "oauth"); err == nil && v != "" {
			return v
		}
	}
	return os.Getenv(envName)
}

// hasCredential answers "is this configured?" WITHOUT decrypting.
//
// Called for every OAuth card on every gallery load; decrypting a client secret
// to decide whether to enable a button would write an audit row dozens of times
// a day for a value nobody uses.
func hasCredential(ctx context.Context, envName string) bool {
	if creds != nil && creds.HasSecret(ctx, vaultSecretName(envName)) {
		return true
	}
	return os.Getenv(envName) != ""
}

// Configured reports whether the operator has supplied this provider's app
// credentials.
//
// Checked BEFORE showing a Connect button: an OAuth button that redirects to a
// vendor error page because no client id is set is worse than a card that says
// what is missing.
func (p Provider) Configured(ctx context.Context) (bool, string) {
	if !hasCredential(ctx, p.ClientIDEnv) {
		return false, p.ClientIDEnv
	}
	if !hasCredential(ctx, p.ClientSecretEnv) {
		return false, p.ClientSecretEnv
	}
	return true, ""
}

// AuthState is one in-flight authorization.
type AuthState struct {
	State       string
	Verifier    string
	Challenge   string
	RedirectURI string
}

// NewAuthState mints the CSRF state and the PKCE pair.
func NewAuthState(redirectURI string) (AuthState, error) {
	state, err := randomToken(32)
	if err != nil {
		return AuthState{}, err
	}
	verifier, err := randomToken(64)
	if err != nil {
		return AuthState{}, err
	}
	sum := sha256.Sum256([]byte(verifier))
	return AuthState{
		State:       state,
		Verifier:    verifier,
		Challenge:   base64.RawURLEncoding.EncodeToString(sum[:]),
		RedirectURI: redirectURI,
	}, nil
}

// AuthorizeURL builds the redirect the operator's browser follows.
func (p Provider) AuthorizeURL(ctx context.Context, st AuthState) (string, error) {
	ok, missing := p.Configured(ctx)
	if !ok {
		return "", fmt.Errorf("%s is not set — this provider's OAuth app is not configured", missing)
	}
	q := url.Values{}
	q.Set("client_id", credential(ctx, p.ClientIDEnv))
	q.Set("redirect_uri", st.RedirectURI)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(p.Scopes, " "))
	q.Set("state", st.State)
	if p.UsesPKCE {
		q.Set("code_challenge", st.Challenge)
		q.Set("code_challenge_method", "S256")
	}
	for k, v := range p.AuthParams {
		q.Set(k, v)
	}
	return p.AuthURL + "?" + q.Encode(), nil
}

// randomToken returns a URL-safe random string.
//
// crypto/rand, not math/rand: this value is the CSRF defence for the whole
// flow, and a predictable state is the same as no state at all.
func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
