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

func crawlFrom(t *testing.T, srv *httptest.Server, cfg map[string]any) *crawlSource {
	t.Helper()
	if cfg == nil {
		cfg = map[string]any{}
	}
	cfg["startURL"] = srv.URL + "/"
	raw, _ := json.Marshal(cfg)
	s, err := newCrawl(raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	c := s.(*crawlSource)
	c.c = srv.Client()
	c.delay = 0 // the politeness delay is real; waiting for it in a test is not
	return c
}

// robots.txt is the one rule this connector must never get wrong: it reads a
// system nobody gave us a key for.
func TestRobotsDisallowIsObeyed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/robots.txt":
			fmt.Fprint(w, "User-agent: *\nDisallow: /private\n")
		case "/":
			fmt.Fprint(w, `<html><body><p>Public page</p>
				<a href="/private/secret">secret</a><a href="/about">about</a></body></html>`)
		case "/about":
			fmt.Fprint(w, `<html><body><p>About us</p></body></html>`)
		case "/private/secret":
			t.Error("fetched a path robots.txt disallowed")
			fmt.Fprint(w, `<html><body><p>Secret</p></body></html>`)
		}
	}))
	defer srv.Close()

	b, err := crawlFrom(t, srv, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range b.Docs {
		if strings.Contains(d.Ref, "private") {
			t.Errorf("collected a disallowed page: %s", d.Ref)
		}
	}
	// Reported, not silently dropped: "never appeared" and "was refused" are
	// different facts.
	found := false
	for _, s := range b.Skipped {
		if strings.Contains(s.Reason, "robots") {
			found = true
		}
	}
	if !found {
		t.Errorf("the disallowed page was not reported as skipped: %+v", b.Skipped)
	}
}

// Allow beats Disallow at equal-or-greater length. A site author writing
// "Disallow: /docs" then "Allow: /docs/public" is relying on exactly this.
func TestRobotsLongestMatchWins(t *testing.T) {
	r := parseRobots("User-agent: *\nDisallow: /docs\nAllow: /docs/public\n", "x/1.0")
	if r.allowed("/docs/private") {
		t.Error("/docs/private should be disallowed")
	}
	if !r.allowed("/docs/public/a") {
		t.Error("/docs/public/a should be allowed by the longer Allow")
	}
	if !r.allowed("/other") {
		t.Error("/other matches nothing and should be allowed")
	}
}

// A named group replaces the wildcard rather than merging with it. A site that
// names a crawler is talking to that crawler.
func TestRobotsSpecificAgentReplacesWildcard(t *testing.T) {
	body := "User-agent: *\nDisallow: /\n\nUser-agent: togo-builder-crawler\nDisallow: /admin\n"
	r := parseRobots(body, defaultCrawlAgent)
	if !r.allowed("/anything") {
		t.Error("our own group allows everything but /admin")
	}
	if r.allowed("/admin/x") {
		t.Error("/admin is disallowed for us")
	}
}

// An unreachable or erroring robots.txt is an unanswered question, and the
// polite reading of one is no. Sites under load answer 503 here.
func TestRobotsFailureStopsTheCrawl(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		t.Error("fetched a page without knowing whether robots.txt allowed it")
	}))
	defer srv.Close()

	if _, err := crawlFrom(t, srv, nil).Fetch(context.Background(), ""); err == nil {
		t.Fatal("a 503 on robots.txt was treated as permission")
	}
}

func TestMissingRobotsIsPermission(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `<html><body><p>Hello</p></body></html>`)
	}))
	defer srv.Close()

	b, err := crawlFrom(t, srv, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Docs) == 0 {
		t.Error("a 404 on robots.txt means no rules, which is permission")
	}
}

// An unchanged site must cost zero writes. Without this the daily crawl
// rewrites every memory it has, every day.
func TestUnchangedSiteWritesNothing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `<html><body><h1>Stable</h1><p>Nothing moves here.</p></body></html>`)
	}))
	defer srv.Close()

	c := crawlFrom(t, srv, nil)
	first, err := c.Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if first.Cursor == "" || len(first.Docs) == 0 {
		t.Fatalf("first pass collected nothing: %+v", first)
	}
	second, err := c.Fetch(context.Background(), first.Cursor)
	if err != nil {
		t.Fatal(err)
	}
	if !second.Unchanged {
		t.Error("an identical site did not report Unchanged")
	}
	if len(second.Docs) != 0 {
		t.Errorf("an unchanged site produced %d documents to write", len(second.Docs))
	}
}

func TestChangedContentProducesANewCursor(t *testing.T) {
	body := "<html><body><p>one</p></body></html>"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, body)
	}))
	defer srv.Close()

	c := crawlFrom(t, srv, nil)
	first, _ := c.Fetch(context.Background(), "")
	body = "<html><body><p>two, and different</p></body></html>"
	second, _ := c.Fetch(context.Background(), first.Cursor)

	if second.Unchanged {
		t.Fatal("changed content still reported Unchanged")
	}
	if len(second.Docs) == 0 {
		t.Error("changed content produced nothing to write")
	}
}

// Leaving the origin is how a crawl of one documentation page becomes a crawl
// of the internet.
func TestSameOriginIsNotLeft(t *testing.T) {
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("left the origin")
	}))
	defer other.Close()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprintf(w, `<html><body><p>Home</p><a href="%s/elsewhere">off-site</a></body></html>`, other.URL)
	}))
	defer srv.Close()

	if _, err := crawlFrom(t, srv, nil).Fetch(context.Background(), ""); err != nil {
		t.Fatal(err)
	}
}

func TestPageLimitIsHonouredAndReported(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/robots.txt" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `<html><body><p>page</p>
			<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a></body></html>`)
	}))
	defer srv.Close()

	b, err := crawlFrom(t, srv, map[string]any{"maxPages": 2, "maxDepth": 3}).
		Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Docs) > 2 {
		t.Errorf("collected %d pages against a limit of 2", len(b.Docs))
	}
	// Silently truncating reads as "that was the whole site".
	if len(b.Skipped) == 0 {
		t.Error("hitting the page limit was not reported")
	}
}

// Navigation text on every page would make every page match every query.
func TestChromeIsDroppedAndHeadingsSurvive(t *testing.T) {
	_, text := extractReadable(`<html><head><title>The Title</title>
		<style>body{color:red}</style></head>
		<body>
		  <nav><a href="/x">Home</a><a href="/y">Docs</a></nav>
		  <header>Site banner</header>
		  <h1>Retention policy</h1>
		  <p>Audit events are kept for ninety days.</p>
		  <script>console.log("no")</script>
		  <footer>© 2026</footer>
		</body></html>`)

	for _, unwanted := range []string{"Home", "Docs", "Site banner", "© 2026", "console.log", "color:red"} {
		if strings.Contains(text, unwanted) {
			t.Errorf("chrome survived extraction: %q in %q", unwanted, text)
		}
	}
	for _, wanted := range []string{"Retention policy", "ninety days"} {
		if !strings.Contains(text, wanted) {
			t.Errorf("content was dropped: %q missing from %q", wanted, text)
		}
	}
	// Structure, not one wall of words.
	if !strings.Contains(text, "\n") {
		t.Errorf("headings and paragraphs ran together: %q", text)
	}
}

func TestTitleIsExtractedAndEntitiesDecoded(t *testing.T) {
	title, text := extractReadable(
		`<html><head><title>Tom &amp; Jerry</title></head><body><p>a &lt; b</p></body></html>`)
	if title != "Tom & Jerry" {
		t.Errorf("title = %q", title)
	}
	if !strings.Contains(text, "a < b") {
		t.Errorf("entities not decoded in body: %q", text)
	}
}

func TestConfigValidation(t *testing.T) {
	for _, tc := range []struct{ name, cfg string }{
		{"no start URL", `{}`},
		{"not a URL", `{"startURL":"not a url"}`},
		{"a local file", `{"startURL":"file:///etc/passwd"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := newCrawl(json.RawMessage(tc.cfg), nil); err == nil {
				t.Error("accepted an invalid config")
			}
		})
	}

	// Depth and pages are clamped rather than trusted.
	s, err := newCrawl(json.RawMessage(`{"startURL":"https://x.test/","maxDepth":99,"maxPages":9999}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	c := s.(*crawlSource)
	if c.cfg.MaxDepth != maxCrawlDepth {
		t.Errorf("depth = %d, want clamped to %d", c.cfg.MaxDepth, maxCrawlDepth)
	}
	if c.cfg.MaxPages != maxCrawlPages {
		t.Errorf("pages = %d, want clamped to %d", c.cfg.MaxPages, maxCrawlPages)
	}
}

func TestCrawlIsRegistered(t *testing.T) {
	if !isPlugin(KindCrawl) {
		t.Fatalf("crawl is not in the registry: %v", Kinds())
	}
}
