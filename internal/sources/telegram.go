package sources

// The "telegram" source kind: messages a bot can see in a chat.
//
// # The constraint that shapes this connector
//
// Telegram has no "read the history of this chat" endpoint for bots. `getUpdates`
// returns only what has arrived since the bot last acknowledged, Telegram keeps
// undelivered updates for about 24 hours, and reading them CONSUMES them:
// acknowledging an offset discards everything before it, permanently.
//
// Three things follow, and all three are visible in the code:
//
//  1. A bot added to a chat sees nothing that was said before it joined. There
//     is no backfill to write, so none is attempted.
//  2. Only ONE consumer may poll a bot. A second getUpdates caller steals
//     updates the first will never see — which is why a 409 is reported as a
//     configuration conflict rather than retried.
//  3. Privacy mode. By default a bot in a GROUP receives only messages that
//     mention it or reply to it, so a collector configured against a busy group
//     returns almost nothing and looks broken. That is a setting in @BotFather,
//     and the error text says so.
//
// A webhook would avoid the polling limits, but it requires this installation
// to be reachable from the internet on a public HTTPS name — which a builder
// running on somebody's laptop is not. Polling works everywhere.

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

const KindTelegram = "telegram"

func init() { Register(KindTelegram, newTelegram) }

const (
	telegramDefaultMax = 100
	telegramHardMax    = 1000
	// Telegram's own ceiling for one getUpdates call.
	telegramPageLimit = 100
	telegramMaxPages  = 10
	telegramAPIBase   = "https://api.telegram.org"
)

type telegramConfig struct {
	TokenSecret string `json:"tokenSecret"`
	ChatID      string `json:"chatId"`
	MaxMessages int    `json:"maxMessages"`
}

type telegramSource struct {
	cfg  telegramConfig
	sec  Secrets
	http *http.Client
}

func newTelegram(cfg json.RawMessage, sec Secrets) (Source, error) {
	var c telegramConfig
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("telegram source config: %w", err)
		}
	}
	c.TokenSecret = strings.TrimSpace(c.TokenSecret)
	c.ChatID = strings.TrimSpace(c.ChatID)
	if c.TokenSecret == "" {
		return nil, errors.New(`telegram source config: "tokenSecret" is required — the NAME of a vault secret holding the @BotFather token, never the token`)
	}
	if c.ChatID == "" {
		return nil, errors.New(`telegram source config: "chatId" is required — negative for groups, e.g. -100123456789`)
	}
	c.MaxMessages = clampInt(c.MaxMessages, telegramDefaultMax, 1, telegramHardMax)
	return &telegramSource{cfg: c, sec: sec, http: &http.Client{Timeout: 40 * time.Second}}, nil
}

func (t *telegramSource) Kind() string { return KindTelegram }
func (t *telegramSource) Name() string { return t.cfg.ChatID }

func (t *telegramSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	token, err := t.sec.Reveal(ctx, t.cfg.TokenSecret)
	if err != nil {
		return Batch{}, fmt.Errorf("reveal %s: %w", t.cfg.TokenSecret, err)
	}

	// The cursor is the last update_id consumed. Telegram's `offset` is
	// last+1 — passing `last` re-delivers it forever, which is a duplicate on
	// every run rather than an error.
	var offset int64
	if cursor != "" {
		if v, err := strconv.ParseInt(cursor, 10, 64); err == nil {
			offset = v + 1
		}
	}

	var b Batch
	last := cursor
	otherChats := 0

	for page := 0; page < telegramMaxPages && len(b.Docs) < t.cfg.MaxMessages; page++ {
		if ctx.Err() != nil {
			return b, ctx.Err()
		}
		ups, err := t.getUpdates(ctx, token, offset)
		if err != nil {
			return b, err
		}
		if len(ups) == 0 {
			break
		}

		for _, u := range ups {
			// Advance the cursor for EVERY update, including ones for other
			// chats. Not doing so means the same updates are re-fetched on
			// every run and the offset never moves past them.
			last = strconv.FormatInt(u.UpdateID, 10)
			offset = u.UpdateID + 1

			m := u.Message
			if m == nil {
				m = u.ChannelPost
			}
			if m == nil {
				continue
			}
			if chatIDOf(m) != t.cfg.ChatID {
				otherChats++
				continue
			}
			text := strings.TrimSpace(m.Text)
			if text == "" {
				text = strings.TrimSpace(m.Caption)
			}
			if text == "" {
				continue
			}
			b.Docs = append(b.Docs, Doc{
				Ref:        fmt.Sprintf("telegram:%s:%d", t.cfg.ChatID, m.MessageID),
				Title:      telegramTitle(m, text),
				Text:       telegramText(m, text),
				Importance: telegramImportance(m, text),
			})
			if len(b.Docs) >= t.cfg.MaxMessages {
				break
			}
		}
		if len(ups) < telegramPageLimit {
			break
		}
	}

	// Updates arrived, all for other chats. Almost always a wrong chatId — and
	// worth saying, because the alternative is a green connection that collects
	// nothing and gives no reason.
	if otherChats > 0 && len(b.Docs) == 0 {
		b.Skipped = append(b.Skipped, Skip{
			Ref: t.cfg.ChatID,
			Reason: fmt.Sprintf(
				"%d messages arrived for other chats and none for %s — check the chat id",
				otherChats, t.cfg.ChatID),
		})
	}
	b.Cursor = last
	return b, nil
}

type telegramUpdate struct {
	UpdateID    int64            `json:"update_id"`
	Message     *telegramMessage `json:"message"`
	ChannelPost *telegramMessage `json:"channel_post"`
}

type telegramMessage struct {
	MessageID int64  `json:"message_id"`
	Date      int64  `json:"date"`
	Text      string `json:"text"`
	Caption   string `json:"caption"`
	From      struct {
		FirstName string `json:"first_name"`
		Username  string `json:"username"`
		IsBot     bool   `json:"is_bot"`
	} `json:"from"`
	Chat struct {
		ID    int64  `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	} `json:"chat"`
	ReplyTo *telegramMessage `json:"reply_to_message"`
}

func chatIDOf(m *telegramMessage) string { return strconv.FormatInt(m.Chat.ID, 10) }

func (t *telegramSource) getUpdates(ctx context.Context, token string, offset int64) ([]telegramUpdate, error) {
	q := url.Values{}
	q.Set("limit", strconv.Itoa(telegramPageLimit))
	if offset > 0 {
		q.Set("offset", strconv.FormatInt(offset, 10))
	}
	// timeout=0: a SHORT poll. Long polling would hold the connection open for
	// the duration and is the right shape for a live bot; this is a scheduled
	// collector that must return promptly and run again later.
	q.Set("timeout", "0")

	u := fmt.Sprintf("%s/bot%s/getUpdates?%s", telegramAPIBase, token, q.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	res, err := t.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var out struct {
		OK          bool             `json:"ok"`
		Result      []telegramUpdate `json:"result"`
		Description string           `json:"description"`
		ErrorCode   int              `json:"error_code"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode telegram response: %w", err)
	}
	if !out.OK {
		switch out.ErrorCode {
		case 401:
			return nil, errors.New("telegram rejected the bot token")
		case 409:
			// Not retryable, and not transient: something else is already
			// consuming this bot's updates, and whichever caller wins takes
			// updates the other will never see.
			return nil, errors.New(
				"another process is already polling this bot (or a webhook is set) — a bot can have exactly one consumer")
		}
		return nil, fmt.Errorf("telegram: %s", out.Description)
	}
	return out.Result, nil
}

func telegramSender(m *telegramMessage) string {
	if m.From.Username != "" {
		return "@" + m.From.Username
	}
	if m.From.FirstName != "" {
		return m.From.FirstName
	}
	return "unknown"
}

func telegramTitle(m *telegramMessage, text string) string {
	if i := strings.IndexByte(text, '\n'); i > 0 {
		text = text[:i]
	}
	if len(text) > 80 {
		text = text[:80] + "…"
	}
	return fmt.Sprintf("%s: %s", telegramSender(m), text)
}

func telegramText(m *telegramMessage, text string) string {
	var sb strings.Builder
	where := m.Chat.Title
	if where == "" {
		where = m.Chat.Type
	}
	fmt.Fprintf(&sb, "From: %s\nChat: %s\nWhen: %s\n\n%s",
		telegramSender(m), where, time.Unix(m.Date, 0).UTC().Format(time.RFC3339), text)
	if m.ReplyTo != nil {
		// The quoted message, trimmed. A reply without its parent is half a
		// conversation, and the parent is usually one line.
		q := strings.TrimSpace(m.ReplyTo.Text)
		if len(q) > 200 {
			q = q[:200] + "…"
		}
		if q != "" {
			fmt.Fprintf(&sb, "\n\nIn reply to %s: %s", telegramSender(m.ReplyTo), q)
		}
	}
	return sb.String()
}

func telegramImportance(m *telegramMessage, text string) float64 {
	switch {
	case m.ReplyTo != nil:
		return 0.7
	case len(text) > 200:
		return 0.6
	default:
		return 0.5
	}
}
