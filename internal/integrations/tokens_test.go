package integrations

import (
	"testing"
	"time"
)

func TestNeedsRefresh(t *testing.T) {
	now := time.Now()
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }

	cases := []struct {
		name string
		tok  Token
		want bool
		why  string
	}{
		{
			name: "no expiry recorded",
			tok:  Token{ExpiresAt: nil},
			want: false,
			why: "a provider that gives no expiry (GitHub classic tokens) must not be " +
				"put into a refresh loop that fails every time",
		},
		{
			name: "expires in an hour",
			tok:  Token{ExpiresAt: at(time.Hour)},
			want: false,
		},
		{
			name: "already expired",
			tok:  Token{ExpiresAt: at(-time.Minute)},
			want: true,
		},
		{
			// The case the margin exists for. Without it this token is handed
			// to a collector and dies mid-request, and the 401 is recorded
			// against the collector rather than against the clock.
			name: "expires in 20 seconds",
			tok:  Token{ExpiresAt: at(20 * time.Second)},
			want: true,
			why:  "a token about to expire must be refreshed before it is handed out",
		},
		{
			name: "expires just outside the margin",
			tok:  Token{ExpiresAt: at(refreshMargin + time.Minute)},
			want: false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := needsRefresh(c.tok); got != c.want {
				t.Errorf("needsRefresh = %v, want %v. %s", got, c.want, c.why)
			}
		})
	}
}

// A refresh response usually omits the refresh token, meaning "keep the one you
// have". Taking that empty string literally erases it, and the connection dies
// at the NEXT refresh rather than this one — an hour later, somewhere else.
func TestRefreshKeepsTheOldRefreshTokenWhenTheProviderOmitsIt(t *testing.T) {
	if got := firstNonEmpty("", "old-refresh"); got != "old-refresh" {
		t.Fatalf("an omitted refresh token must leave the stored one intact, got %q", got)
	}
	// A rotated one replaces it.
	if got := firstNonEmpty("new-refresh", "old-refresh"); got != "new-refresh" {
		t.Fatalf("a rotated refresh token must replace the stored one, got %q", got)
	}
}

// Every OAuth integration in the catalogue must resolve to a provider, or
// authorising it succeeds and refreshing it can never work.
func TestEveryOAuthIntegrationHasAProvider(t *testing.T) {
	for _, i := range All() {
		if i.Auth != AuthOAuth {
			continue
		}
		if _, _, ok := ProviderFor(i.Slug); !ok {
			t.Errorf("%s declares OAuth but ProviderFor has no entry — its token could never be refreshed", i.Slug)
		}
	}
}
