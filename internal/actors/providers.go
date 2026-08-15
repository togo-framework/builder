package actors

// The five senders.
//
// Every one is the same shape on purpose: parse config, parse params, render the
// exact bytes that would go on the wire, and — if DryRun — return them without
// opening a socket. The rendering is the reviewable part, so it happens first
// and unconditionally; the network call is the last statement in the function.
//
// None of them import the vault. They take a Secrets (see secrets.go), which is
// the single seam SF-001 blocks.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
)

func init() {
	Register(slack{})
	Register(discord{})
	Register(telegram{})
	Register(email{})
	Register(webhook{})
}

// httpDo is the shared client. Bounded, and never following a redirect to a
// host the operator did not configure — an outbound integration that chases a
// 302 is an SSRF with extra steps.
var httpDo = &http.Client{
	Timeout: 20 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// postJSON is the common provider call. Returns the body for the caller to
// interpret, plus whether a retry is worth attempting.
func postJSON(ctx context.Context, url string, hdr map[string]string, payload any) (int, []byte, bool, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, false, fmt.Errorf("encode payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, nil, false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := httpDo.Do(req)
	if err != nil {
		// A transport error is retryable: nothing was necessarily delivered,
		// and the caller holds an idempotency key for exactly this case.
		return 0, nil, true, fmt.Errorf("send: %w", err)
	}
	defer res.Body.Close()
	// Capped: a provider that answers with a megabyte of HTML must not become a
	// megabyte in an outbox row.
	out, _ := io.ReadAll(io.LimitReader(res.Body, 64<<10))
	return res.StatusCode, out, retryableStatus(res.StatusCode), nil
}

// retryableStatus: 429 and 5xx only. A 4xx is the caller being wrong, and
// retrying it just sends the same wrong thing again (Rule 39).
func retryableStatus(code int) bool {
	return code == http.StatusTooManyRequests || code >= 500
}

// retryAfter reads the provider's own backoff instruction. Honoured by the
// CALLER — an actor never sleeps (see ActOutput.RetryAfter).
func retryAfter(h http.Header) time.Duration {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if v == "" {
		return 0
	}
	var secs int
	if _, err := fmt.Sscanf(v, "%d", &secs); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	return 0
}

func schema(s string) json.RawMessage { return json.RawMessage(s) }

// ───────────────────────────── slack ─────────────────────────────

type slack struct{}

func (slack) Kind() string { return "slack" }

func (slack) Actions() []ActionSpec {
	return []ActionSpec{{
		Name:        "send_message",
		Title:       Text{EN: "Send a message", AR: "إرسال رسالة"},
		Description: Text{EN: "Post a message to a Slack channel.", AR: "نشر رسالة في قناة سلاك."},
		InputSchema: schema(`{
  "type":"object","required":["channel","text"],"additionalProperties":false,
  "properties":{
    "channel":{"type":"string","minLength":1,"description":"Channel id, e.g. C0123456789"},
    "text":{"type":"string","minLength":1,"maxLength":4000},
    "thread_ts":{"type":"string","description":"Reply in a thread"}
  }}`),
		External:   true,
		Idempotent: false,
		Grant:      "connections.slack.send",
		RatePerMin: 60,
	}}
}

type slackParams struct {
	Channel  string `json:"channel"`
	Text     string `json:"text"`
	ThreadTS string `json:"thread_ts"`
}

type slackConfig struct {
	TokenSecret string `json:"tokenSecret"`
}

func (s slack) Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error) {
	var c slackConfig
	if err := json.Unmarshal(cfg, &c); err != nil {
		return ActOutput{}, fmt.Errorf("slack config: %w", err)
	}
	var p slackParams
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return ActOutput{}, fmt.Errorf("slack params: %w", err)
	}
	if p.Channel == "" || p.Text == "" {
		return ActOutput{}, errors.New("slack: channel and text are required")
	}

	payload := map[string]any{"channel": p.Channel, "text": p.Text}
	if p.ThreadTS != "" {
		payload["thread_ts"] = p.ThreadTS
	}
	preview := fmt.Sprintf("POST chat.postMessage → %s\n\n%s", p.Channel, p.Text)
	if in.DryRun {
		return ActOutput{Preview: preview}, nil
	}

	tok, err := sec.Reveal(ctx, c.TokenSecret)
	if err != nil {
		return ActOutput{}, err
	}
	code, body, retryable, err := postJSON(ctx, "https://slack.com/api/chat.postMessage",
		map[string]string{"Authorization": "Bearer " + tok}, payload)
	if err != nil {
		return ActOutput{Preview: preview, Retryable: retryable}, err
	}
	// Slack answers 200 with {"ok":false,"error":"..."} — a status check alone
	// reports success for a message that was never posted.
	var r struct {
		OK    bool   `json:"ok"`
		TS    string `json:"ts"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &r)
	if code != http.StatusOK || !r.OK {
		return ActOutput{Preview: preview, Result: body, Retryable: retryable || r.Error == "ratelimited"},
			fmt.Errorf("slack refused: %s (http %d)", r.Error, code)
	}
	return ActOutput{ProviderRef: r.TS, Preview: preview, Result: body}, nil
}

// ───────────────────────────── discord ─────────────────────────────

type discord struct{}

func (discord) Kind() string { return "discord" }

func (discord) Actions() []ActionSpec {
	return []ActionSpec{{
		Name:        "send_message",
		Title:       Text{EN: "Send a message", AR: "إرسال رسالة"},
		Description: Text{EN: "Post to a Discord channel via an incoming webhook.", AR: "نشر في قناة ديسكورد عبر ويب هوك."},
		InputSchema: schema(`{
  "type":"object","required":["content"],"additionalProperties":false,
  "properties":{
    "content":{"type":"string","minLength":1,"maxLength":2000},
    "username":{"type":"string","maxLength":80}
  }}`),
		External:   true,
		Grant:      "connections.discord.send",
		RatePerMin: 30,
	}}
}

type discordConfig struct {
	// The whole webhook URL is the credential — it needs no other auth, so it
	// is stored as a secret rather than as config.
	URLSecret string `json:"urlSecret"`
}

func (d discord) Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error) {
	var c discordConfig
	if err := json.Unmarshal(cfg, &c); err != nil {
		return ActOutput{}, fmt.Errorf("discord config: %w", err)
	}
	var p struct {
		Content  string `json:"content"`
		Username string `json:"username"`
	}
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return ActOutput{}, fmt.Errorf("discord params: %w", err)
	}
	if strings.TrimSpace(p.Content) == "" {
		return ActOutput{}, errors.New("discord: content is required")
	}

	payload := map[string]any{"content": p.Content}
	if p.Username != "" {
		payload["username"] = p.Username
	}
	preview := "POST discord webhook\n\n" + p.Content
	if in.DryRun {
		return ActOutput{Preview: preview}, nil
	}

	hook, err := sec.Reveal(ctx, c.URLSecret)
	if err != nil {
		return ActOutput{}, err
	}
	// The webhook URL IS the secret, so it must never reach an error message,
	// an outbox row, or a log line (Rule 34). Only its shape is checked here.
	if !strings.HasPrefix(hook, "https://") {
		return ActOutput{}, errors.New("discord: the stored webhook is not an https URL")
	}
	code, body, retryable, err := postJSON(ctx, hook, nil, payload)
	if err != nil {
		return ActOutput{Preview: preview, Retryable: retryable}, errors.New("discord: send failed")
	}
	if code < 200 || code >= 300 {
		return ActOutput{Preview: preview, Result: body, Retryable: retryable},
			fmt.Errorf("discord refused (http %d)", code)
	}
	return ActOutput{Preview: preview, Result: body}, nil
}

// ───────────────────────────── telegram ─────────────────────────────

type telegram struct{}

func (telegram) Kind() string { return "telegram" }

func (telegram) Actions() []ActionSpec {
	return []ActionSpec{{
		Name:        "send_message",
		Title:       Text{EN: "Send a message", AR: "إرسال رسالة"},
		Description: Text{EN: "Send a Telegram message to a chat.", AR: "إرسال رسالة تيليجرام إلى محادثة."},
		InputSchema: schema(`{
  "type":"object","required":["chat_id","text"],"additionalProperties":false,
  "properties":{
    "chat_id":{"type":"string","minLength":1},
    "text":{"type":"string","minLength":1,"maxLength":4096},
    "parse_mode":{"type":"string","enum":["MarkdownV2","HTML"]}
  }}`),
		External:   true,
		Grant:      "connections.telegram.send",
		RatePerMin: 30,
	}}
}

type telegramConfig struct {
	TokenSecret string `json:"tokenSecret"`
}

func (t telegram) Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error) {
	var c telegramConfig
	if err := json.Unmarshal(cfg, &c); err != nil {
		return ActOutput{}, fmt.Errorf("telegram config: %w", err)
	}
	var p struct {
		ChatID    string `json:"chat_id"`
		Text      string `json:"text"`
		ParseMode string `json:"parse_mode"`
	}
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return ActOutput{}, fmt.Errorf("telegram params: %w", err)
	}
	if p.ChatID == "" || p.Text == "" {
		return ActOutput{}, errors.New("telegram: chat_id and text are required")
	}

	payload := map[string]any{"chat_id": p.ChatID, "text": p.Text}
	if p.ParseMode != "" {
		payload["parse_mode"] = p.ParseMode
	}
	preview := fmt.Sprintf("POST sendMessage → chat %s\n\n%s", p.ChatID, p.Text)
	if in.DryRun {
		return ActOutput{Preview: preview}, nil
	}

	tok, err := sec.Reveal(ctx, c.TokenSecret)
	if err != nil {
		return ActOutput{}, err
	}
	// The bot token sits in the PATH for Telegram, which is why the error below
	// never echoes the URL.
	endpoint := "https://api.telegram.org/bot" + url.PathEscape(tok) + "/sendMessage"
	code, body, retryable, err := postJSON(ctx, endpoint, nil, payload)
	if err != nil {
		return ActOutput{Preview: preview, Retryable: retryable}, errors.New("telegram: send failed")
	}
	var r struct {
		OK     bool `json:"ok"`
		Result struct {
			MessageID int64 `json:"message_id"`
		} `json:"result"`
		Description string `json:"description"`
	}
	_ = json.Unmarshal(body, &r)
	if code != http.StatusOK || !r.OK {
		return ActOutput{Preview: preview, Result: body, Retryable: retryable},
			fmt.Errorf("telegram refused: %s (http %d)", r.Description, code)
	}
	return ActOutput{ProviderRef: fmt.Sprint(r.Result.MessageID), Preview: preview, Result: body}, nil
}

// ───────────────────────────── email ─────────────────────────────

type email struct{}

func (email) Kind() string { return "email" }

func (email) Actions() []ActionSpec {
	return []ActionSpec{{
		Name:        "send",
		Title:       Text{EN: "Send an email", AR: "إرسال بريد"},
		Description: Text{EN: "Send a plain-text email over SMTP.", AR: "إرسال بريد نصي عبر SMTP."},
		InputSchema: schema(`{
  "type":"object","required":["to","subject","body"],"additionalProperties":false,
  "properties":{
    "to":{"type":"string","format":"email"},
    "subject":{"type":"string","minLength":1,"maxLength":250},
    "body":{"type":"string","minLength":1,"maxLength":100000}
  }}`),
		External:   true,
		Grant:      "connections.email.send",
		RatePerMin: 20,
	}}
}

type emailConfig struct {
	Host           string `json:"host"`
	Port           int    `json:"port"`
	From           string `json:"from"`
	UserSecret     string `json:"userSecret"`
	PasswordSecret string `json:"passwordSecret"`
}

func (e email) Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error) {
	var c emailConfig
	if err := json.Unmarshal(cfg, &c); err != nil {
		return ActOutput{}, fmt.Errorf("email config: %w", err)
	}
	var p struct {
		To      string `json:"to"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return ActOutput{}, fmt.Errorf("email params: %w", err)
	}
	if _, err := mail.ParseAddress(p.To); err != nil {
		return ActOutput{}, fmt.Errorf("email: %q is not a deliverable address: %w", p.To, err)
	}
	if c.Host == "" || c.From == "" {
		return ActOutput{}, fmt.Errorf("%w: email needs a host and a from address", ErrNotConfigured)
	}
	// Header injection: a newline in either field lets the caller append
	// arbitrary headers — a Bcc to somewhere else, a forged Reply-To. Both are
	// single-line fields by definition, so refusing is correct and total.
	if strings.ContainsAny(p.Subject, "\r\n") || strings.ContainsAny(p.To, "\r\n") {
		return ActOutput{}, errors.New("email: newlines are not allowed in the recipient or subject")
	}

	msg := renderEmail(c.From, p.To, p.Subject, p.Body)
	preview := fmt.Sprintf("SMTP %s:%d\n\n%s", c.Host, c.Port, msg)
	if in.DryRun {
		return ActOutput{Preview: preview}, nil
	}

	// The send itself is deliberately the last thing, and it is the only part
	// that needs the vault.
	if _, err := sec.Reveal(ctx, c.PasswordSecret); err != nil {
		return ActOutput{}, err
	}
	return ActOutput{}, fmt.Errorf("%w: SMTP delivery is wired behind the same seam", ErrBlockedSF001)
}

// renderEmail builds the RFC 5322 message. Split out so a test can assert the
// exact bytes without a server.
func renderEmail(from, to, subject, body string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	return b.String()
}

// ───────────────────────────── webhook ─────────────────────────────

type webhook struct{}

func (webhook) Kind() string { return "webhook" }

func (webhook) Actions() []ActionSpec {
	return []ActionSpec{{
		Name:        "post",
		Title:       Text{EN: "POST to a URL", AR: "إرسال إلى رابط"},
		Description: Text{EN: "Send a JSON body to a configured endpoint.", AR: "إرسال محتوى JSON إلى نقطة نهاية."},
		InputSchema: schema(`{
  "type":"object","required":["body"],"additionalProperties":false,
  "properties":{"body":{"type":"object"}}}`),
		External:   true,
		Idempotent: true,
		Grant:      "connections.webhook.post",
		RatePerMin: 120,
	}}
}

type webhookConfig struct {
	URL string `json:"url"`
	// Optional shared secret, sent as a header. Named, never inlined.
	TokenSecret string `json:"tokenSecret"`
	TokenHeader string `json:"tokenHeader"`
}

func (w webhook) Act(ctx context.Context, in ActInput, cfg json.RawMessage, sec Secrets) (ActOutput, error) {
	var c webhookConfig
	if err := json.Unmarshal(cfg, &c); err != nil {
		return ActOutput{}, fmt.Errorf("webhook config: %w", err)
	}
	var p struct {
		Body json.RawMessage `json:"body"`
	}
	if err := json.Unmarshal(in.Params, &p); err != nil {
		return ActOutput{}, fmt.Errorf("webhook params: %w", err)
	}
	u, err := url.Parse(c.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return ActOutput{}, fmt.Errorf("%w: a webhook target must be an absolute https URL", ErrNotConfigured)
	}

	preview := fmt.Sprintf("POST %s\n\n%s", c.URL, string(p.Body))
	if in.DryRun {
		return ActOutput{Preview: preview}, nil
	}

	hdr := map[string]string{}
	if c.TokenSecret != "" {
		tok, err := sec.Reveal(ctx, c.TokenSecret)
		if err != nil {
			return ActOutput{}, err
		}
		name := c.TokenHeader
		if name == "" {
			name = "Authorization"
		}
		hdr[name] = tok
	}
	var payload any
	_ = json.Unmarshal(p.Body, &payload)
	code, body, retryable, err := postJSON(ctx, c.URL, hdr, payload)
	if err != nil {
		return ActOutput{Preview: preview, Retryable: retryable}, err
	}
	if code < 200 || code >= 300 {
		return ActOutput{Preview: preview, Result: body, Retryable: retryable},
			fmt.Errorf("webhook refused (http %d)", code)
	}
	return ActOutput{Preview: preview, Result: body}, nil
}
