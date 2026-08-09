package sources

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// KindCrawl is the registered kind for a web crawl source.
const KindCrawl = "crawl"

func init() { Register(KindCrawl, newCrawl) }

// Crawling somebody else's website.
//
// This is the only connector that reads a system nobody gave us an API key
// for, which makes it the one with a duty of care rather than a rate limit.
// Two things follow from that and are not negotiable in the config:
//
//   - robots.txt is obeyed. A crawler that ignores it is a liability the first
//     time it meets a site that meant it.
//   - Requests to one host are spaced. Politeness is what separates collecting
//     a documentation site from mounting a small denial of service against it.
//
// Everything is bounded — depth, pages, bytes, redirects, and total wall clock
// — because the failure mode of an unbounded crawler is not a slow run, it is
// an unbounded one against a stranger's infrastructure.

const (
	defaultCrawlDepth    = 2
	maxCrawlDepth        = 4
	defaultCrawlPages    = 25
	maxCrawlPages        = 200
	defaultCrawlDelay    = 500 * time.Millisecond
	maxCrawlDelay        = 30 * time.Second
	maxCrawlPageBytes    = 2 << 20 // 2 MB of HTML is already a generated page
	maxCrawlRedirects    = 5
	crawlRequestTimeout  = 20 * time.Second
	crawlWallClockBudget = 5 * time.Minute
)

// defaultCrawlAgent identifies us honestly.
//
// A crawler that disguises itself as a browser cannot be blocked by a site that
// wants to block it, which means it has taken the choice away from the person
// whose server it is running on.
const defaultCrawlAgent = "togo-builder-crawler/1.0 (+sources)"

type crawlConfig struct {
	StartURL       string `json:"startURL"`
	MaxDepth       int    `json:"maxDepth"`
	MaxPages       int    `json:"maxPages"`
	SameOriginOnly *bool  `json:"sameOriginOnly"`
	UserAgent      string `json:"userAgent"`
}

type crawlSource struct {
	cfg   crawlConfig
	start *url.URL
	name  string
	c     *http.Client
	// robots is fetched once per run and cached for the run's lifetime.
	robots *robotsRules
	delay  time.Duration
}

func newCrawl(raw json.RawMessage, _ Secrets) (Source, error) {
	var c crawlConfig
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &c); err != nil {
			return nil, fmt.Errorf("crawl source config: %w", err)
		}
	}
	c.StartURL = strings.TrimSpace(c.StartURL)
	if c.StartURL == "" {
		return nil, fmt.Errorf("crawl source config: startURL is required")
	}
	u, err := url.Parse(c.StartURL)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("crawl source config: %q is not a URL", c.StartURL)
	}
	// http(s) only. A file:// or gopher:// start URL would make this a local
	// file reader wearing a crawler's name.
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("crawl source config: %q must be http or https", c.StartURL)
	}

	c.MaxDepth = clampInt(c.MaxDepth, defaultCrawlDepth, 0, maxCrawlDepth)
	c.MaxPages = clampInt(c.MaxPages, defaultCrawlPages, 1, maxCrawlPages)
	if strings.TrimSpace(c.UserAgent) == "" {
		c.UserAgent = defaultCrawlAgent
	}

	return &crawlSource{
		cfg:   c,
		start: u,
		name:  u.Host + u.Path,
		delay: defaultCrawlDelay,
		c: &http.Client{
			Timeout: crawlRequestTimeout,
			CheckRedirect: func(r *http.Request, via []*http.Request) error {
				if len(via) >= maxCrawlRedirects {
					return fmt.Errorf("stopped after %d redirects", maxCrawlRedirects)
				}
				return nil
			},
		},
	}, nil
}

func clampInt(v, def, lo, hi int) int {
	if v == 0 {
		v = def
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (c *crawlSource) Kind() string { return KindCrawl }
func (c *crawlSource) Name() string { return c.name }

func (c *crawlSource) sameOrigin() bool {
	return c.cfg.SameOriginOnly == nil || *c.cfg.SameOriginOnly
}

// Fetch walks the site breadth-first and returns the readable text of each page.
func (c *crawlSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	ctx, cancel := context.WithTimeout(ctx, crawlWallClockBudget)
	defer cancel()

	rules, err := c.fetchRobots(ctx)
	if err != nil {
		return Batch{}, err
	}
	c.robots = rules
	if rules.crawlDelay > 0 {
		c.delay = minDuration(rules.crawlDelay, maxCrawlDelay)
	}

	type queued struct {
		u     *url.URL
		depth int
	}
	seen := map[string]bool{c.start.String(): true}
	queue := []queued{{c.start, 0}}

	var batch Batch
	// fingerprints pairs each URL with a hash of its text. The cursor is a hash
	// over the sorted set, so an unchanged site produces the same cursor and
	// writes nothing — which is the difference between a daily crawl that costs
	// one pass and one that rewrites every memory it has.
	var fingerprints []string
	first := true

	for len(queue) > 0 && len(batch.Docs) < c.cfg.MaxPages {
		if ctx.Err() != nil {
			// Out of time, not out of pages. What was collected is real and is
			// returned; the cursor is withheld below so the next run redoes it
			// rather than skipping the tail.
			batch.Skipped = append(batch.Skipped, Skip{
				Ref:    "(remaining)",
				Reason: "the crawl ran out of time before finishing",
			})
			break
		}
		item := queue[0]
		queue = queue[1:]

		if !c.robots.allowed(item.u.Path) {
			batch.Skipped = append(batch.Skipped, Skip{
				Ref: item.u.Path, Reason: "disallowed by robots.txt",
			})
			continue
		}

		// Spaced, except before the very first request — a courtesy delay
		// before doing anything is just latency.
		if !first {
			if err := sleepCtx(ctx, c.delay); err != nil {
				break
			}
		}
		first = false

		body, ctype, err := c.get(ctx, item.u.String())
		if err != nil {
			batch.Skipped = append(batch.Skipped, Skip{
				Ref: item.u.Path, Reason: Scrub(err.Error()),
			})
			continue
		}
		if !strings.Contains(strings.ToLower(ctype), "html") {
			batch.Skipped = append(batch.Skipped, Skip{
				Ref: item.u.Path, Reason: "not HTML (" + ctype + ")",
			})
			continue
		}

		title, text := extractReadable(string(body))
		if strings.TrimSpace(text) != "" {
			ref := item.u.Path
			if ref == "" {
				ref = "/"
			}
			if item.u.RawQuery != "" {
				ref += "?" + item.u.RawQuery
			}
			batch.Docs = append(batch.Docs, Doc{
				Ref:   ref,
				Title: title,
				Text:  text,
			})
			sum := sha256.Sum256([]byte(text))
			fingerprints = append(fingerprints, ref+":"+hex.EncodeToString(sum[:8]))
		}

		if item.depth >= c.cfg.MaxDepth {
			continue
		}
		for _, href := range extractLinks(string(body)) {
			next, err := item.u.Parse(href)
			if err != nil {
				continue
			}
			next.Fragment = "" // #section is the same page
			if next.Scheme != "http" && next.Scheme != "https" {
				continue
			}
			if c.sameOrigin() && next.Host != c.start.Host {
				continue
			}
			key := next.String()
			if seen[key] {
				continue
			}
			seen[key] = true
			queue = append(queue, queued{next, item.depth + 1})
		}
	}

	if len(queue) > 0 && len(batch.Docs) >= c.cfg.MaxPages {
		batch.Skipped = append(batch.Skipped, Skip{
			Ref:    "(remaining)",
			Reason: fmt.Sprintf("stopped at the %d page limit with %d links still queued", c.cfg.MaxPages, len(queue)),
		})
	}

	// The cursor is set only on a COMPLETE pass. A crawl cut short by the time
	// budget that recorded its fingerprint would look unchanged next run, and
	// the pages it never reached would never be collected at all.
	if ctx.Err() == nil {
		sort.Strings(fingerprints)
		sum := sha256.Sum256([]byte(strings.Join(fingerprints, "\n")))
		batch.Cursor = hex.EncodeToString(sum[:])
		batch.Unchanged = batch.Cursor == cursor
		if batch.Unchanged {
			// Nothing changed: hand back no documents so the caller writes
			// nothing. The pages were fetched, which is the unavoidable cost of
			// knowing; rewriting every memory to identical content is not.
			batch.Docs = nil
		}
	}
	return batch, nil
}

func (c *crawlSource) get(ctx context.Context, u string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", c.cfg.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	res, err := c.c.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("HTTP %s", res.Status)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, maxCrawlPageBytes))
	if err != nil {
		return nil, "", err
	}
	return b, res.Header.Get("Content-Type"), nil
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

// ── robots.txt ──────────────────────────────────────────────────────────────

type robotsRules struct {
	allow      []string
	disallow   []string
	crawlDelay time.Duration
}

// fetchRobots reads and parses the host's robots.txt.
//
// A 404 means no rules, which is permission. A 5xx or a network failure is NOT
// permission — it is an unanswered question, and the polite reading of an
// unanswered question is no. Sites under load return 503 for robots.txt, and
// treating that as "crawl freely" is precisely the wrong response to a server
// that is struggling.
func (c *crawlSource) fetchRobots(ctx context.Context) (*robotsRules, error) {
	ru := &url.URL{Scheme: c.start.Scheme, Host: c.start.Host, Path: "/robots.txt"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ru.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.cfg.UserAgent)

	res, err := c.c.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not read %s, so this crawl will not run: %s",
			ru.Host+"/robots.txt", Scrub(err.Error()))
	}
	defer res.Body.Close()

	switch {
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return &robotsRules{}, nil
	case res.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("%s answered %s for robots.txt, so this crawl will not run",
			ru.Host, res.Status)
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, 512<<10))
	if err != nil {
		return nil, fmt.Errorf("could not read robots.txt: %w", err)
	}
	return parseRobots(string(body), c.cfg.UserAgent), nil
}

// parseRobots reads the groups that apply to us.
//
// A specific User-agent match wins over "*" entirely, per the standard: a site
// that names a crawler is talking to that crawler, and merging its rules with
// the wildcard would obey neither.
func parseRobots(body, agent string) *robotsRules {
	agentToken := strings.ToLower(strings.SplitN(agent, "/", 2)[0])

	var star, mine robotsRules
	var starHit, mineHit bool
	// applying tracks which group the current run of directives belongs to.
	var toStar, toMine bool

	for _, raw := range strings.Split(body, "\n") {
		line := raw
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = line[:i]
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)

		switch key {
		case "user-agent":
			ua := strings.ToLower(value)
			// Consecutive User-agent lines share one group, so a new one only
			// resets the target when directives have been seen since.
			toStar = ua == "*"
			toMine = ua != "*" && strings.Contains(agentToken, ua)
			if toStar {
				starHit = true
			}
			if toMine {
				mineHit = true
			}
		case "disallow":
			if toStar {
				star.disallow = append(star.disallow, value)
			}
			if toMine {
				mine.disallow = append(mine.disallow, value)
			}
		case "allow":
			if toStar {
				star.allow = append(star.allow, value)
			}
			if toMine {
				mine.allow = append(mine.allow, value)
			}
		case "crawl-delay":
			if secs, err := strconv.ParseFloat(value, 64); err == nil && secs > 0 {
				d := time.Duration(secs * float64(time.Second))
				if toStar {
					star.crawlDelay = d
				}
				if toMine {
					mine.crawlDelay = d
				}
			}
		}
	}

	if mineHit {
		return &mine
	}
	if starHit {
		return &star
	}
	return &robotsRules{}
}

// allowed applies longest-match-wins, with Allow beating Disallow at equal
// length — the rule every major crawler follows, and the one a site author
// writing "Disallow: /docs" then "Allow: /docs/public" is relying on.
func (r *robotsRules) allowed(path string) bool {
	if path == "" {
		path = "/"
	}
	best, allow := -1, true
	for _, p := range r.disallow {
		// "Disallow:" with an empty value means "nothing is disallowed".
		if p == "" {
			continue
		}
		if strings.HasPrefix(path, p) && len(p) > best {
			best, allow = len(p), false
		}
	}
	for _, p := range r.allow {
		if p == "" {
			continue
		}
		if strings.HasPrefix(path, p) && len(p) >= best {
			best, allow = len(p), true
		}
	}
	return allow
}

// ── HTML to text ────────────────────────────────────────────────────────────

// chromeTags are the elements whose text is navigation rather than content.
// Collecting them means every page in a site shares its menu, and recall then
// scores all of them equally against any query.
var chromeTags = map[string]bool{
	"script": true, "style": true, "nav": true, "header": true,
	"footer": true, "aside": true, "noscript": true, "svg": true,
	"form": true, "button": true, "iframe": true, "template": true,
}

// blockTags force a line break, so headings and paragraphs survive as
// structure rather than running together into one wall of words.
var blockTags = map[string]bool{
	"p": true, "div": true, "section": true, "article": true, "li": true,
	"tr": true, "br": true, "h1": true, "h2": true, "h3": true, "h4": true,
	"h5": true, "h6": true, "blockquote": true, "pre": true, "hr": true,
}

// extractReadable pulls the title and the body text out of an HTML document.
//
// Hand-rolled rather than a dependency: this package must stay stdlib-only so
// the plugin can scaffold a standalone app, and the job is a tag scanner rather
// than a parser — nothing here needs a DOM.
func extractReadable(html string) (title, text string) {
	var out strings.Builder
	var skipDepth int
	var skipTag string
	inTitle := false

	i := 0
	for i < len(html) {
		lt := strings.IndexByte(html[i:], '<')
		if lt < 0 {
			if skipDepth == 0 {
				out.WriteString(html[i:])
			}
			break
		}
		// The text before this tag.
		if skipDepth == 0 {
			seg := html[i : i+lt]
			if inTitle {
				title += seg
			} else {
				out.WriteString(seg)
			}
		}
		i += lt

		gt := strings.IndexByte(html[i:], '>')
		if gt < 0 {
			break
		}
		tag := html[i+1 : i+gt]
		i += gt + 1

		// Comments and doctypes carry no text.
		if strings.HasPrefix(tag, "!") {
			continue
		}
		closing := strings.HasPrefix(tag, "/")
		name := strings.TrimPrefix(tag, "/")
		if k := strings.IndexFunc(name, func(r rune) bool {
			return unicode.IsSpace(r) || r == '/' || r == '>'
		}); k >= 0 {
			name = name[:k]
		}
		name = strings.ToLower(name)

		switch {
		case name == "title":
			inTitle = !closing
		case chromeTags[name]:
			// Nested chrome is tracked by name so </div> inside a <nav> does
			// not end the skip early.
			if closing {
				if skipDepth > 0 && skipTag == name {
					skipDepth--
				}
			} else if !strings.HasSuffix(tag, "/") {
				if skipDepth == 0 {
					skipTag = name
				}
				if skipTag == name {
					skipDepth++
				}
			}
		case blockTags[name] && skipDepth == 0:
			out.WriteByte('\n')
		}
	}

	return squashSpace(unescapeEntities(title)), tidyText(unescapeEntities(out.String()))
}

// extractLinks returns every href in the document, unresolved.
func extractLinks(html string) []string {
	var out []string
	lower := strings.ToLower(html)
	for i := 0; ; {
		j := strings.Index(lower[i:], "<a ")
		if j < 0 {
			return out
		}
		i += j
		end := strings.IndexByte(html[i:], '>')
		if end < 0 {
			return out
		}
		tag := html[i : i+end]
		if href, ok := attrValue(tag, "href"); ok {
			out = append(out, unescapeEntities(href))
		}
		i += end + 1
	}
}

func attrValue(tag, attr string) (string, bool) {
	lower := strings.ToLower(tag)
	k := strings.Index(lower, attr+"=")
	if k < 0 {
		return "", false
	}
	rest := tag[k+len(attr)+1:]
	if rest == "" {
		return "", false
	}
	switch rest[0] {
	case '"', '\'':
		q := rest[0]
		end := strings.IndexByte(rest[1:], q)
		if end < 0 {
			return "", false
		}
		return rest[1 : 1+end], true
	default:
		end := strings.IndexFunc(rest, unicode.IsSpace)
		if end < 0 {
			return rest, true
		}
		return rest[:end], true
	}
}

func unescapeEntities(s string) string {
	if !strings.ContainsRune(s, '&') {
		return s
	}
	r := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`,
		"&#39;", "'", "&apos;", "'", "&nbsp;", " ", "&mdash;", "—",
		"&ndash;", "–", "&hellip;", "…",
	)
	return r.Replace(s)
}

func squashSpace(s string) string { return strings.Join(strings.Fields(s), " ") }

// tidyText collapses runs of whitespace within a line and runs of blank lines
// between them, so the result reads as paragraphs rather than as the shape of
// somebody's indentation.
func tidyText(s string) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := false
	for _, l := range lines {
		l = squashSpace(l)
		if l == "" {
			if !blank && len(out) > 0 {
				out = append(out, "")
			}
			blank = true
			continue
		}
		blank = false
		out = append(out, l)
	}
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	return strings.Join(out, "\n")
}
