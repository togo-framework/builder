package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The SSRF a review probe confirmed: the private-address guard ran once, in
// newCrawl, so it checked the address the OPERATOR typed and never the ones a
// stranger's page supplied. A poisoned link to cloud metadata was fetched
// server-side and retained as a memory.
func TestADiscoveredPrivateAddressIsRefused(t *testing.T) {
	internal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("fetched an internal address discovered on a page: %s", r.URL)
		fmt.Fprint(w, `<html><body><p>AWS credentials live here</p></body></html>`)
	}))
	defer internal.Close()

	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `<html><body><p>Ordinary page</p><a href="%s/latest/meta-data/">x</a></body></html>`,
			internal.URL)
	}))
	defer site.Close()

	// The guard is lifted for the START url in tests (httptest is 127.0.0.1),
	// so this asserts the off-origin refusal that also holds in production,
	// where the discovered host would be refused by the address guard too.
	off := false
	cfg, _ := json.Marshal(map[string]any{
		"startURL": site.URL + "/", "sameOriginOnly": &off, "maxDepth": 2,
	})
	src, err := newCrawl(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	c := src.(*crawlSource)
	c.c = site.Client()
	c.delay = 0

	b, err := c.Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range b.Docs {
		if strings.Contains(d.Text, "AWS credentials") {
			t.Fatal("internal content was retained as a memory")
		}
	}
	if len(b.Skipped) == 0 {
		t.Error("refusing a host must be reported, not silent")
	}
}

// A blank "User-agent:" line appears in real robots.txt files.
// strings.Contains(x, "") is true, so it claimed our group and discarded every
// rule in the "*" group with it — the one rule this connector calls
// non-negotiable, failing open on ordinary formatting.
func TestABlankUserAgentDoesNotDiscardTheWildcardGroup(t *testing.T) {
	r := parseRobots("User-agent: *\nDisallow: /private\n\nUser-agent:\nDisallow:\n", defaultCrawlAgent)
	if r.allowed("/private/secret") {
		t.Fatal("a blank User-agent line threw away the wildcard group's rules")
	}
}

// Substring matching let a group written for somebody else's bot become ours.
func TestAnotherBotsGroupIsNotOurs(t *testing.T) {
	// "crawler" is a substring of "togo-builder-crawler".
	body := "User-agent: *\nDisallow: /admin\n\nUser-agent: crawler\nAllow: /\n"
	r := parseRobots(body, defaultCrawlAgent)
	if r.allowed("/admin/secrets") {
		t.Fatal("a group named for a different bot captured ours and unlocked /admin")
	}
}

// Our own group, named exactly, still wins over the wildcard.
func TestOurOwnGroupStillApplies(t *testing.T) {
	body := "User-agent: *\nDisallow: /\n\nUser-agent: togo-builder-crawler\nDisallow: /admin\n"
	r := parseRobots(body, defaultCrawlAgent)
	if !r.allowed("/docs") {
		t.Error("our group allows everything but /admin")
	}
	if r.allowed("/admin/x") {
		t.Error("/admin is disallowed for us")
	}
}

// robots.txt is per host. Applying the start host's rules to another host can
// permit what that host forbade and forbid what it allowed.
func TestOffOriginPagesAreSkippedRatherThanCrawledUnderTheWrongRules(t *testing.T) {
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("crawled another host under this host's robots.txt: %s", r.URL)
	}))
	defer other.Close()

	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `<html><body><p>Home</p><a href="%s/page">off</a></body></html>`, other.URL)
	}))
	defer site.Close()

	off := false
	cfg, _ := json.Marshal(map[string]any{"startURL": site.URL + "/", "sameOriginOnly": &off})
	src, _ := newCrawl(cfg, nil)
	c := src.(*crawlSource)
	c.c = site.Client()
	c.delay = 0

	if _, err := c.Fetch(context.Background(), ""); err != nil {
		t.Fatal(err)
	}
}
