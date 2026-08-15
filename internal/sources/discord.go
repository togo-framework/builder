package sources

// The "discord" source kind: a channel's messages, read by a bot.
//
// # A bot, not a webhook
//
// An incoming webhook can only shout into a channel. It cannot read a message,
// cannot be mentioned, and has no identity beyond whatever name the poster
// chose. Reading history needs a bot token and the MESSAGE CONTENT intent,
// which is a privileged intent the operator turns on in the Developer Portal —
// without it Discord returns messages with empty `content` and no error, so a
// collector that does not check for this silently ingests a channel of blanks.
//
// That check is worth its lines: see the empty-content guard in Fetch.
//
// # Cursor
//
// Discord ids are snowflakes — monotonically increasing, so the newest id seen
// IS the cursor, and `after=<id>` asks the API for strictly newer messages.
// That makes this connector genuinely incremental, unlike the RSS one: a run
// with nothing new costs one request and returns zero documents.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const KindDiscord = "discord"

func init() { Register(KindDiscord, newDiscord) }

const (
	discordDefaultMax = 200
	discordHardMax    = 1000
	// Discord's own per-request ceiling. Asking for more is an error, not a
	// larger page.
	discordPageLimit = 100
	discordMaxPages  = 10
	discordAPIBase   = "https://discord.com/api/v10"
)

type discordConfig struct {
	BotTokenSecret string `json:"botTokenSecret"`
	ChannelID      string `json:"channelId"`
	GuildID        string `json:"guildId"`
	ApplicationID  string `json:"applicationId"`
	MaxMessages    int    `json:"maxMessages"`
}

type discordSource struct {
	cfg  discordConfig
	sec  Secrets
	http *http.Client
}

func newDiscord(cfg json.RawMessage, sec Secrets) (Source, error) {
	var c discordConfig
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("discord source config: %w", err)
		}
	}
	c.ChannelID = strings.TrimSpace(c.ChannelID)
	c.BotTokenSecret = strings.TrimSpace(c.BotTokenSecret)
	if c.ChannelID == "" {
		return nil, errors.New(`discord source config: "channelId" is required — turn on Developer Mode in Discord, right-click the channel, Copy ID`)
	}
	if c.BotTokenSecret == "" {
		return nil, errors.New(`discord source config: "botTokenSecret" is required — the NAME of a vault secret holding the bot token, never the token`)
	}
	c.MaxMessages = clampInt(c.MaxMessages, discordDefaultMax, 1, discordHardMax)
	return &discordSource{cfg: c, sec: sec, http: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (d *discordSource) Kind() string { return KindDiscord }
func (d *discordSource) Name() string { return d.cfg.ChannelID }

func (d *discordSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	token, err := d.sec.Reveal(ctx, d.cfg.BotTokenSecret)
	if err != nil {
		return Batch{}, fmt.Errorf("reveal %s: %w", d.cfg.BotTokenSecret, err)
	}

	var b Batch
	newest := cursor
	after := cursor
	blank := 0

	for page := 0; page < discordMaxPages && len(b.Docs) < d.cfg.MaxMessages; page++ {
		if ctx.Err() != nil {
			return b, ctx.Err()
		}
		msgs, err := d.page(ctx, token, after)
		if err != nil {
			return b, err
		}
		if len(msgs) == 0 {
			break
		}

		for _, m := range msgs {
			// Snowflakes sort lexicographically only at equal length, so
			// compare numerically.
			if snowflakeNewer(m.ID, newest) {
				newest = m.ID
			}
			if strings.TrimSpace(m.Content) == "" {
				blank++
				continue
			}
			if m.Author.Bot {
				// A bot reading its own posts back into the brain is a loop
				// that looks like content.
				b.Skipped = append(b.Skipped, Skip{Ref: m.ID, Reason: "posted by a bot"})
				continue
			}
			b.Docs = append(b.Docs, Doc{
				Ref:   "discord:" + d.cfg.ChannelID + ":" + m.ID,
				Title: discordTitle(m),
				Text:  discordText(m),
				// A message someone replied to, or that carries an attachment,
				// is more likely to be the substance of a conversation than a
				// one-word acknowledgement.
				Importance: discordImportance(m),
			})
			if len(b.Docs) >= d.cfg.MaxMessages {
				break
			}
		}
		// `after` pages FORWARD in time, so the next page starts at the newest
		// id this one produced.
		after = newest
		if len(msgs) < discordPageLimit {
			break
		}
	}

	// Every message empty is the signature of a missing MESSAGE CONTENT intent,
	// and Discord reports it as success. Without this the operator sees a
	// connection that runs green forever and collects nothing.
	if blank > 0 && len(b.Docs) == 0 {
		return b, fmt.Errorf(
			"discord returned %d messages with no content — enable the MESSAGE CONTENT intent for this bot in the Developer Portal", blank)
	}
	b.Cursor = newest
	return b, nil
}

type discordMessage struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
	Author    struct {
		Username    string `json:"username"`
		GlobalName  string `json:"global_name"`
		Bot         bool   `json:"bot"`
		Discriminat string `json:"discriminator"`
	} `json:"author"`
	Attachments []struct {
		Filename string `json:"filename"`
		URL      string `json:"url"`
	} `json:"attachments"`
	ReferencedMessage *struct {
		ID string `json:"id"`
	} `json:"referenced_message"`
}

func (d *discordSource) page(ctx context.Context, token, after string) ([]discordMessage, error) {
	q := url.Values{}
	q.Set("limit", strconv.Itoa(discordPageLimit))
	if after != "" {
		q.Set("after", after)
	}
	u := fmt.Sprintf("%s/channels/%s/messages?%s", discordAPIBase, url.PathEscape(d.cfg.ChannelID), q.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	// "Bot " is not optional and not a bearer token. Sending it as Bearer gets
	// a 401 that says nothing about the prefix.
	req.Header.Set("Authorization", "Bot "+token)

	res, err := d.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusUnauthorized:
		return nil, errors.New("discord rejected the bot token")
	case http.StatusForbidden:
		return nil, fmt.Errorf("the bot cannot read channel %s — invite it to the server and give it View Channel and Read Message History", d.cfg.ChannelID)
	case http.StatusNotFound:
		return nil, fmt.Errorf("no channel %s — check the id, and that the bot is in that server", d.cfg.ChannelID)
	case http.StatusTooManyRequests:
		// Discord's limits are per-route and it says how long to wait. Reporting
		// that verbatim beats a generic failure the operator cannot time.
		return nil, fmt.Errorf("discord rate limited this channel; retry after %s seconds", res.Header.Get("Retry-After"))
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("discord api returned %d", res.StatusCode)
	}

	var msgs []discordMessage
	if err := json.NewDecoder(res.Body).Decode(&msgs); err != nil {
		return nil, fmt.Errorf("decode discord messages: %w", err)
	}
	return msgs, nil
}

func discordAuthor(m discordMessage) string {
	if m.Author.GlobalName != "" {
		return m.Author.GlobalName
	}
	return m.Author.Username
}

func discordTitle(m discordMessage) string {
	txt := strings.TrimSpace(m.Content)
	if i := strings.IndexByte(txt, '\n'); i > 0 {
		txt = txt[:i]
	}
	if len(txt) > 80 {
		txt = txt[:80] + "…"
	}
	return fmt.Sprintf("%s: %s", discordAuthor(m), txt)
}

func discordText(m discordMessage) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "From: %s\nWhen: %s\n\n%s", discordAuthor(m), m.Timestamp, m.Content)
	for _, a := range m.Attachments {
		// The filename, not the URL's contents. Discord attachment URLs are
		// signed and expire, so storing one as if it were durable is a link
		// that rots within the day.
		fmt.Fprintf(&sb, "\n[attachment: %s]", a.Filename)
	}
	return sb.String()
}

func discordImportance(m discordMessage) float64 {
	switch {
	case m.ReferencedMessage != nil:
		return 0.7
	case len(m.Attachments) > 0:
		return 0.65
	case len(m.Content) > 200:
		return 0.6
	default:
		return 0.5
	}
}

// snowflakeNewer compares two Discord ids numerically.
//
// They are 64-bit integers rendered as strings, and string comparison is only
// correct while both have the same length — which stops being true across the
// digit boundary. Parsing is cheap and correct.
func snowflakeNewer(a, b string) bool {
	if b == "" {
		return a != ""
	}
	ai, err1 := strconv.ParseUint(a, 10, 64)
	bi, err2 := strconv.ParseUint(b, 10, 64)
	if err1 != nil || err2 != nil {
		return a > b
	}
	return ai > bi
}
