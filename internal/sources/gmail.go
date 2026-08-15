package sources

// The "gmail" source kind: messages matching a Gmail search, into the brain.
//
// # Why a search string rather than a label picker
//
// Gmail's own search is the thing every user already knows how to write, it is
// far more expressive than a label list (`from:`, `newer_than:`, `has:
// attachment`, `-in:chats`), and it is what the API accepts verbatim in `q`.
// Offering a label dropdown would be a worse version of a language the operator
// is already fluent in.
//
// The cost is that a careless query reads a lot of mail. `maxMessages` is the
// backstop, and the schema's default is deliberately narrow
// (`is:important newer_than:7d`) so the first run is small.
//
// # The two-call shape
//
// list returns ids only — no headers, no body — so every message costs a second
// request. That is the API's design, not an oversight, and it is why
// `maxMessages` caps at 500: a thousand-message query is a thousand round trips
// and several minutes inside one refresh's timeout.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const KindGmail = "gmail"

func init() { Register(KindGmail, newGmail) }

const (
	gmailDefaultMax = 50
	gmailHardMax    = 500
	gmailAPI        = "https://gmail.googleapis.com/gmail/v1/users/me"
	// A single message body. Newsletters run large, and a 2MB HTML mail is a
	// memory nobody will read and an embedding nobody will match.
	gmailMaxBodyBytes = 256 << 10
)

type gmailConfig struct {
	Query       string `json:"query"`
	MaxMessages int    `json:"maxMessages"`
	IncludeBody *bool  `json:"includeBody"`
}

type gmailSource struct {
	cfg  gmailConfig
	http *http.Client
}

func newGmail(cfg json.RawMessage, _ Secrets) (Source, error) {
	var c gmailConfig
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("gmail source config: %w", err)
		}
	}
	c.Query = strings.TrimSpace(c.Query)
	if c.Query == "" {
		return nil, errors.New(`gmail source config: "query" is required — a Gmail search such as "is:important newer_than:7d"`)
	}
	if c.MaxMessages <= 0 {
		c.MaxMessages = gmailDefaultMax
	}
	if c.MaxMessages > gmailHardMax {
		c.MaxMessages = gmailHardMax
	}
	return &gmailSource{cfg: c, http: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (g *gmailSource) Kind() string { return KindGmail }
func (g *gmailSource) Name() string { return g.cfg.Query }

func (g *gmailSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	tok, err := accessToken(ctx, "gmail")
	if err != nil {
		return Batch{}, err
	}

	// The cursor is the newest internalDate seen. Gmail's search cannot filter
	// on it directly, so it is applied after listing rather than in the query —
	// which means every run pages the same window and keeps only what is newer.
	// Cheap enough at these caps, and correct when a message arrives late.
	var since int64
	if cursor != "" {
		fmt.Sscanf(cursor, "%d", &since)
	}

	ids, err := g.list(ctx, tok)
	if err != nil {
		return Batch{}, err
	}

	var b Batch
	newest := since
	for _, id := range ids {
		if ctx.Err() != nil {
			return b, ctx.Err()
		}
		m, err := g.message(ctx, tok, id)
		if err != nil {
			b.Skipped = append(b.Skipped, Skip{Ref: id, Reason: err.Error()})
			continue
		}
		if m.internalDate <= since {
			continue
		}
		if m.internalDate > newest {
			newest = m.internalDate
		}
		b.Docs = append(b.Docs, Doc{
			// The message id, not the thread id: a thread's ref would make the
			// second reply overwrite the first, and "what did they say" is
			// usually about a specific message.
			Ref:   "gmail:" + id,
			Title: m.subject,
			Text:  m.text,
			// Mail the sender marked important, or that Gmail did, is worth
			// more than a newsletter that matched the same query.
			Importance: m.importance,
		})
	}
	b.Cursor = fmt.Sprintf("%d", newest)
	return b, nil
}

func (g *gmailSource) list(ctx context.Context, tok string) ([]string, error) {
	q := url.Values{}
	q.Set("q", g.cfg.Query)
	q.Set("maxResults", fmt.Sprintf("%d", g.cfg.MaxMessages))
	var out struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := g.call(ctx, tok, gmailAPI+"/messages?"+q.Encode(), &out); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(out.Messages))
	for _, m := range out.Messages {
		ids = append(ids, m.ID)
	}
	return ids, nil
}

type gmailMessage struct {
	subject      string
	text         string
	internalDate int64
	importance   float64
}

func (g *gmailSource) message(ctx context.Context, tok, id string) (gmailMessage, error) {
	format := "full"
	if g.cfg.IncludeBody != nil && !*g.cfg.IncludeBody {
		// Headers only. Meaningfully cheaper, and enough to answer "who asked
		// about X and when" without storing the correspondence itself.
		format = "metadata"
	}
	var raw struct {
		InternalDate string    `json:"internalDate"`
		LabelIDs     []string  `json:"labelIds"`
		Snippet      string    `json:"snippet"`
		Payload      gmailPart `json:"payload"`
	}
	if err := g.call(ctx, tok, fmt.Sprintf("%s/messages/%s?format=%s", gmailAPI, id, format), &raw); err != nil {
		return gmailMessage{}, err
	}

	var m gmailMessage
	fmt.Sscanf(raw.InternalDate, "%d", &m.internalDate)

	var from, to, date string
	for _, h := range raw.Payload.Headers {
		switch strings.ToLower(h.Name) {
		case "subject":
			m.subject = h.Value
		case "from":
			from = h.Value
		case "to":
			to = h.Value
		case "date":
			date = h.Value
		}
	}
	if m.subject == "" {
		m.subject = "(no subject)"
	}

	body := strings.TrimSpace(gmailBody(raw.Payload))
	if body == "" {
		// The snippet is Gmail's own first ~200 characters. Better than an
		// empty memory when the body is HTML-only or an attachment.
		body = raw.Snippet
	}
	if len(body) > gmailMaxBodyBytes {
		body = body[:gmailMaxBodyBytes] + "\n\n[truncated]"
	}

	// Headers first so a recalled memory carries who and when, which is most of
	// what makes a mail useful as context.
	var sb strings.Builder
	fmt.Fprintf(&sb, "From: %s\nTo: %s\nDate: %s\nSubject: %s\n\n%s", from, to, date, m.subject, body)
	m.text = sb.String()

	m.importance = 0.5
	for _, l := range raw.LabelIDs {
		if l == "IMPORTANT" || l == "STARRED" {
			m.importance = 0.8
			break
		}
	}
	return m, nil
}

type gmailPart struct {
	MimeType string `json:"mimeType"`
	Headers  []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"headers"`
	Body struct {
		Data string `json:"data"`
	} `json:"body"`
	Parts []gmailPart `json:"parts"`
}

// gmailBody walks the MIME tree for readable text.
//
// Prefers text/plain and only falls back to text/html, because the HTML branch
// goes through the same conservative tag-stripper the RSS connector uses — good
// enough for prose, wrong on a code sample. Most mail has a plain part; taking
// it when it exists avoids the lossy path entirely.
func gmailBody(p gmailPart) string {
	if strings.HasPrefix(p.MimeType, "text/plain") {
		return gmailDecode(p.Body.Data)
	}
	for _, sub := range p.Parts {
		if s := gmailBody(sub); s != "" {
			return s
		}
	}
	if strings.HasPrefix(p.MimeType, "text/html") {
		return rssHTMLToText(gmailDecode(p.Body.Data))
	}
	return ""
}

func gmailDecode(s string) string {
	if s == "" {
		return ""
	}
	// Gmail uses URL-safe base64 without padding.
	b, err := base64.URLEncoding.WithPadding(base64.NoPadding).DecodeString(s)
	if err != nil {
		return ""
	}
	return string(b)
}

// call is one authenticated GET returning JSON.
func (g *gmailSource) call(ctx context.Context, tok, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := g.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		// Named rather than generic: this is the failure an operator can
		// actually fix, and "403" on its own sends them to the wrong place.
		return fmt.Errorf("Gmail refused the request (%d) — the authorization may have been revoked, or it lacks the gmail.readonly scope", res.StatusCode)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("gmail api returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
