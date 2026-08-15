package integrations

// Configuring a provider's OAuth APP, at runtime.
//
//	GET  /oauth-app            which providers are configured, and which are not
//	PUT  /oauth-app/{provider} store a client id and secret
//
// # Why this endpoint exists
//
// Before it, connecting Google meant editing `.env` and restarting the process.
// That is a deployment operation, and it put OAuth permanently out of reach of
// anything that is not a human with shell access — including the agent this
// system exists to give capabilities to. "Connect Google Analytics for me" had
// no possible implementation.
//
// # What it deliberately does NOT do
//
// It never reads a client secret back. There is no GET that returns one, and
// the status response carries a hint (a few characters) rather than a value.
// A configuration screen that shows you the secret you already typed is a
// convenience worth exactly nothing and a disclosure worth quite a lot: it puts
// the credential in a response body, a browser cache, and any screenshot of the
// page.
//
// The operator still has to create the OAuth app at the vendor and paste the
// redirect URI, because only they can agree to the vendor's terms and only they
// own the account. What this removes is the restart, not the consent.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
)

// CredentialWriter stores installation-owned credentials.
type CredentialWriter interface {
	PutSystem(ctx context.Context, name, value, reason string) error
}

var credWriter CredentialWriter

// SetCredentialWriter installs the vault writer. Called once during boot.
func SetCredentialWriter(w CredentialWriter) { credWriter = w }

// OAuthAppRoutes mounts the provider-configuration surface.
func (s *Service) OAuthAppRoutes(r chi.Router) {
	r.Get("/oauth-app", s.handleOAuthAppList)
	r.Put("/oauth-app/{provider}", s.handleOAuthAppPut)
}

type oauthAppView struct {
	Provider string `json:"provider"`
	// Which integrations this one grant serves. The single most confusing
	// thing about the Google app is that configuring it connects five cards,
	// and saying so here is cheaper than explaining it afterwards.
	Serves []string `json:"serves"`
	// Configured is the only status that matters. Deliberately not "has id but
	// not secret" — a half-configured app fails at the vendor with a message
	// nobody can act on, so it is reported as not configured.
	Configured bool `json:"configured"`
	// Source says WHERE the credential was found, because "I set it and it
	// still says not configured" is otherwise unanswerable — the usual cause is
	// an env var set in a different process than the one serving this.
	Source string `json:"source"`
	// RedirectURI is what the operator must paste into the vendor's console.
	// Computed from the request so it is right on localhost, behind a proxy and
	// in production, rather than being a value in the docs that drifts.
	RedirectURI string   `json:"redirectUri"`
	Scopes      []string `json:"scopes"`
	ClientIDEnv string   `json:"clientIdEnv"`
}

func (s *Service) handleOAuthAppList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// provider → the integrations it serves.
	serves := map[string][]string{}
	for _, i := range All() {
		if i.Auth != AuthOAuth {
			continue
		}
		if name, _, ok := ProviderFor(i.Slug); ok {
			serves[name] = append(serves[name], i.Slug)
		}
	}

	out := make([]oauthAppView, 0, len(providers))
	for name, p := range providers {
		configured, _ := p.Configured(ctx)
		sort.Strings(serves[name])
		out = append(out, oauthAppView{
			Provider:    name,
			Serves:      serves[name],
			Configured:  configured,
			Source:      credentialSource(ctx, p.ClientIDEnv),
			RedirectURI: s.callbackURL(r),
			Scopes:      p.Scopes,
			ClientIDEnv: p.ClientIDEnv,
		})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Provider < out[b].Provider })
	writeJSON(w, http.StatusOK, map[string]any{"apps": out})
}

// credentialSource reports where a credential was resolved from.
func credentialSource(ctx context.Context, envName string) string {
	if creds != nil && creds.HasSecret(ctx, vaultSecretName(envName)) {
		return "vault"
	}
	if os.Getenv(envName) != "" {
		// Worth distinguishing: an env-sourced credential cannot be changed
		// without a restart, and an operator wondering why their update did
		// nothing is usually looking at one of these.
		return "env"
	}
	return "unset"
}

type oauthAppReq struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

func (s *Service) handleOAuthAppPut(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "provider")
	p, ok := providers[name]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error":     fmt.Sprintf("no OAuth provider %q", name),
			"providers": providerNames(),
		})
		return
	}
	if credWriter == nil {
		httpErr(w, http.StatusServiceUnavailable,
			"the vault is unavailable, so credentials cannot be stored — set them in the environment instead")
		return
	}

	var in oauthAppReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	in.ClientID, in.ClientSecret = strings.TrimSpace(in.ClientID), strings.TrimSpace(in.ClientSecret)
	if in.ClientID == "" || in.ClientSecret == "" {
		// Both or neither. A stored id with no secret is a provider that looks
		// configured on the card and fails at the vendor.
		httpErr(w, http.StatusUnprocessableEntity, "both clientId and clientSecret are required")
		return
	}

	if err := credWriter.PutSystem(r.Context(), vaultSecretName(p.ClientIDEnv), in.ClientID, "oauth-app"); err != nil {
		s.log.Error("store oauth client id", "provider", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not store the client id")
		return
	}
	if err := credWriter.PutSystem(r.Context(), vaultSecretName(p.ClientSecretEnv), in.ClientSecret, "oauth-app"); err != nil {
		// The id landed and the secret did not. Say so precisely rather than
		// "could not save": the operator needs to know the state is now
		// half-written, and that re-submitting is the fix.
		s.log.Error("store oauth client secret", "provider", name, "err", err)
		httpErr(w, http.StatusInternalServerError,
			"the client id was stored but the secret was not — submit both again")
		return
	}

	// No restart. The next Configured/AuthorizeURL call reads the vault.
	s.log.Info("oauth app configured", "provider", name)
	writeJSON(w, http.StatusOK, map[string]any{
		"provider":    name,
		"configured":  true,
		"redirectUri": s.callbackURL(r),
		"next":        "Paste that redirect URI into the provider's OAuth app, then press Authorize.",
	})
}

func providerNames() []string {
	out := make([]string, 0, len(providers))
	for k := range providers {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
