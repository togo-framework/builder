package sources

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// KindWhatsApp is the registered kind for a single WhatsApp chat source.
const KindWhatsApp = "whatsapp"

func init() { Register(KindWhatsApp, newWhatsApp) }

// WhatsApp, through Evolution API.
//
// WhatsApp has no first-party API for this, so something has to hold the
// session. Evolution API is a self-hosted REST service over Baileys: the
// operator pairs it once by QR, it keeps the connection, and we read one chat
// from it over HTTP with an apikey header. That shape is what makes it usable
// here — this package is stdlib-only by rule, so a connector that had to link
// a WhatsApp protocol library could not exist at all.
//
// The same two rules as Slack apply, for the same reasons, and they are not
// configurable:
//
//   - ONE chat per source, named explicitly by its remoteJid. A connector that
//     reads everything an account can see is a data-protection problem wearing
//     a feature's clothes.
//   - NEVER backfill. Only messages sent after the source was created. The
//     people in that chat did not know they were being collected before it
//     existed, and a first run that swept up a year of conversation would be
//     collecting from them without their knowledge.

const (
	defaultWhatsAppMessages = 200
	maxWhatsAppMessages     = 1000
	whatsAppTimeout         = 30 * time.Second
	maxWhatsAppResponse     = 8 << 20
)

type whatsAppConfig struct {
	// BaseURL is the Evolution API instance, e.g. http://localhost:8080.
	BaseURL string `json:"baseURL"`
	// Instance is Evolution's own name for a paired phone.
	Instance string `json:"instance"`
	// ChatID is the remoteJid: 4477...@s.whatsapp.net for a person,
	// 1203...@g.us for a group.
	ChatID string `json:"chatID"`
	// APIKeySecret is the NAME of a vault secret holding the Evolution apikey,
	// never the key. A credential in config would sit in plaintext in every
	// backup and be readable by anyone with SELECT on the table.
	APIKeySecret string `json:"apiKeySecret"`
	MaxMessages  int    `json:"maxMessages"`
}

type whatsAppSource struct {
	cfg whatsAppConfig
	sec Secrets
	c   *http.Client
}

func newWhatsApp(raw json.RawMessage, sec Secrets) (Source, error) {
	var c whatsAppConfig
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &c); err != nil {
			return nil, fmt.Errorf("whatsapp source config: %w", err)
		}
	}
	c.BaseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	c.Instance = strings.TrimSpace(c.Instance)
	c.ChatID = strings.TrimSpace(c.ChatID)
	c.APIKeySecret = strings.TrimSpace(c.APIKeySecret)

	if c.BaseURL == "" {
		return nil, fmt.Errorf(`whatsapp source config: "baseURL" is required — the address of your Evolution API instance`)
	}
	if u, err := url.Parse(c.BaseURL); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf(`whatsapp source config: "baseURL" must be an http or https URL`)
	}
	if c.Instance == "" {
		return nil, fmt.Errorf(`whatsapp source config: "instance" is required — the Evolution instance name for the paired phone`)
	}
	// Exactly one chat, and it has to look like one. A blank or wildcard value
	// here is the difference between following a group and reading an inbox.
	if c.ChatID == "" {
		return nil, fmt.Errorf(`whatsapp source config: "chatID" is required — one chat, named explicitly (a remoteJid like 1203...@g.us)`)
	}
	if !strings.Contains(c.ChatID, "@") || strings.ContainsAny(c.ChatID, "*?,") {
		return nil, fmt.Errorf(`whatsapp source config: %q is not a single remoteJid — this connector follows exactly one chat`, c.ChatID)
	}
	if c.APIKeySecret == "" {
		return nil, fmt.Errorf(`whatsapp source config: "apiKeySecret" is required — the NAME of a vault secret holding the Evolution apikey, not the key itself`)
	}
	c.MaxMessages = clampInt(c.MaxMessages, defaultWhatsAppMessages, 1, maxWhatsAppMessages)

	return &whatsAppSource{cfg: c, sec: sec, c: &http.Client{Timeout: whatsAppTimeout}}, nil
}

func (w *whatsAppSource) Kind() string { return KindWhatsApp }
func (w *whatsAppSource) Name() string { return w.cfg.Instance + "/" + w.cfg.ChatID }

// evolution's findMessages response, narrowed to what is used.
type waMessage struct {
	Key struct {
		ID        string `json:"id"`
		RemoteJid string `json:"remoteJid"`
		FromMe    bool   `json:"fromMe"`
	} `json:"key"`
	PushName         string `json:"pushName"`
	MessageTimestamp any    `json:"messageTimestamp"`
	Message          struct {
		Conversation string `json:"conversation"`
		Extended     struct {
			Text string `json:"text"`
		} `json:"extendedTextMessage"`
		Image struct {
			Caption string `json:"caption"`
		} `json:"imageMessage"`
		Document struct {
			Caption  string `json:"caption"`
			FileName string `json:"fileName"`
		} `json:"documentMessage"`
	} `json:"message"`
}

func (m waMessage) text() string {
	switch {
	case strings.TrimSpace(m.Message.Conversation) != "":
		return m.Message.Conversation
	case strings.TrimSpace(m.Message.Extended.Text) != "":
		return m.Message.Extended.Text
	case strings.TrimSpace(m.Message.Image.Caption) != "":
		return m.Message.Image.Caption
	case strings.TrimSpace(m.Message.Document.Caption) != "":
		return m.Message.Document.Caption
	}
	return ""
}

// unix reads the timestamp, which Evolution sends as a number or a string
// depending on version.
func (m waMessage) unix() int64 {
	switch v := m.MessageTimestamp.(type) {
	case float64:
		return int64(v)
	case string:
		n, _ := strconv.ParseInt(v, 10, 64)
		return n
	}
	return 0
}

func (w *whatsAppSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	// FIRST RUN COLLECTS NOTHING, deliberately.
	//
	// The cursor is the timestamp collection started from. Recording it and
	// returning empty means the history that existed before this source did is
	// never read — the people in that chat did not consent to it. This is a
	// consent decision, not an optimisation, and it is why the empty-cursor
	// branch does not even make a request.
	if strings.TrimSpace(cursor) == "" {
		return Batch{
			Cursor:    strconv.FormatInt(time.Now().Unix(), 10),
			Unchanged: true,
			Skipped: []Skip{{
				Ref: "(history)", Reason: "collection starts now — messages sent before this source was added are never read",
			}},
		}, nil
	}
	since, err := strconv.ParseInt(cursor, 10, 64)
	if err != nil {
		return Batch{}, fmt.Errorf("whatsapp cursor %q is not a timestamp", cursor)
	}

	key, err := w.sec.Reveal(ctx, w.cfg.APIKeySecret)
	if err != nil {
		return Batch{}, fmt.Errorf("could not read the Evolution apikey %q from the vault: %s",
			w.cfg.APIKeySecret, Scrub(err.Error()))
	}
	if strings.TrimSpace(key) == "" {
		return Batch{}, fmt.Errorf("the vault secret %q is empty", w.cfg.APIKeySecret)
	}

	body, _ := json.Marshal(map[string]any{
		"where": map[string]any{"key": map[string]any{"remoteJid": w.cfg.ChatID}},
		"limit": w.cfg.MaxMessages,
	})
	endpoint := w.cfg.BaseURL + "/chat/findMessages/" + url.PathEscape(w.cfg.Instance)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Batch{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", key)

	res, err := w.c.Do(req)
	if err != nil {
		// Scrubbed: a transport error quotes the request it failed on, and the
		// apikey is a header on that request.
		return Batch{}, fmt.Errorf("evolution api unreachable: %s", Scrub(err.Error()))
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, maxWhatsAppResponse))
	if err != nil {
		return Batch{}, fmt.Errorf("could not read the evolution response: %s", Scrub(err.Error()))
	}
	if res.StatusCode != http.StatusOK {
		return Batch{}, fmt.Errorf("evolution api returned %s: %s",
			res.Status, Scrub(firstLineOf(string(raw), 200)))
	}

	msgs, err := decodeEvolutionMessages(raw)
	if err != nil {
		return Batch{}, fmt.Errorf("could not read the evolution response: %s", Scrub(err.Error()))
	}

	var batch Batch
	newest := since
	for _, m := range msgs {
		ts := m.unix()
		if ts <= since {
			continue // already collected, or older than this source
		}
		// Belt and braces: the query filters by remoteJid, and this refuses
		// anything that came back anyway. One chat means one chat.
		if m.Key.RemoteJid != "" && m.Key.RemoteJid != w.cfg.ChatID {
			continue
		}
		text := strings.TrimSpace(m.text())
		if text == "" {
			continue // media with no caption carries nothing to remember
		}
		who := strings.TrimSpace(m.PushName)
		if m.Key.FromMe {
			who = "us"
		}
		if who == "" {
			who = "someone"
		}
		batch.Docs = append(batch.Docs, Doc{
			// The message id is unique per chat and stable, so an edited or
			// re-delivered message updates in place.
			Ref:   m.Key.ID,
			Title: who + " in " + w.cfg.ChatID,
			// Redact, not Scrub: this becomes a memory an agent can quote back,
			// and a key pasted into a group chat must not survive the trip.
			Text: Redact(text),
		})
		if ts > newest {
			newest = ts
		}
	}

	batch.Cursor = strconv.FormatInt(newest, 10)
	batch.Unchanged = len(batch.Docs) == 0
	return batch, nil
}

// decodeEvolutionMessages copes with both response shapes Evolution has
// shipped: a bare array, and {messages:{records:[…]}} in later versions.
func decodeEvolutionMessages(raw []byte) ([]waMessage, error) {
	var direct []waMessage
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct, nil
	}
	var wrapped struct {
		Messages struct {
			Records []waMessage `json:"records"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(raw, &wrapped); err != nil {
		return nil, err
	}
	return wrapped.Messages.Records, nil
}

func firstLineOf(s string, max int) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
