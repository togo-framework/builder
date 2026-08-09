package sources

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// KindSlack is the registered kind for a single Slack channel source.
const KindSlack = "slack"

func init() { Register(KindSlack, newSlack) }

// Defaults and caps. As in github.go, every one of these exists because the
// unbounded version is how one misbehaving channel or proxy becomes this
// process's problem.
const (
	defaultMaxMessages = 200
	hardMaxMessages    = 1000

	// A page near Slack's practical maximum. Fewer pages for the same message
	// count means fewer round trips against the same rate limit.
	slackPageLimit = 200

	// "Recent traffic in one channel", not "read until Slack stops answering".
	// At the page size above this already covers five times the message cap,
	// so this only bites when a channel is mostly join notices and edits that
	// never counted toward the cap.
	maxSlackPages = 10

	// A single chat message that runs to tens of kilobytes is a pasted log
	// dump, not a message an agent should quote back. Past this it is
	// truncated, not skipped: the message still happened and still deserves a
	// Doc, just not an unbounded one.
	maxMessageTextBytes = 4000

	slackAPIBase = "https://slack.com/api"
	slackTimeout = 30 * time.Second

	// Slack's response for 200 messages of ordinary length is well under a
	// megabyte; this is a backstop against a misconfigured proxy or a
	// pathological channel, not a size anyone should ever hit.
	maxSlackResponseBytes = 4 << 20
)

// slackChannelRe is the whole enforcement of "exactly one channel, named
// explicitly by id" (issue #45). It accepts a bare public ("C…") or private
// ("G…") conversation ID and nothing else — no comma-separated list, no "*",
// no human channel name that would need a lookup this connector has no
// business doing. "D…" (a direct message) is deliberately excluded: this is
// the CHANNEL connector, and a DM is a different consent surface. The length
// bound keeps a garbage string from being carried around as if it were a
// real identifier.
var slackChannelRe = regexp.MustCompile(`^[CG][A-Z0-9]{7,20}$`)

// SlackConfig is one configured channel.
//
// There is deliberately no `token` field, for the same reason GitHubConfig has
// none: the credential lives in the vault and this config carries its NAME.
type SlackConfig struct {
	ChannelID string `json:"channelID"`

	// TokenSecret is the NAME of a vault secret holding a bot token — never
	// the token itself (Rule 34).
	TokenSecret string `json:"tokenSecret"`

	MaxMessages int `json:"maxMessages,omitempty"`

	// APIBase lets a test point the connector at an httptest server. Slack has
	// no self-hosted deployment, so in production this is always the default.
	APIBase string `json:"apiBase,omitempty"`
}

type slackSource struct {
	cfg  SlackConfig
	sec  Secrets
	http *http.Client
}

func newSlack(raw json.RawMessage, sec Secrets) (Source, error) {
	// Decode twice, exactly as github.go does: the typed decode gets the
	// config, and the loose decode catches a credential parked under a field
	// this struct does not have (someone typing "token" instead of reading
	// the docs), which the typed decode would otherwise discard silently.
	var loose map[string]json.RawMessage
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil, fmt.Errorf("slack source config: %w", err)
	}
	for key, v := range loose {
		k := strings.ToLower(key)
		for _, bad := range credentialFields {
			if k != bad {
				continue
			}
			var s string
			if json.Unmarshal(v, &s) == nil && strings.TrimSpace(s) == "" {
				continue // an empty field is a leftover, not a leak
			}
			return nil, fmt.Errorf("slack source config: %q must not hold a credential — store it in the vault and put its name in \"tokenSecret\"", key)
		}
	}

	var cfg SlackConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("slack source config: %w", err)
	}
	if err := cfg.normalise(); err != nil {
		return nil, err
	}
	return &slackSource{
		cfg:  cfg,
		sec:  sec,
		http: &http.Client{Timeout: slackTimeout},
	}, nil
}

func (c *SlackConfig) normalise() error {
	c.ChannelID = strings.TrimSpace(c.ChannelID)
	c.TokenSecret = strings.TrimSpace(c.TokenSecret)

	if c.ChannelID == "" {
		return fmt.Errorf(`slack source config: "channelID" is required — this connector reads exactly one named channel, never everything a token can see`)
	}
	if !slackChannelRe.MatchString(c.ChannelID) {
		return fmt.Errorf("slack source config: %q must be a single Slack channel ID (like \"C0123456789\"), not a name, a list, or a wildcard", c.ChannelID)
	}
	if c.TokenSecret == "" {
		return fmt.Errorf(`slack source config: "tokenSecret" is required — the NAME of a vault secret holding a bot token`)
	}
	if LooksLikeCredential(c.TokenSecret) {
		return fmt.Errorf(`slack source config: "tokenSecret" holds what looks like a credential — it must be the NAME of a vault secret`)
	}

	switch {
	case c.MaxMessages <= 0:
		c.MaxMessages = defaultMaxMessages
	case c.MaxMessages > hardMaxMessages:
		c.MaxMessages = hardMaxMessages
	}

	c.APIBase = strings.TrimSuffix(strings.TrimSpace(c.APIBase), "/")
	if c.APIBase == "" {
		c.APIBase = slackAPIBase
	}
	return nil
}

func (s *slackSource) Kind() string { return KindSlack }
func (s *slackSource) Name() string { return s.cfg.ChannelID }

// Fetch reads messages posted after cursor.
//
// Outbound is out of scope here on purpose: posting a digest back to the
// channel needs a writer identity — whose name it sends as, and whose grant
// authorizes the post — that this package does not have. This connector only
// ever reads. A digest writer is a follow-up with its own Retainer-shaped
// interface, not an extra method bolted onto this one.
func (s *slackSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	cursor = strings.TrimSpace(cursor)

	// The consent decision the issue asks for, not an optimisation: the people
	// who posted before this source existed never agreed to have their
	// messages collected. So the first run reads NOTHING. It records "now" as
	// the boundary and stops — which also means it never touches the vault or
	// the network, so a source with a bad tokenSecret still creates cleanly
	// and only surfaces the problem on the second run, once there is
	// something it actually needs the token for.
	if cursor == "" {
		return Batch{Cursor: slackTS(time.Now()), Unchanged: true}, nil
	}

	token, err := s.token(ctx)
	if err != nil {
		return Batch{}, err
	}

	var batch Batch
	// conversations.history returns each page newest-first, so the very first
	// message of the very first page is the newest timestamp this run will
	// see. That is exactly the oldest= boundary the NEXT run needs, and it is
	// cheaper to note it here than to compare every ts that follows.
	newest := cursor
	fetched := 0
	var pageCursor string

	for page := 0; page < maxSlackPages; page++ {
		resp, err := s.history(ctx, token, cursor, pageCursor)
		if err != nil {
			return Batch{}, err
		}
		if page == 0 && len(resp.Messages) > 0 {
			newest = resp.Messages[0].TS
		}

		for _, m := range resp.Messages {
			if fetched >= s.cfg.MaxMessages {
				// Deferred, not dropped: the next run's oldest= starts at
				// `newest` above, which is still ahead of this message, so it
				// will be read (and counted) on the following refresh.
				batch.Skipped = append(batch.Skipped, Skip{
					Ref:    m.TS,
					Reason: fmt.Sprintf("over the %d message cap for this run; will be read on the next refresh", s.cfg.MaxMessages),
				})
				continue
			}
			text := strings.TrimSpace(m.Text)
			if text == "" {
				// A join notice, a reaction-only event, a file share with no
				// caption: Slack still gives it a ts, but there is no text to
				// retain, and reporting it as Skipped (not silently dropped)
				// is what tells an operator "the channel is quiet" apart from
				// "the connector is broken".
				batch.Skipped = append(batch.Skipped, Skip{Ref: m.TS, Reason: "no text content"})
				continue
			}
			if len(text) > maxMessageTextBytes {
				text = text[:maxMessageTextBytes] + "\n…"
			}
			batch.Docs = append(batch.Docs, Doc{
				// The ts is Slack's own guarantee of per-channel uniqueness,
				// so the second refresh over the same message — should one
				// ever be re-read — UPDATEs the memory instead of duplicating
				// it.
				Ref:   m.TS,
				Title: fmt.Sprintf("Slack #%s", s.cfg.ChannelID),
				// Redacted here, not left to the caller: a key pasted into a
				// thread is exactly the kind of thing a chat channel
				// accumulates, and this Doc should never carry it, whatever
				// Refresh() also does downstream.
				Text:       Redact(text),
				Importance: 0.3,
			})
			fetched++
		}

		if !resp.HasMore || resp.ResponseMetadata.NextCursor == "" || fetched >= s.cfg.MaxMessages {
			break
		}
		pageCursor = resp.ResponseMetadata.NextCursor
	}

	batch.Cursor = newest
	batch.Unchanged = len(batch.Docs) == 0
	return batch, nil
}

// token reveals the configured secret. The value lives in this local for the
// length of one Fetch, is never stored on the struct, never logged, and
// reaches exactly one destination: an Authorization header.
func (s *slackSource) token(ctx context.Context) (string, error) {
	if s.sec == nil {
		return "", fmt.Errorf("source %s needs vault secret %q but no vault is wired in", s.cfg.ChannelID, s.cfg.TokenSecret)
	}
	tok, err := s.sec.Reveal(ctx, s.cfg.TokenSecret)
	if err != nil {
		// Scrubbed and named by REF: the failure says which secret, never
		// what it held.
		return "", fmt.Errorf("reveal %q for slack source %s: %s", s.cfg.TokenSecret, s.cfg.ChannelID, Scrub(err.Error()))
	}
	if strings.TrimSpace(tok) == "" {
		return "", fmt.Errorf("vault secret %q is empty", s.cfg.TokenSecret)
	}
	return tok, nil
}

type slackMessage struct {
	Text string `json:"text"`
	TS   string `json:"ts"`
}

type slackHistoryResponse struct {
	OK               bool           `json:"ok"`
	Error            string         `json:"error"`
	Messages         []slackMessage `json:"messages"`
	HasMore          bool           `json:"has_more"`
	ResponseMetadata struct {
		NextCursor string `json:"next_cursor"`
	} `json:"response_metadata"`
}

// history calls conversations.history for one page.
func (s *slackSource) history(ctx context.Context, token, oldest, pageCursor string) (slackHistoryResponse, error) {
	q := url.Values{
		"channel": {s.cfg.ChannelID},
		"oldest":  {oldest},
		// Explicit rather than relying on the default: the oldest boundary is
		// a message this connector already turned into a Doc on a prior run
		// (or, on the very first paged run, the source's own creation
		// moment), and re-including it would either duplicate work or read
		// before the consent boundary by one message.
		"inclusive": {"false"},
		"limit":     {strconv.Itoa(slackPageLimit)},
	}
	if pageCursor != "" {
		q.Set("cursor", pageCursor)
	}

	u := s.cfg.APIBase + "/conversations.history?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return slackHistoryResponse{}, fmt.Errorf("build request for conversations.history: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	res, err := s.http.Do(req)
	if err != nil {
		// A transport error can quote the request, headers included.
		return slackHistoryResponse{}, fmt.Errorf("GET conversations.history: %s", Scrub(err.Error()))
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusTooManyRequests {
		if retry := res.Header.Get("Retry-After"); retry != "" {
			return slackHistoryResponse{}, fmt.Errorf("GET conversations.history: rate limited, retry after %ss", retry)
		}
		return slackHistoryResponse{}, fmt.Errorf("GET conversations.history: rate limited")
	}
	if res.StatusCode != http.StatusOK {
		return slackHistoryResponse{}, fmt.Errorf("GET conversations.history: unexpected status %d", res.StatusCode)
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(io.LimitReader(res.Body, maxSlackResponseBytes+1)); err != nil {
		return slackHistoryResponse{}, fmt.Errorf("read conversations.history: %s", Scrub(err.Error()))
	}
	if buf.Len() > maxSlackResponseBytes {
		return slackHistoryResponse{}, fmt.Errorf("read conversations.history: response is larger than %d bytes", maxSlackResponseBytes)
	}

	var out slackHistoryResponse
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		return slackHistoryResponse{}, fmt.Errorf("decode conversations.history: %w", err)
	}
	// Slack's Web API answers almost everything with HTTP 200; ok:false in the
	// body is the real error signal. out.Error is always a short machine code
	// ("invalid_auth", "channel_not_found", "not_in_channel") — Slack never
	// echoes the request or the token back into it, so it is safe to surface
	// as-is.
	if !out.OK {
		return slackHistoryResponse{}, fmt.Errorf("conversations.history for %s: %s", s.cfg.ChannelID, out.Error)
	}
	return out, nil
}

// slackTS formats a time the way Slack formats a message timestamp:
// seconds.microseconds, zero-padded to six decimal digits. Six digits is what
// makes a plain string compare of two ts values agree with time order, which
// is what "newest" above and Slack's own oldest= filter both rely on.
func slackTS(t time.Time) string {
	return fmt.Sprintf("%d.%06d", t.Unix(), t.Nanosecond()/1000)
}
