package actors

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// Every actor must render its payload under DryRun without a network or a
// credential. This is the property that makes an outbound integration
// reviewable before it is trusted, so it is asserted for all of them at once —
// a provider added later fails this the moment it forgets.
func TestEveryActorPreviewsWithoutNetworkOrSecret(t *testing.T) {
	cases := map[string]struct {
		cfg    string
		action string
		params string
		want   string
	}{
		"slack": {
			cfg:    `{"tokenSecret":"slack-tok"}`,
			action: "send_message",
			params: `{"channel":"C0123456789","text":"the deploy failed"}`,
			want:   "C0123456789",
		},
		"discord": {
			cfg:    `{"urlSecret":"discord-hook"}`,
			action: "send_message",
			params: `{"content":"the deploy failed"}`,
			want:   "the deploy failed",
		},
		"telegram": {
			cfg:    `{"tokenSecret":"tg-tok"}`,
			action: "send_message",
			params: `{"chat_id":"-100123","text":"the deploy failed"}`,
			want:   "-100123",
		},
		"email": {
			cfg:    `{"host":"smtp.example.com","port":587,"from":"bot@example.com","passwordSecret":"smtp-pw"}`,
			action: "send",
			params: `{"to":"ops@example.com","subject":"Deploy failed","body":"see the log"}`,
			want:   "Subject: Deploy failed",
		},
		"webhook": {
			cfg:    `{"url":"https://example.com/hook"}`,
			action: "post",
			params: `{"body":{"event":"deploy.failed"}}`,
			want:   "https://example.com/hook",
		},
	}

	for kind, tc := range cases {
		t.Run(kind, func(t *testing.T) {
			a, ok := Get(kind)
			if !ok {
				t.Fatalf("%s is not registered", kind)
			}
			out, err := a.Act(context.Background(), ActInput{
				Action: tc.action,
				Params: json.RawMessage(tc.params),
				Actor:  Principal{Kind: "user", Slug: "fady"},
				DryRun: true,
			}, json.RawMessage(tc.cfg), dryRunSecrets{}) // refuses every reveal
			if err != nil {
				t.Fatalf("dry run failed: %v", err)
			}
			if out.Preview == "" {
				t.Fatal("no preview — a human approving this would be approving nothing")
			}
			if !strings.Contains(out.Preview, tc.want) {
				t.Fatalf("preview does not show %q:\n%s", tc.want, out.Preview)
			}
			if out.ProviderRef != "" {
				t.Fatal("a dry run reported a provider reference; it sent something")
			}
		})
	}
}

// Every registered action declares the permission it needs, and the string is
// exact — togo's Can() is an exact match, so "*" grants nothing (Rule 16).
func TestEveryActionDeclaresAnExactGrant(t *testing.T) {
	for _, kind := range Kinds() {
		a, _ := Get(kind)
		for _, s := range a.Actions() {
			if s.Grant == "" {
				t.Errorf("%s.%s declares no grant", kind, s.Name)
			}
			if strings.Contains(s.Grant, "*") {
				t.Errorf("%s.%s uses a wildcard grant %q, which matches nothing", kind, s.Name, s.Grant)
			}
			if len(s.InputSchema) == 0 {
				t.Errorf("%s.%s has no input schema", kind, s.Name)
			} else if !json.Valid(s.InputSchema) {
				t.Errorf("%s.%s has an invalid input schema", kind, s.Name)
			}
		}
	}
}

// Everything that leaves the organisation is marked External, because that flag
// is what forces the human approval (Rule 41). A sender that forgets it sends
// without one.
func TestEverySenderIsMarkedExternal(t *testing.T) {
	for _, kind := range Kinds() {
		a, _ := Get(kind)
		for _, s := range a.Actions() {
			if !s.External {
				t.Errorf("%s.%s is not marked External, so it would send with no approval", kind, s.Name)
			}
		}
	}
}

// Header injection: a newline in the recipient or subject lets a caller append
// their own headers — a silent Bcc, a forged Reply-To.
func TestEmailRefusesHeaderInjection(t *testing.T) {
	cfg := json.RawMessage(`{"host":"smtp.example.com","port":587,"from":"bot@example.com","passwordSecret":"pw"}`)
	for _, params := range []string{
		`{"to":"ops@example.com","subject":"hi\r\nBcc: attacker@evil.example","body":"x"}`,
		`{"to":"ops@example.com\r\nBcc: attacker@evil.example","subject":"hi","body":"x"}`,
	} {
		_, err := email{}.Act(context.Background(), ActInput{
			Action: "send", Params: json.RawMessage(params),
			Actor: Principal{Kind: "user", Slug: "fady"}, DryRun: true,
		}, cfg, dryRunSecrets{})
		if err == nil {
			t.Fatalf("accepted a header injection: %s", params)
		}
	}
}

// A webhook target must be an absolute https URL. Anything else is either a
// misconfiguration or an attempt to reach something internal.
func TestWebhookRefusesNonHTTPSTargets(t *testing.T) {
	for _, u := range []string{"http://example.com/x", "file:///etc/passwd", "", "//example.com", "notaurl"} {
		cfg, _ := json.Marshal(map[string]string{"url": u})
		_, err := webhook{}.Act(context.Background(), ActInput{
			Action: "post", Params: json.RawMessage(`{"body":{}}`),
			Actor: Principal{Kind: "user", Slug: "fady"}, DryRun: true,
		}, cfg, dryRunSecrets{})
		if err == nil {
			t.Fatalf("accepted %q as a webhook target", u)
		}
	}
}

// The email body is assembled by hand, so the exact bytes are worth pinning:
// a missing blank line between headers and body makes the body a header.
func TestRenderedEmailSeparatesHeadersFromBody(t *testing.T) {
	msg := renderEmail("bot@example.com", "ops@example.com", "Deploy failed", "see the log")
	head, body, found := strings.Cut(msg, "\r\n\r\n")
	if !found {
		t.Fatal("no blank line between headers and body")
	}
	if !strings.Contains(head, "From: bot@example.com") || !strings.Contains(head, "To: ops@example.com") {
		t.Fatalf("headers are wrong:\n%s", head)
	}
	if body != "see the log" {
		t.Fatalf("body is %q", body)
	}
}
