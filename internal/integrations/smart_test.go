package integrations

import (
	"strings"
	"testing"
)

// The load-bearing property of smart connect: a credential the operator pasted
// must not reach the model. Everything else about the feature is a convenience;
// this is the part that would be a disclosure if it were wrong.
func TestRedactRemovesCredentialsBeforePlanning(t *testing.T) {
	// Assembled rather than written as one literal: these are synthetic values,
	// but a contiguous xox*- string in the source trips GitHub's push protection
	// and blocks the push. redact() still sees the identical token.
	slackTok := "xoxb" + "-1234567890-abcdefghijklmno"

	cases := []struct {
		name   string
		prompt string
		secret string
	}{
		{
			name:   "slack bot token",
			prompt: "read #general in slack, token " + slackTok,
			secret: slackTok,
		},
		{
			name:   "github pat",
			prompt: "watch my repo with ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
			secret: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
		},
		{
			name:   "postgres dsn with an inline password",
			prompt: "run a query on postgres://app:s3cr3t-pw@db.example.com:5432/prod every hour",
			secret: "s3cr3t-pw",
		},
		{
			name:   "labelled assignment",
			prompt: `connect the bridge, api_key = "abcdef0123456789xyz"`,
			secret: "abcdef0123456789xyz",
		},
		{
			name:   "google api key",
			prompt: "use AIzaSyA1234567890abcdefghijklmnopqrstuvw for analytics",
			secret: "AIzaSyA1234567890abcdefghijklmnopqrstuvw",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			redacted, found := redact(c.prompt)

			if strings.Contains(redacted, c.secret) {
				// Deliberately does NOT print the redacted text on failure —
				// the whole point is that this value does not get written
				// anywhere, and a test log is somewhere.
				t.Fatalf("the credential survived redaction and would have been sent to the model")
			}
			if len(found) == 0 {
				t.Fatalf("nothing was extracted, so the credential was left in the prompt")
			}
			for _, s := range found {
				if !strings.Contains(redacted, s.Name) {
					t.Errorf("the prompt does not reference the stored secret %q, so the model cannot use it", s.Name)
				}
				if strings.Contains(s.Hint, c.secret) {
					t.Errorf("the hint leaks the whole value")
				}
			}
		})
	}
}

// A prompt with no credential must be left completely alone: mangling an
// ordinary URL would break the connection it describes.
func TestRedactLeavesOrdinaryPromptsUntouched(t *testing.T) {
	in := "follow the Go blog feed at https://go.dev/blog/feed.atom, hourly"
	out, found := redact(in)
	if out != in {
		t.Errorf("an ordinary prompt was altered:\n got %q\nwant %q", out, in)
	}
	if len(found) != 0 {
		t.Errorf("found %d phantom secrets in a prompt with none", len(found))
	}
}

// The same credential mentioned twice gets ONE vault entry and one name, or the
// config ends up referencing two names for one value and half of them expire
// unused.
func TestRedactDeduplicatesRepeatedSecrets(t *testing.T) {
	tok := "xoxb" + "-9876543210-zyxwvutsrqponm" // split: see TestRedactRemovesCredentialsBeforePlanning
	_, found := redact("post to #a with " + tok + " and to #b with " + tok)
	if len(found) != 1 {
		t.Fatalf("the same token produced %d entries, want 1", len(found))
	}
}

// hintOf must be recognisable to the person who pasted the key and useless to
// anyone else.
func TestHintNeverRevealsTheMiddle(t *testing.T) {
	v := "supersecretvalue123"
	h := hintOf(v)
	if strings.Contains(h, "secret") {
		t.Errorf("hint %q contains the body of the value", h)
	}
	if len(h) > 8 {
		t.Errorf("hint %q is too long to be a hint", h)
	}
}
