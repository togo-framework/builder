package mcp

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

const initializeBody = `{"jsonrpc":"2.0","id":1,"method":"initialize","params":` +
	`{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}`

// post sends an MCP initialize to url while claiming to be host, the way a
// reverse proxy presents a public request to a loopback listener.
func post(t *testing.T, url, host string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(initializeBody))
	if err != nil {
		t.Fatal(err)
	}
	if host != "" {
		req.Host = host
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

// TestProxiedHostIsAccepted is the production bug, kept as a test.
//
// The builder runs behind a same-host reverse proxy: TLS terminates at the
// proxy for a public domain and the proxy dials 127.0.0.1. The SDK's
// DNS-rebinding guard sees a loopback connection carrying a public Host header
// and refuses with 403 before the handler runs — which reached a client as
// "the server rejected your token", for a request whose token was fine.
//
// The control case is deliberate: it pins the SDK behaviour we are overriding,
// so if a future SDK stops refusing, this test says so rather than quietly
// passing for a new reason.
func TestProxiedHostIsAccepted(t *testing.T) {
	newServer := func(*http.Request) *sdk.Server {
		return sdk.NewServer(&sdk.Implementation{Name: "builder-test", Version: "0"}, nil)
	}

	t.Run("with our options", func(t *testing.T) {
		srv := httptest.NewServer(sdk.NewStreamableHTTPHandler(newServer, streamableOpts()))
		defer srv.Close()

		res := post(t, srv.URL, "builder.example.com")
		if res.StatusCode == http.StatusForbidden {
			body, _ := io.ReadAll(res.Body)
			t.Fatalf("a proxied request was refused: %d %s", res.StatusCode, strings.TrimSpace(string(body)))
		}
		if res.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(res.Body)
			t.Fatalf("initialize: got %d, want 200: %s", res.StatusCode, strings.TrimSpace(string(body)))
		}
	})

	t.Run("SDK default still refuses", func(t *testing.T) {
		srv := httptest.NewServer(sdk.NewStreamableHTTPHandler(newServer, nil))
		defer srv.Close()

		res := post(t, srv.URL, "builder.example.com")
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("the SDK no longer refuses a proxied Host (%d) — "+
				"re-read whether streamableOpts still needs to disable it", res.StatusCode)
		}
	})
}

// TestMissingTokenIs401 is the honesty claim: a caller with no credential must
// be told that, with the header that makes a client ask for one. A 403 here
// would send an operator hunting for a CSRF or an origin problem they do not
// have.
//
// The cases stay on the pre-database half of authenticate deliberately: what is
// being asserted is the shape of the refusal, not the token lookup.
func TestMissingTokenIs401(t *testing.T) {
	s := &Service{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	guarded := s.requireToken("feedback", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("an unauthenticated request reached the MCP handler")
		w.WriteHeader(http.StatusOK)
	}))

	srv := httptest.NewServer(guarded)
	defer srv.Close()

	for _, tc := range []struct {
		name, header string
	}{
		{"no header", ""},
		{"not a bearer", "Basic abc"},
		{"bearer, wrong shape", "Bearer short"},
		{"bearer, foreign token", "Bearer eyJhbGciOiJIUzI1NiJ9.not.ours"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodPost, srv.URL, strings.NewReader(initializeBody))
			if err != nil {
				t.Fatal(err)
			}
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()

			if res.StatusCode != http.StatusUnauthorized {
				t.Errorf("got %d, want 401", res.StatusCode)
			}
			if got := res.Header.Get("WWW-Authenticate"); !strings.Contains(got, "Bearer") {
				t.Errorf("WWW-Authenticate = %q, want a Bearer challenge", got)
			}
		})
	}
}
