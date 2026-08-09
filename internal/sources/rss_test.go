package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// --- fixture builders ------------------------------------------------------
//
// These build just enough RSS 2.0 / Atom 1.0 XML to drive the parser. HTML in
// description/summary/content fields is entity-escaped, the way a real feed
// carries it — encoding/xml unescapes it back to literal markup on decode, so
// what rssHTMLToText sees here is exactly what it sees from a live feed.

func rssFeedXML(items ...string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>` +
		`<rss version="2.0"><channel><title>Test Feed</title>` +
		strings.Join(items, "") + `</channel></rss>`
}

func rssItemXML(guid, link, title, descHTML, pubDate string) string {
	var b strings.Builder
	b.WriteString("<item>")
	if title != "" {
		fmt.Fprintf(&b, "<title>%s</title>", title)
	}
	if link != "" {
		fmt.Fprintf(&b, "<link>%s</link>", link)
	}
	if guid != "" {
		fmt.Fprintf(&b, "<guid>%s</guid>", guid)
	}
	if descHTML != "" {
		fmt.Fprintf(&b, "<description>%s</description>", descHTML)
	}
	if pubDate != "" {
		fmt.Fprintf(&b, "<pubDate>%s</pubDate>", pubDate)
	}
	b.WriteString("</item>")
	return b.String()
}

func atomFeedXML(entries ...string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>` +
		`<feed xmlns="http://www.w3.org/2005/Atom"><title>Test Feed</title>` +
		strings.Join(entries, "") + `</feed>`
}

func atomEntryXML(id, link, title, summaryHTML, published string) string {
	var b strings.Builder
	b.WriteString("<entry>")
	if title != "" {
		fmt.Fprintf(&b, "<title>%s</title>", title)
	}
	if link != "" {
		fmt.Fprintf(&b, `<link rel="alternate" href="%s"/>`, link)
	}
	if id != "" {
		fmt.Fprintf(&b, "<id>%s</id>", id)
	}
	if summaryHTML != "" {
		fmt.Fprintf(&b, "<summary>%s</summary>", summaryHTML)
	}
	if published != "" {
		fmt.Fprintf(&b, "<published>%s</published>", published)
	}
	b.WriteString("</entry>")
	return b.String()
}

// esc turns literal HTML into the entity-escaped form a real feed carries it
// in, so a test can write a readable string and get realistic XML out of it.
func esc(html string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(html)
}

// rfc1123z formats t the way a real RSS pubDate looks; it is one of the
// layouts rssParseDate tries.
func rfc1123z(t time.Time) string { return t.Format(time.RFC1123Z) }

// --- test server -------------------------------------------------------

// feedServer serves whatever `body` currently points at from GET /feed, plus
// a fixed set of article pages for fetchFull, and records how many times
// /feed was hit. body is read fresh on every request, so a test can rewrite
// it between two Fetch calls to simulate the feed changing.
type feedServer struct {
	body      *string
	feedCT    string // Content-Type sent for /feed; deliberately wrong in some tests
	articles  map[string]string
	articleCT map[string]int // path -> status code override
	hits      int
}

func newFeedServer(t *testing.T, body string) (*feedServer, string) {
	t.Helper()
	fs := &feedServer{body: &body, feedCT: "application/rss+xml", articles: map[string]string{}, articleCT: map[string]int{}}
	srv := httptest.NewServer(http.HandlerFunc(fs.serve))
	t.Cleanup(srv.Close)
	return fs, srv.URL + "/feed"
}

func (fs *feedServer) serve(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/feed":
		fs.hits++
		w.Header().Set("Content-Type", fs.feedCT)
		fmt.Fprint(w, *fs.body)
	default:
		if status, ok := fs.articleCT[r.URL.Path]; ok {
			http.Error(w, "boom", status)
			return
		}
		if page, ok := fs.articles[r.URL.Path]; ok {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, page)
			return
		}
		http.NotFound(w, r)
	}
}

func newRSSSource(t *testing.T, feedURL string, extra map[string]any) *rssSource {
	t.Helper()
	cfg := map[string]any{"feedURL": feedURL}
	for k, v := range extra {
		cfg[k] = v
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	src, err := newRSS(raw, nil)
	if err != nil {
		t.Fatalf("newRSS: %v", err)
	}
	return src.(*rssSource)
}

// --- config validation ---------------------------------------------------

func TestRSSConfigValidation(t *testing.T) {
	for _, tc := range []struct {
		name, cfg string
	}{
		{"missing feedURL", `{}`},
		{"blank feedURL", `{"feedURL":"   "}`},
		{"not a URL", `{"feedURL":"://not a url"}`},
		{"no host", `{"feedURL":"https:///path"}`},
		{"unsupported scheme", `{"feedURL":"ftp://example.test/feed"}`},
		{"userinfo credential smuggled into the URL", `{"feedURL":"https://user:secret@example.test/feed"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := newRSS(json.RawMessage(tc.cfg), nil); err == nil {
				t.Error("accepted an invalid config")
			}
		})
	}
}

func TestRSSConfigDefaultsAndCaps(t *testing.T) {
	s := newRSSSource(t, "https://example.test/feed", nil)
	if s.cfg.MaxEntries != rssDefaultMaxEntries {
		t.Errorf("maxEntries default = %d, want %d", s.cfg.MaxEntries, rssDefaultMaxEntries)
	}
	if s.cfg.FetchFull {
		t.Error("fetchFull should default to false")
	}

	over := newRSSSource(t, "https://example.test/feed", map[string]any{"maxEntries": 9999})
	if over.cfg.MaxEntries != rssHardMaxEntries {
		t.Errorf("maxEntries = %d, want clamped to %d", over.cfg.MaxEntries, rssHardMaxEntries)
	}

	negative := newRSSSource(t, "https://example.test/feed", map[string]any{"maxEntries": -5})
	if negative.cfg.MaxEntries != rssDefaultMaxEntries {
		t.Errorf("a non-positive maxEntries should fall back to the default, got %d", negative.cfg.MaxEntries)
	}
}

func TestRSSKindAndName(t *testing.T) {
	s := newRSSSource(t, "https://example.test/feed", nil)
	if s.Kind() != KindRSS {
		t.Errorf("Kind() = %q, want %q", s.Kind(), KindRSS)
	}
	if s.Name() != "https://example.test/feed" {
		t.Errorf("Name() = %q, want the feed URL", s.Name())
	}
}

func TestRSSIsRegistered(t *testing.T) {
	if !isPlugin(KindRSS) {
		t.Fatalf("rss is not in the registry: %v", Kinds())
	}
}

// --- parsing: RSS 2.0 and Atom 1.0 from the same entry point --------------

// The content type is deliberately wrong (text/html) — issue #42 asks for the
// root element to be sniffed rather than the format trusted from the header,
// because plenty of real feeds are served with the wrong Content-Type.
func TestParsesRSS2FeedIgnoringContentType(t *testing.T) {
	body := rssFeedXML(
		rssItemXML("guid-1", "https://example.test/a", "First post",
			esc("<p>Hello <b>world</b>.</p><p>Second paragraph.</p>"), rfc1123z(time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC))),
		// No guid: falls back to the link, per issue #42.
		rssItemXML("", "https://example.test/b", "Second post",
			esc("<p>No guid here.</p>"), rfc1123z(time.Date(2026, 1, 2, 12, 0, 0, 0, time.UTC))),
	)
	fs, feedURL := newFeedServer(t, body)
	fs.feedCT = "text/html; charset=utf-8" // wrong on purpose

	batch, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 2 {
		t.Fatalf("got %d docs, want 2: %+v", len(batch.Docs), batch.Docs)
	}

	first := batch.Docs[0]
	if first.Ref != "guid-1" {
		t.Errorf("Ref = %q, want the guid", first.Ref)
	}
	if !strings.Contains(first.Title, "First post") {
		t.Errorf("Title = %q, missing entry title", first.Title)
	}
	if strings.Contains(first.Text, "<") || strings.Contains(first.Text, ">") {
		t.Errorf("HTML survived stripping: %q", first.Text)
	}
	if !strings.Contains(first.Text, "Hello world.") {
		t.Errorf("readable text missing: %q", first.Text)
	}
	if !strings.Contains(first.Text, "\n") {
		t.Errorf("paragraph break was not preserved: %q", first.Text)
	}

	second := batch.Docs[1]
	if second.Ref != "https://example.test/b" {
		t.Errorf("Ref = %q, want the link fallback since there is no guid", second.Ref)
	}
}

func TestParsesAtomFeed(t *testing.T) {
	body := atomFeedXML(
		atomEntryXML("urn:uuid:entry-1", "https://example.test/atom/a", "Atom post",
			esc("<p>Atom <em>summary</em>.</p>"), time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC).Format(time.RFC3339)),
	)
	fs, feedURL := newFeedServer(t, body)
	fs.feedCT = "application/xml" // generic, not application/atom+xml

	batch, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 1 {
		t.Fatalf("got %d docs, want 1: %+v", len(batch.Docs), batch.Docs)
	}
	d := batch.Docs[0]
	if d.Ref != "urn:uuid:entry-1" {
		t.Errorf("Ref = %q, want the Atom id", d.Ref)
	}
	if !strings.Contains(d.Text, "Atom summary.") {
		t.Errorf("readable text missing: %q", d.Text)
	}
}

func TestUnrecognisedFeedRootIsAClearError(t *testing.T) {
	for _, tc := range []struct {
		name, body, wantSubstr string
	}{
		{"RDF / RSS 1.0", `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>`, "RSS 1.0"},
		{"unknown root", `<?xml version="1.0"?><bogus></bogus>`, "unrecognised"},
		{"not XML at all", `not xml at all`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, feedURL := newFeedServer(t, tc.body)
			_, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
			if err == nil {
				t.Fatal("expected an error")
			}
			if tc.wantSubstr != "" && !strings.Contains(err.Error(), tc.wantSubstr) {
				t.Errorf("error = %q, want it to mention %q", err.Error(), tc.wantSubstr)
			}
		})
	}
}

// An entry with neither a guid nor a link has nothing stable to key it under
// and must be reported, not silently dropped (Skip vs a hole in the brain).
func TestEntryWithNoRefIsSkippedNotDropped(t *testing.T) {
	body := rssFeedXML(
		rssItemXML("", "", "No ref at all", esc("<p>orphan</p>"), ""),
		rssItemXML("guid-ok", "https://example.test/ok", "Fine", esc("<p>ok</p>"), ""),
	)
	_, feedURL := newFeedServer(t, body)

	batch, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 1 {
		t.Fatalf("got %d docs, want 1 (the one with a ref)", len(batch.Docs))
	}
	if len(batch.Skipped) != 1 {
		t.Fatalf("got %d skips, want 1", len(batch.Skipped))
	}
	if !strings.Contains(batch.Skipped[0].Reason, "no guid") {
		t.Errorf("skip reason = %q, want it to explain why", batch.Skipped[0].Reason)
	}
}

// --- the small win: a second run adds only new entries --------------------

// This is issue #42's whole point. Round 1 retains what's there. Round 2
// against an unchanged feed writes nothing. Round 3, with one new entry
// added, retains only that entry — the two from round 1 are never re-added.
func TestSecondFetchAddsOnlyNewEntriesNeverReAddsOld(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Hour)

	body := rssFeedXML(
		rssItemXML("guid-old-1", "https://example.test/1", "Old 1", esc("<p>one</p>"), rfc1123z(t0)),
		rssItemXML("guid-old-2", "https://example.test/2", "Old 2", esc("<p>two</p>"), rfc1123z(t1)),
	)
	fs, feedURL := newFeedServer(t, body)
	src := newRSSSource(t, feedURL, nil)

	first, err := src.Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("first Fetch: %v", err)
	}
	if len(first.Docs) != 2 {
		t.Fatalf("first run got %d docs, want 2", len(first.Docs))
	}
	if first.Cursor == "" {
		t.Fatal("first run produced no cursor")
	}
	if first.Unchanged {
		t.Error("a first run with entries should not report Unchanged")
	}

	// Round 2: identical feed, same cursor. Nothing new — costs one request,
	// zero writes.
	hitsBefore := fs.hits
	second, err := src.Fetch(context.Background(), first.Cursor)
	if err != nil {
		t.Fatalf("second Fetch: %v", err)
	}
	if !second.Unchanged {
		t.Error("an unchanged feed should report Unchanged")
	}
	if len(second.Docs) != 0 {
		t.Errorf("second run retained %d docs, want 0", len(second.Docs))
	}
	if fs.hits-hitsBefore != 1 {
		t.Errorf("second run made %d feed requests, want exactly 1", fs.hits-hitsBefore)
	}

	// Round 3: a new entry lands, newer than anything seen so far.
	t2 := t1.Add(time.Hour)
	*fs.body = rssFeedXML(
		rssItemXML("guid-old-1", "https://example.test/1", "Old 1", esc("<p>one</p>"), rfc1123z(t0)),
		rssItemXML("guid-old-2", "https://example.test/2", "Old 2", esc("<p>two</p>"), rfc1123z(t1)),
		rssItemXML("guid-new-3", "https://example.test/3", "New 3", esc("<p>three</p>"), rfc1123z(t2)),
	)
	third, err := src.Fetch(context.Background(), second.Cursor)
	if err != nil {
		t.Fatalf("third Fetch: %v", err)
	}
	if len(third.Docs) != 1 {
		t.Fatalf("third run got %d docs, want exactly the 1 new entry: %+v", len(third.Docs), third.Docs)
	}
	if third.Docs[0].Ref != "guid-new-3" {
		t.Errorf("third run retained %q, want the new entry", third.Docs[0].Ref)
	}
}

// Same-timestamp entries are common (a batch import, a mirrored feed). The
// tie-break set must retain both on first sight, write nothing for them
// again on a re-run, but still catch a genuinely new entry that lands at the
// exact same published time.
func TestSameTimestampEntriesAreDedupedByRefNotJustDate(t *testing.T) {
	tShared := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	tOlder := tShared.Add(-time.Hour)

	body := rssFeedXML(
		rssItemXML("guid-a", "https://example.test/a", "A", esc("<p>a</p>"), rfc1123z(tShared)),
		rssItemXML("guid-b", "https://example.test/b", "B", esc("<p>b</p>"), rfc1123z(tShared)),
	)
	fs, feedURL := newFeedServer(t, body)
	src := newRSSSource(t, feedURL, nil)

	first, err := src.Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("first Fetch: %v", err)
	}
	if len(first.Docs) != 2 {
		t.Fatalf("first run got %d docs, want 2", len(first.Docs))
	}

	// A late-arriving third entry at the SAME timestamp, plus an older entry
	// that should stay excluded.
	*fs.body = rssFeedXML(
		rssItemXML("guid-a", "https://example.test/a", "A", esc("<p>a</p>"), rfc1123z(tShared)),
		rssItemXML("guid-b", "https://example.test/b", "B", esc("<p>b</p>"), rfc1123z(tShared)),
		rssItemXML("guid-c", "https://example.test/c", "C", esc("<p>c</p>"), rfc1123z(tShared)),
		rssItemXML("guid-old", "https://example.test/old", "Old", esc("<p>old</p>"), rfc1123z(tOlder)),
	)
	second, err := src.Fetch(context.Background(), first.Cursor)
	if err != nil {
		t.Fatalf("second Fetch: %v", err)
	}
	if len(second.Docs) != 1 {
		t.Fatalf("second run got %d docs, want exactly the same-second late arrival: %+v", len(second.Docs), second.Docs)
	}
	if second.Docs[0].Ref != "guid-c" {
		t.Errorf("retained %q, want guid-c", second.Docs[0].Ref)
	}
}

// A feed that has never carried a date at all falls back to plain ref
// dedupe, bounded to what the current read saw.
func TestUndatedFeedDedupesByRef(t *testing.T) {
	body := rssFeedXML(
		rssItemXML("guid-1", "https://example.test/1", "One", esc("<p>one</p>"), ""),
		rssItemXML("guid-2", "https://example.test/2", "Two", esc("<p>two</p>"), ""),
	)
	fs, feedURL := newFeedServer(t, body)
	src := newRSSSource(t, feedURL, nil)

	first, err := src.Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("first Fetch: %v", err)
	}
	if len(first.Docs) != 2 {
		t.Fatalf("first run got %d docs, want 2", len(first.Docs))
	}

	second, err := src.Fetch(context.Background(), first.Cursor)
	if err != nil {
		t.Fatalf("second Fetch: %v", err)
	}
	if !second.Unchanged || len(second.Docs) != 0 {
		t.Fatalf("an unchanged undated feed should report Unchanged and write nothing, got %d docs", len(second.Docs))
	}

	*fs.body = rssFeedXML(
		rssItemXML("guid-1", "https://example.test/1", "One", esc("<p>one</p>"), ""),
		rssItemXML("guid-2", "https://example.test/2", "Two", esc("<p>two</p>"), ""),
		rssItemXML("guid-3", "https://example.test/3", "Three", esc("<p>three</p>"), ""),
	)
	third, err := src.Fetch(context.Background(), second.Cursor)
	if err != nil {
		t.Fatalf("third Fetch: %v", err)
	}
	if len(third.Docs) != 1 || third.Docs[0].Ref != "guid-3" {
		t.Fatalf("third run = %+v, want exactly the new entry", third.Docs)
	}
}

// maxEntries bounds how much of the feed a run will even look at.
func TestMaxEntriesBoundsHowManyAreRead(t *testing.T) {
	var items []string
	for i := 1; i <= 5; i++ {
		items = append(items, rssItemXML(fmt.Sprintf("guid-%d", i), fmt.Sprintf("https://example.test/%d", i),
			fmt.Sprintf("Post %d", i), esc("<p>x</p>"), ""))
	}
	_, feedURL := newFeedServer(t, rssFeedXML(items...))

	batch, err := newRSSSource(t, feedURL, map[string]any{"maxEntries": 2}).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 2 {
		t.Fatalf("got %d docs, want the maxEntries cap of 2", len(batch.Docs))
	}
}

// --- fetchFull -------------------------------------------------------------

// fetchFull follows the entry link and uses the article body; a bad article
// page falls back to the feed's own summary rather than failing the batch.
func TestFetchFullUsesArticleBodyAndFallsBackOnFailure(t *testing.T) {
	body := rssFeedXML(
		rssItemXML("guid-good", "/articles/good", "Good article",
			esc("<p>short summary</p>"), rfc1123z(time.Now().Add(-time.Hour))),
		rssItemXML("guid-bad", "/articles/bad", "Bad article",
			esc("<p>fallback summary</p>"), rfc1123z(time.Now())),
	)
	fs, feedURL := newFeedServer(t, body)
	// The entry links above are relative; rewrite them to point at this same
	// server once its URL is known.
	srvBase := strings.TrimSuffix(feedURL, "/feed")
	*fs.body = rssFeedXML(
		rssItemXML("guid-good", srvBase+"/articles/good", "Good article",
			esc("<p>short summary</p>"), rfc1123z(time.Now().Add(-time.Hour))),
		rssItemXML("guid-bad", srvBase+"/articles/bad", "Bad article",
			esc("<p>fallback summary</p>"), rfc1123z(time.Now())),
	)
	fs.articles["/articles/good"] = `<html><head><title>x</title></head><body><article><p>The full article body, much longer than the summary.</p></article></body></html>`
	fs.articleCT["/articles/bad"] = http.StatusInternalServerError

	batch, err := newRSSSource(t, feedURL, map[string]any{"fetchFull": true}).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 2 {
		t.Fatalf("got %d docs, want 2", len(batch.Docs))
	}

	var good, bad Doc
	for _, d := range batch.Docs {
		switch d.Ref {
		case "guid-good":
			good = d
		case "guid-bad":
			bad = d
		}
	}
	if !strings.Contains(good.Text, "full article body") {
		t.Errorf("good entry did not use the article body: %q", good.Text)
	}
	if strings.Contains(good.Text, "short summary") {
		t.Errorf("good entry should not still be the feed summary: %q", good.Text)
	}
	if !strings.Contains(bad.Text, "fallback summary") {
		t.Errorf("bad entry should fall back to the feed summary, got: %q", bad.Text)
	}
}

// fetchFull defaults to off: the summary is used unmodified.
func TestFetchFullOffByDefaultUsesSummary(t *testing.T) {
	body := rssFeedXML(rssItemXML("guid-1", "/articles/x", "Post", esc("<p>the summary</p>"), ""))
	fs, feedURL := newFeedServer(t, body)
	fs.articles["/articles/x"] = `<html><body><p>should never be fetched</p></body></html>`

	batch, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 1 {
		t.Fatalf("got %d docs, want 1", len(batch.Docs))
	}
	if !strings.Contains(batch.Docs[0].Text, "the summary") {
		t.Errorf("expected the feed summary, got: %q", batch.Docs[0].Text)
	}
}

// --- bounds ------------------------------------------------------------

func TestFeedRedirectsAreBounded(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, srv.URL+"/feed", http.StatusFound) // redirects to itself, forever
	}))
	t.Cleanup(srv.Close)

	_, err := newRSSSource(t, srv.URL+"/feed", nil).Fetch(context.Background(), "")
	if err == nil {
		t.Fatal("an infinite redirect loop was not bounded")
	}
	if !strings.Contains(err.Error(), "redirect") {
		t.Errorf("error = %q, want it to mention redirects", err.Error())
	}
}

func TestOversizedFeedIsRejected(t *testing.T) {
	// A response bigger than the byte cap, wrapped so it is at least
	// well-formed enough to prove the limit is enforced on size, not on a
	// parse failure.
	huge := "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><!--" +
		strings.Repeat("x", rssMaxFeedBytes+1) + "--></channel></rss>"
	_, feedURL := newFeedServer(t, huge)

	_, err := newRSSSource(t, feedURL, nil).Fetch(context.Background(), "")
	if err == nil {
		t.Fatal("a feed over the byte cap was accepted")
	}
	if !strings.Contains(err.Error(), "larger than") {
		t.Errorf("error = %q, want it to explain the size cap", err.Error())
	}
}

// --- integration: through Refresh, like the reference connector's tests ----

func TestRefreshRetainsNewFeedEntriesThenGoesQuietOnAReRun(t *testing.T) {
	body := rssFeedXML(
		rssItemXML("guid-1", "https://example.test/1", "Announcing widget 2.0",
			esc("<p>Widget 2.0 ships faster invoices.</p>"), rfc1123z(time.Now())),
	)
	_, feedURL := newFeedServer(t, body)

	raw, _ := json.Marshal(map[string]any{"feedURL": feedURL})
	src, err := Open(KindRSS, raw, nil)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	cur := NewMemCursors()
	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("first Refresh: %v", err)
	}
	if rep.Retained != 1 {
		t.Fatalf("retained %d, want 1", rep.Retained)
	}
	doc, ok := brain.byRef(":guid-1")
	if !ok {
		t.Fatalf("the entry was not retained; got %+v", brain.retained)
	}
	if !strings.Contains(doc.content, "faster invoices") {
		t.Errorf("entry content did not survive: %q", doc.content)
	}

	rep2, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("second Refresh: %v", err)
	}
	if !rep2.Unchanged || rep2.Retained != 0 {
		t.Errorf("re-run against an unchanged feed retained %d, want 0", rep2.Retained)
	}
}

// --- unit-level coverage of the pieces the behaviour above depends on -----

func TestRSSHTMLToTextStripsTagsAndKeepsParagraphs(t *testing.T) {
	for _, tc := range []struct {
		name, in string
		want     []string
		notWant  []string
	}{
		{
			// Both the closing and the next opening <p> emit a newline, and
			// normalisation collapses the run to one blank line — a paragraph
			// break survives as a blank line, not as glued-together prose.
			name: "paragraphs become a blank-line break",
			in:   "<p>First.</p><p>Second.</p>",
			want: []string{"First.\n\nSecond."},
		},
		{
			name:    "script and style are removed whole",
			in:      "<p>Keep me.</p><script>evil()</script><style>body{color:red}</style>",
			want:    []string{"Keep me."},
			notWant: []string{"evil()", "color:red"},
		},
		{
			name: "entities are decoded",
			in:   "<p>Tom &amp; Jerry &lt;3</p>",
			want: []string{"Tom & Jerry <3"},
		},
		{
			name: "list items get their own line",
			in:   "<ul><li>one</li><li>two</li></ul>",
			want: []string{"one\n\ntwo"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := rssHTMLToText(tc.in)
			for _, w := range tc.want {
				if !strings.Contains(got, w) {
					t.Errorf("rssHTMLToText(%q) = %q, want it to contain %q", tc.in, got, w)
				}
			}
			for _, n := range tc.notWant {
				if strings.Contains(got, n) {
					t.Errorf("rssHTMLToText(%q) = %q, should not contain %q", tc.in, got, n)
				}
			}
		})
	}
}

func TestRSSParseDateHandlesRealWorldLayouts(t *testing.T) {
	for _, tc := range []struct{ name, in string }{
		{"RFC3339", "2026-01-01T12:00:00Z"},
		{"RFC1123Z", "Thu, 01 Jan 2026 12:00:00 +0000"},
		{"RFC822", "01 Jan 26 12:00 UTC"},
		{"date only", "2026-01-01"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, ok := rssParseDate(tc.in)
			if !ok {
				t.Errorf("rssParseDate(%q) did not parse", tc.in)
			}
		})
	}

	for _, bad := range []string{"", "not a date", "sometime last week"} {
		if _, ok := rssParseDate(bad); ok {
			t.Errorf("rssParseDate(%q) should not have parsed", bad)
		}
	}
}

func TestIsNewRSSEntryDecidesCorrectly(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Hour)

	for _, tc := range []struct {
		name     string
		e        rssEntry
		prevHas  bool
		prevDate time.Time
		prevSeen map[string]bool
		want     bool
	}{
		{
			name: "newer dated entry against a dated cursor is new",
			e:    rssEntry{Ref: "x", HasDate: true, Date: t1}, prevHas: true, prevDate: t0,
			want: true,
		},
		{
			name: "same-timestamp unseen ref is new",
			e:    rssEntry{Ref: "x", HasDate: true, Date: t0}, prevHas: true, prevDate: t0,
			prevSeen: map[string]bool{"y": true}, want: true,
		},
		{
			name: "same-timestamp already-seen ref is not new",
			e:    rssEntry{Ref: "x", HasDate: true, Date: t0}, prevHas: true, prevDate: t0,
			prevSeen: map[string]bool{"x": true}, want: false,
		},
		{
			name: "older dated entry against a dated cursor is not new",
			e:    rssEntry{Ref: "x", HasDate: true, Date: t0}, prevHas: true, prevDate: t1,
			want: false,
		},
		{
			name: "first ever date beats an undated cursor",
			e:    rssEntry{Ref: "x", HasDate: true, Date: t0}, prevHas: false,
			want: true,
		},
		{
			name: "undated entry against a dated cursor is never resurrected",
			e:    rssEntry{Ref: "x", HasDate: false}, prevHas: true, prevDate: t0,
			want: false,
		},
		{
			name: "undated entry against an undated cursor dedupes by ref: unseen",
			e:    rssEntry{Ref: "x", HasDate: false}, prevHas: false,
			prevSeen: map[string]bool{"y": true}, want: true,
		},
		{
			name: "undated entry against an undated cursor dedupes by ref: seen",
			e:    rssEntry{Ref: "x", HasDate: false}, prevHas: false,
			prevSeen: map[string]bool{"x": true}, want: false,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := isNewRSSEntry(tc.e, tc.prevHas, tc.prevDate, tc.prevSeen)
			if got != tc.want {
				t.Errorf("isNewRSSEntry() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRSSSniffRootIgnoresDeclaredEncoding(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
	}{
		{"rss", `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`, "rss"},
		{"atom", `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`, "feed"},
		{"leading whitespace and comment", "\n  <!-- hi --><rss><channel></channel></rss>", "rss"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := rssSniffRoot([]byte(tc.body))
			if err != nil {
				t.Fatalf("rssSniffRoot: %v", err)
			}
			if got != tc.want {
				t.Errorf("root = %q, want %q", got, tc.want)
			}
		})
	}
}
