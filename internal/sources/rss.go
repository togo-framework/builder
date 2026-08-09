package sources

// This file adds the "rss" source kind: a public RSS 2.0 or Atom 1.0 feed,
// polled on a schedule.
//
// Two things make this connector different from github.go's incremental
// story, and both come from what a feed actually promises:
//
//   - There is no commit SHA to short-circuit on. A feed has to be fetched in
//     full every run to find out whether anything changed, so "unchanged"
//     here means zero Retain/SetCursor writes, not zero HTTP requests.
//   - There is no stable page to diff against, either — a feed is a rolling
//     window that drops old items as new ones arrive, and item order is a
//     convention (newest first) rather than a guarantee. So the cursor is not
//     a position to resume from; it is a high-water mark (published date) plus
//     a tie-break set (refs seen at exactly that date), and every run
//     re-examines the whole window and keeps only what the mark says is new.
//     That is the whole answer to "add only new entries and never re-add the
//     old ones" — see isNewRSSEntry.
//
// All parsing is standard library: encoding/xml for the feed itself, and
// regexp plus the stdlib "html" package (for entity decoding) to turn entry
// HTML into readable text. That is not a real HTML parser — a run of real
// tag-stripping libraries is a dependency this package is not allowed to add
// — so it is deliberately conservative: strip what looks like a tag, keep
// paragraph breaks, and accept that something like a bare `List<T>` in a code
// sample will be mis-stripped. See rssHTMLToText.

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// KindRSS is the registered kind for an RSS/Atom feed source.
const KindRSS = "rss"

func init() { Register(KindRSS, newRSS) }

// Defaults and hard caps. Every one of these exists because the unbounded
// version is how one misbehaving feed or article page becomes this process's
// problem instead of a line in Batch.Skipped.
const (
	rssDefaultMaxEntries = 25
	rssHardMaxEntries    = 200

	// A feed is a list of summaries, not a book. 8MB is generous for even a
	// few hundred full-text <content:encoded> items and small enough that a
	// misconfigured URL returning a gigabyte never gets read.
	rssMaxFeedBytes = 8 << 20

	rssDefaultFeedTimeout = 30 * time.Second

	// fetchFull's article fetch gets its own, shorter budget: it is a
	// best-effort extra, and one slow article page should not stall the whole
	// refresh the way a slow feed fetch legitimately would.
	rssFullFetchTimeout  = 15 * time.Second
	rssMaxFullFetchBytes = 2 << 20

	// fullFetch only runs for entries the run has decided are NEW (see
	// Fetch), so this is normally never hit — but a first run against a feed
	// configured with maxEntries near its 200 cap should not turn into 200
	// sequential outbound page loads. Entries beyond the budget keep their
	// summary text rather than fail.
	rssMaxFullFetchesPerRun = 30

	rssMaxRedirects = 5

	// One entry is one memory row an agent pastes into its context on every
	// recall (see MaxRenderedBytes in sql.go for the same reasoning). A full
	// article can legitimately run long; this keeps the longest of them from
	// crowding out everything else a recall returns.
	rssMaxEntryTextBytes = 20000
)

// RSSConfig is one configured feed.
//
// There is no credential field. A feed source reads a public URL; a feed that
// needs authentication is out of scope for this connector rather than a
// reason to smuggle a token into feedURL (see normalise's userinfo check).
type RSSConfig struct {
	FeedURL string `json:"feedURL"`

	MaxEntries int `json:"maxEntries,omitempty"`

	// FetchFull follows each new entry's link and retains the article body in
	// place of the feed's own summary. Off by default because it multiplies
	// outbound requests by the number of new entries every run.
	FetchFull bool `json:"fetchFull,omitempty"`
}

func (c *RSSConfig) normalise() error {
	c.FeedURL = strings.TrimSpace(c.FeedURL)
	if c.FeedURL == "" {
		return errors.New(`rss source config: "feedURL" is required`)
	}
	u, err := url.Parse(c.FeedURL)
	if err != nil {
		return fmt.Errorf("rss source config: %q is not a valid URL: %w", c.FeedURL, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("rss source config: %q must be an http or https URL", c.FeedURL)
	}
	if u.Host == "" {
		return fmt.Errorf("rss source config: %q has no host", c.FeedURL)
	}
	if u.User != nil {
		// The same shape of mistake credentialFields guards against in
		// github.go: a credential belongs in the vault, never baked into a
		// config field that ends up in builder_sources.config and every
		// backup of it. This connector has no vault field to redirect the
		// operator to, because it has no story for authenticated feeds at all.
		return errors.New(`rss source config: "feedURL" must not carry userinfo — authenticated feeds are not supported`)
	}

	switch {
	case c.MaxEntries <= 0:
		c.MaxEntries = rssDefaultMaxEntries
	case c.MaxEntries > rssHardMaxEntries:
		c.MaxEntries = rssHardMaxEntries
	}
	return nil
}

type rssSource struct {
	cfg  RSSConfig
	feed *http.Client // fetches the feed document
	full *http.Client // fetches an entry's article page, only when FetchFull is set
	name string
}

// newRSS is the Factory. sec is unused: a public feed needs no vault lookup,
// and this connector has nowhere to put a credential even if one were
// configured (see RSSConfig's doc comment).
func newRSS(raw json.RawMessage, _ Secrets) (Source, error) {
	var cfg RSSConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("rss source config: %w", err)
	}
	if err := cfg.normalise(); err != nil {
		return nil, err
	}
	return &rssSource{
		cfg:  cfg,
		feed: rssBoundedClient(rssDefaultFeedTimeout),
		full: rssBoundedClient(rssFullFetchTimeout),
		name: cfg.FeedURL,
	}, nil
}

// rssBoundedClient caps wall-clock time AND redirect count. net/http's
// default client follows redirects with no cap of its own visible in this
// package's code, and a feed URL is exactly the kind of input an operator
// pastes without checking where it eventually points.
func rssBoundedClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) >= rssMaxRedirects {
				return fmt.Errorf("stopped after %d redirects", rssMaxRedirects)
			}
			return nil
		},
	}
}

func (r *rssSource) Kind() string { return KindRSS }
func (r *rssSource) Name() string { return r.name }

// rssCursor is where this source got to.
//
// Published is the newest entry timestamp already retained, held as RFC3339
// UTC so every value this connector itself writes compares correctly both as
// a string and, after parsing, as a time.Time. Seen is the set of refs AT
// exactly that timestamp: feeds legitimately publish more than one entry in
// the same second (a batch import, a mirrored feed), and without the
// tie-break either a same-second late arrival is skipped forever or, worse,
// something already retained gets re-added every run.
type rssCursor struct {
	Published string   `json:"published,omitempty"`
	Seen      []string `json:"seen,omitempty"`
}

func parseRSSCursor(s string) rssCursor {
	var c rssCursor
	s = strings.TrimSpace(s)
	if s != "" {
		_ = json.Unmarshal([]byte(s), &c)
	}
	return c
}

func (c rssCursor) String() string {
	b, err := json.Marshal(c)
	if err != nil {
		return ""
	}
	return string(b)
}

func (c rssCursor) seenSet() map[string]bool {
	m := make(map[string]bool, len(c.Seen))
	for _, ref := range c.Seen {
		m[ref] = true
	}
	return m
}

// rssEntry is one feed item, RSS and Atom normalised to the same shape.
type rssEntry struct {
	Ref     string // guid (RSS) or id (Atom), falling back to the entry link
	Title   string
	Link    string
	Summary string // already stripped to plain text
	HasDate bool
	Date    time.Time // zero unless HasDate
}

// Fetch reads the feed in full — see the file comment for why there is no
// cheaper path — and retains only the entries the cursor says are new.
func (r *rssSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	prev := parseRSSCursor(cursor)
	var prevDate time.Time
	var prevHasDate bool
	if prev.Published != "" {
		if t, err := time.Parse(time.RFC3339, prev.Published); err == nil {
			prevDate, prevHasDate = t, true
		}
	}
	prevSeen := prev.seenSet()

	data, err := r.fetchFeed(ctx)
	if err != nil {
		return Batch{}, err
	}
	all, err := rssParseFeed(data)
	if err != nil {
		return Batch{}, fmt.Errorf("%s: %s", r.name, Scrub(err.Error()))
	}

	// Trusted as given rather than re-sorted: "newest first" is a near
	// universal feed convention, but nothing here guarantees every entry has
	// a comparable date, so there is no reliable key to re-sort by anyway.
	if len(all) > r.cfg.MaxEntries {
		all = all[:r.cfg.MaxEntries]
	}

	batch := Batch{}

	usable := make([]rssEntry, 0, len(all))
	for _, e := range all {
		if e.Ref == "" {
			title := e.Title
			if title == "" {
				title = "(untitled entry)"
			}
			batch.Skipped = append(batch.Skipped, Skip{
				Ref:    title,
				Reason: "entry has no guid/id and no link; nothing stable to key it under",
			})
			continue
		}
		usable = append(usable, e)
	}

	// The new high-water mark is the newest date across EVERY entry read this
	// run, new or not — the cursor has to reflect the feed's actual state, not
	// just whatever subset turned out to be new today.
	var newest time.Time
	var newestHas bool
	for _, e := range usable {
		if e.HasDate && (!newestHas || e.Date.After(newest)) {
			newest, newestHas = e.Date, true
		}
	}

	fullBudget := rssMaxFullFetchesPerRun
	for _, e := range usable {
		if !isNewRSSEntry(e, prevHasDate, prevDate, prevSeen) {
			continue
		}

		text := e.Summary
		if r.cfg.FetchFull && e.Link != "" && fullBudget > 0 {
			fullBudget--
			if full, ferr := r.fetchFullText(ctx, e.Link); ferr == nil && strings.TrimSpace(full) != "" {
				text = full
			}
			// Any failure — bad status, timeout, an extraction that came back
			// empty — falls back to the summary already in `text`. Issue #42
			// asks for exactly this: one bad article page skips itself, not
			// the batch.
		}
		if len(text) > rssMaxEntryTextBytes {
			text = text[:rssMaxEntryTextBytes] + "\n…"
		}

		imp := 0.5
		if !e.HasDate {
			// Nothing to rank it against in time, so it should not compete
			// with dated entries for recall priority.
			imp = 0.4
		}
		batch.Docs = append(batch.Docs, Doc{
			Ref:        e.Ref,
			Title:      rssDocTitle(r.name, e.Title),
			Text:       text,
			Importance: imp,
		})
	}

	next := rssCursor{Published: prev.Published}
	switch {
	case newestHas:
		next.Published = newest.UTC().Format(time.RFC3339)
		for _, e := range usable {
			if e.HasDate && e.Date.Equal(newest) {
				next.Seen = append(next.Seen, e.Ref)
			}
		}
	case prevHasDate:
		// Nothing dated in today's read — keep the previous mark's seen set
		// so a later run comparing against the same Published value still
		// recognises what this run already retained.
		next.Seen = prev.Seen
	default:
		// The feed has never carried a date at all. Fall back to plain ref
		// dedupe, bounded to what THIS run saw: an entry that ages out of the
		// feed ages out of Seen too, so this can never grow past maxEntries.
		for _, e := range usable {
			next.Seen = append(next.Seen, e.Ref)
		}
	}

	batch.Unchanged = len(batch.Docs) == 0
	// Set unconditionally, same as github.go: Refresh (registry.go) compares
	// this against the cursor it was given and only persists when it moved.
	batch.Cursor = next.String()
	return batch, nil
}

// isNewRSSEntry decides whether e is new relative to the previous cursor.
//
// An undated entry is new exactly once: the run where the cursor itself has
// no date yet (a first run, or a feed that has never published a dated
// entry). Once the cursor holds a real timestamp, an undated entry is treated
// as older than it — there is no ordering information to say otherwise — so
// it is never resurrected by a later run just because the watermark moved.
func isNewRSSEntry(e rssEntry, prevHasDate bool, prevDate time.Time, prevSeen map[string]bool) bool {
	switch {
	case e.HasDate && prevHasDate:
		if e.Date.After(prevDate) {
			return true
		}
		return e.Date.Equal(prevDate) && !prevSeen[e.Ref]
	case e.HasDate && !prevHasDate:
		return true
	case !e.HasDate && !prevHasDate:
		return !prevSeen[e.Ref]
	default: // !e.HasDate && prevHasDate
		return false
	}
}

func rssDocTitle(feedName, entryTitle string) string {
	if entryTitle == "" {
		return feedName
	}
	return feedName + " — " + entryTitle
}

// fetchFeed downloads the feed document. The content type is never trusted
// for format — see rssSniffRoot, which is what issue #42 actually asks for —
// so it is not even inspected here; a server can call anything text/xml and
// this connector still has to figure out for itself what it got.
func (r *rssSource) fetchFeed(ctx context.Context) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.cfg.FeedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request for %s: %w", r.name, err)
	}
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")
	req.Header.Set("User-Agent", "togo-builder-sources")

	res, err := r.feed.Do(req)
	if err != nil {
		// A transport error can quote the request URL.
		return nil, fmt.Errorf("GET %s: %s", r.name, Scrub(err.Error()))
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: unexpected status %d", r.name, res.StatusCode)
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(io.LimitReader(res.Body, rssMaxFeedBytes+1)); err != nil {
		return nil, fmt.Errorf("read %s: %s", r.name, Scrub(err.Error()))
	}
	if buf.Len() > rssMaxFeedBytes {
		return nil, fmt.Errorf("%s: feed response is larger than %d bytes", r.name, rssMaxFeedBytes)
	}
	return buf.Bytes(), nil
}

// fetchFullText follows an entry's link and returns its readable text.
//
// This is not a readability algorithm — just the same tag-stripping used on
// feed content, applied after cutting out <head> and the elements that are
// reliably chrome rather than the article (nav, header, footer, ...). Bounded
// size and its own short timeout mean one slow or oversized page cannot turn
// into the whole refresh's problem; any error here is meant to be swallowed by
// the caller, which falls back to the feed's own summary.
func (r *rssSource) fetchFullText(ctx context.Context, link string) (string, error) {
	u, err := url.Parse(link)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("entry link %q is not a fetchable http(s) URL", link)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "text/html, application/xhtml+xml")
	req.Header.Set("User-Agent", "togo-builder-sources")

	res, err := r.full.Do(req)
	if err != nil {
		return "", fmt.Errorf("GET: %s", Scrub(err.Error()))
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET: unexpected status %d", res.StatusCode)
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(io.LimitReader(res.Body, rssMaxFullFetchBytes+1)); err != nil {
		return "", fmt.Errorf("read: %s", Scrub(err.Error()))
	}
	if buf.Len() > rssMaxFullFetchBytes {
		return "", fmt.Errorf("article response is larger than %d bytes", rssMaxFullFetchBytes)
	}

	return rssHTMLToText(rssExtractBody(buf.String())), nil
}

// --- feed parsing --------------------------------------------------------

// rssParseFeed dispatches on the document's root element rather than a
// declared or guessed content type — issue #42's explicit requirement, and
// the only thing that is actually reliable: plenty of RSS is served as
// text/html and plenty of Atom is served as application/rss+xml by a
// misconfigured server.
func rssParseFeed(data []byte) ([]rssEntry, error) {
	root, err := rssSniffRoot(data)
	if err != nil {
		return nil, err
	}
	switch root {
	case "rss":
		return rssParseRSS(data)
	case "feed":
		return rssParseAtom(data)
	case "RDF":
		return nil, errors.New("RDF (RSS 1.0) feeds are not supported; only RSS 2.0 and Atom 1.0 are")
	default:
		return nil, fmt.Errorf("unrecognised feed root element %q; only RSS 2.0 (<rss>) and Atom 1.0 (<feed>) are supported", root)
	}
}

func rssSniffRoot(data []byte) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		tok, err := dec.Token()
		if err != nil {
			return "", fmt.Errorf("no XML root element found: %w", err)
		}
		if se, ok := tok.(xml.StartElement); ok {
			return se.Name.Local, nil
		}
	}
}

type rssXMLDoc struct {
	Channel struct {
		Items []rssXMLItem `xml:"item"`
	} `xml:"channel"`
}

type rssXMLItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	// content:encoded is RSS's de facto full-body extension; description is
	// often just a teaser of it, so it is preferred below when both exist.
	ContentEncoded string `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
	PubDate        string `xml:"pubDate"`
}

func rssParseRSS(data []byte) ([]rssEntry, error) {
	var doc rssXMLDoc
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse RSS: %w", err)
	}
	entries := make([]rssEntry, 0, len(doc.Channel.Items))
	for _, it := range doc.Channel.Items {
		ref := strings.TrimSpace(it.GUID)
		link := strings.TrimSpace(it.Link)
		if ref == "" {
			ref = link // issue #42: link is the fallback ref when there is no guid
		}
		summary := rssHTMLToText(it.Description)
		if strings.TrimSpace(it.ContentEncoded) != "" {
			summary = rssHTMLToText(it.ContentEncoded)
		}
		date, hasDate := rssParseDate(it.PubDate)
		entries = append(entries, rssEntry{
			Ref: ref, Title: strings.TrimSpace(it.Title), Link: link,
			Summary: summary, HasDate: hasDate, Date: date,
		})
	}
	return entries, nil
}

type rssAtomXMLDoc struct {
	Entries []rssAtomXMLEntry `xml:"entry"`
}

type rssAtomXMLEntry struct {
	Title     string           `xml:"title"`
	ID        string           `xml:"id"`
	Links     []rssAtomXMLLink `xml:"link"`
	Summary   string           `xml:"summary"`
	Content   string           `xml:"content"`
	Published string           `xml:"published"`
	Updated   string           `xml:"updated"`
}

type rssAtomXMLLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

func rssParseAtom(data []byte) ([]rssEntry, error) {
	var doc rssAtomXMLDoc
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse Atom: %w", err)
	}
	entries := make([]rssEntry, 0, len(doc.Entries))
	for _, e := range doc.Entries {
		link := rssAtomLink(e.Links)
		ref := strings.TrimSpace(e.ID)
		if ref == "" {
			ref = link
		}
		summary := rssHTMLToText(e.Summary)
		if strings.TrimSpace(e.Content) != "" {
			// Best-effort: xhtml-type Atom content nests real XML elements
			// inside <content>, and encoding/xml drops the character data of
			// any child element a plain string field has no match for. When
			// that leaves Content effectively empty, `summary` above (usually
			// plain text or escaped html, both of which survive) is already
			// what gets used, because the assignment only happens when
			// Content is non-empty after the fact — see the html-to-text call
			// still running on it either way.
			summary = rssHTMLToText(e.Content)
		}
		raw := e.Published
		if raw == "" {
			raw = e.Updated // Atom requires <updated>; <published> is optional
		}
		date, hasDate := rssParseDate(raw)
		entries = append(entries, rssEntry{
			Ref: ref, Title: strings.TrimSpace(e.Title), Link: link,
			Summary: summary, HasDate: hasDate, Date: date,
		})
	}
	return entries, nil
}

// rssAtomLink picks the entry's primary link. rel="alternate" (or an
// unlabelled link, which defaults to alternate per RFC 4287) is the page a
// reader — or a fetchFull request — actually wants, over rel="self" or
// rel="enclosure".
func rssAtomLink(links []rssAtomXMLLink) string {
	for _, l := range links {
		if l.Rel == "" || l.Rel == "alternate" {
			return strings.TrimSpace(l.Href)
		}
	}
	if len(links) > 0 {
		return strings.TrimSpace(links[0].Href)
	}
	return ""
}

// rssDateLayouts covers what real feeds actually send, not just what the
// specs say they should. RSS 2.0 specifies RFC822 for pubDate but almost
// nothing follows it exactly (four-digit years, missing seconds, a numeric
// offset instead of a zone name); Atom specifies RFC3339 and mostly does
// follow it. Trying an ordered list costs nothing on the common case and
// degrades to "no date" — not an error — on an uncommon one.
var rssDateLayouts = []string{
	time.RFC3339,
	time.RFC3339Nano,
	time.RFC1123Z,
	time.RFC1123,
	time.RFC822Z,
	time.RFC822,
	"Mon, 2 Jan 2006 15:04:05 -0700",
	"Mon, 2 Jan 2006 15:04:05 MST",
	"2 Jan 2006 15:04:05 -0700",
	"2 Jan 2006 15:04:05 MST",
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05",
	"2006-01-02",
}

func rssParseDate(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range rssDateLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// --- HTML to text ----------------------------------------------------------

// rssBlockTags are elements whose boundary becomes a newline instead of
// vanishing — otherwise "strip HTML down to readable text" glues every
// paragraph, list item and table row from an entry into one unreadable line.
var rssBlockTags = map[string]bool{
	"p": true, "div": true, "br": true, "li": true, "tr": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"blockquote": true, "section": true, "article": true, "table": true, "hr": true,
}

var (
	// Removed whole, tag and contents: never article prose.
	rssNonContentTagRe = regexp.MustCompile(`(?is)<(script|style|nav|header|footer|aside|form|noscript|iframe)[^>]*>.*?</(script|style|nav|header|footer|aside|form|noscript|iframe)>`)

	// Matches any element start or end tag. This is regexp doing an HTML
	// parser's job, which is exactly backwards for well-formed markup — but
	// real-world feed and article HTML is routinely NOT well-formed (bare
	// <br>, unescaped &), and encoding/xml (correct, but strict) fails hard on
	// exactly that input. The trade a regexp makes instead: a bare
	// generic-looking construct in a code sample, e.g. `List<Foo>`, can be
	// mis-stripped as a tag named Foo. Accepted for a stdlib-only best effort.
	rssAnyTagRe = regexp.MustCompile(`(?is)<(/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>`)

	rssHeadRe = regexp.MustCompile(`(?is)<head[^>]*>.*?</head>`)
	rssBodyRe = regexp.MustCompile(`(?is)<body[^>]*>(.*)</body>`)
)

// rssExtractBody narrows a full HTML page down to what fetchFull actually
// wants: drop <head> (metadata, not content) and take what's inside <body> if
// there is one. Not narrowed further than that — this package has no
// readability model, only a tag stripper — so the result is still "the whole
// page's visible text", not "the article".
func rssExtractBody(doc string) string {
	doc = rssHeadRe.ReplaceAllString(doc, "")
	if m := rssBodyRe.FindStringSubmatch(doc); len(m) == 2 {
		return m[1]
	}
	return doc
}

// rssHTMLToText strips markup down to plain, readable text and keeps
// paragraph breaks (rssBlockTags). Entries carry HTML in every field that can
// hold a body — RSS description/content:encoded, Atom summary/content — and a
// memory row still full of tags both reads worse for an agent and spends
// tokens saying nothing.
func rssHTMLToText(s string) string {
	if strings.TrimSpace(s) == "" {
		return ""
	}
	s = rssNonContentTagRe.ReplaceAllString(s, "")

	var b strings.Builder
	last := 0
	for _, m := range rssAnyTagRe.FindAllStringSubmatchIndex(s, -1) {
		b.WriteString(s[last:m[0]])
		name := strings.ToLower(s[m[4]:m[5]])
		if rssBlockTags[name] {
			b.WriteString("\n")
		}
		last = m[1]
	}
	b.WriteString(s[last:])

	return rssNormalizeWhitespace(html.UnescapeString(b.String()))
}

// rssNormalizeWhitespace collapses runs of horizontal whitespace within a
// line and runs of blank lines down to a single blank line — a paragraph
// break survives as exactly one, rather than as whatever run of newlines the
// source markup happened to have.
func rssNormalizeWhitespace(s string) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := true
	for _, ln := range lines {
		ln = strings.Join(strings.Fields(ln), " ")
		if ln == "" {
			if !blank {
				out = append(out, "")
			}
			blank = true
			continue
		}
		out = append(out, ln)
		blank = false
	}
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	for len(out) > 0 && out[0] == "" {
		out = out[1:]
	}
	return strings.Join(out, "\n")
}
