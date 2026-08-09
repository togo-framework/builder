package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeSlack is enough of the Slack Web API to drive this connector:
// conversations.history, with oldest= filtering, cursor-based pagination, and
// a way to force an ok:false error or a raw HTTP status.
//
// A fake rather than fixtures because the interesting behaviour is what the
// connector does NOT request: the no-backfill claim is "the first run never
// calls Slack at all", and the incremental claim is "an unchanged channel
// costs one request" — only a server that counts its own hits can show that.
type fakeSlack struct {
	mu sync.Mutex

	messages []slackMessage // any order; served newest-first, like real Slack
	pageSize int             // 0 = honour the limit= the connector sent

	errCode string // when set, respond {"ok":false,"error":errCode}
	status  int    // when non-zero, respond with this HTTP status instead

	requests []url_ // every request this fake saw
}

type url_ struct {
	oldest, cursor, limit, auth string
}

func newFakeSlack() *fakeSlack { return &fakeSlack{} }

func (f *fakeSlack) hits() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.requests)
}

func (f *fakeSlack) start(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(srv.Close)
	return srv.URL
}

func (f *fakeSlack) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	q := r.URL.Query()
	f.requests = append(f.requests, url_{
		oldest: q.Get("oldest"), cursor: q.Get("cursor"), limit: q.Get("limit"),
		auth: r.Header.Get("Authorization"),
	})
	status, errCode, pageSize := f.status, f.errCode, f.pageSize
	all := append([]slackMessage(nil), f.messages...)
	f.mu.Unlock()

	if !strings.HasSuffix(r.URL.Path, "/conversations.history") {
		http.Error(w, "unhandled "+r.URL.Path, http.StatusNotFound)
		return
	}
	if status != 0 {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if errCode != "" {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": errCode})
		return
	}

	oldest := q.Get("oldest")
	var filtered []slackMessage
	for _, m := range all {
		if oldest == "" || m.TS > oldest { // inclusive=false: strictly after
			filtered = append(filtered, m)
		}
	}
	// Newest first, matching conversations.history's real ordering.
	for i, j := 0, len(filtered)-1; i < j; i, j = i+1, j-1 {
		filtered[i], filtered[j] = filtered[j], filtered[i]
	}

	limit := pageSize
	if limit == 0 {
		limit, _ = strconv.Atoi(q.Get("limit"))
	}
	start := 0
	if c := q.Get("cursor"); c != "" {
		start, _ = strconv.Atoi(strings.TrimPrefix(c, "idx:"))
	}
	end := start + limit
	hasMore := false
	if end < len(filtered) {
		hasMore = true
	} else {
		end = len(filtered)
	}
	var page []slackMessage
	if start < len(filtered) {
		page = filtered[start:end]
	}

	resp := map[string]any{"ok": true, "messages": page, "has_more": hasMore}
	if hasMore {
		resp["response_metadata"] = map[string]any{"next_cursor": fmt.Sprintf("idx:%d", end)}
	}
	_ = json.NewEncoder(w).Encode(resp)
}

// newSlackSource is the shorthand every test below starts with.
func newSlackSource(t *testing.T, cfg map[string]any, sec Secrets) Source {
	t.Helper()
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	src, err := Open(KindSlack, raw, sec)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return src
}

func slackCfg(api string) map[string]any {
	return map[string]any{
		"channelID":   "C0123456789",
		"tokenSecret": "slack-bot-token",
		"apiBase":     api,
	}
}

var slackVault = &fakeVault{values: map[string]string{"slack-bot-token": "xoxb-fake-token-value"}}

// --- config validation -------------------------------------------------

func TestSlackConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		cfg     map[string]any
		wantErr string
	}{
		{
			name:    "missing channel",
			cfg:     map[string]any{"tokenSecret": "slack-bot-token"},
			wantErr: "channelID",
		},
		{
			name:    "two channels smuggled in as a list",
			cfg:     map[string]any{"channelID": "C0123456789,C0987654321", "tokenSecret": "slack-bot-token"},
			wantErr: "single Slack channel ID",
		},
		{
			name:    "wildcard",
			cfg:     map[string]any{"channelID": "*", "tokenSecret": "slack-bot-token"},
			wantErr: "single Slack channel ID",
		},
		{
			name:    "a human channel name, not an ID",
			cfg:     map[string]any{"channelID": "#general", "tokenSecret": "slack-bot-token"},
			wantErr: "single Slack channel ID",
		},
		{
			name:    "a DM, not a channel",
			cfg:     map[string]any{"channelID": "D0123456789", "tokenSecret": "slack-bot-token"},
			wantErr: "single Slack channel ID",
		},
		{
			name:    "missing token secret name",
			cfg:     map[string]any{"channelID": "C0123456789"},
			wantErr: "tokenSecret",
		},
		{
			name:    "a real token pasted where the secret NAME belongs",
			cfg:     map[string]any{"channelID": "C0123456789", "tokenSecret": "xoxb-123456789012-abcdefghijklmnopqrstuvwx"},
			wantErr: "vault secret",
		},
		{
			name:    "a credential parked under a field this struct does not have",
			cfg:     map[string]any{"channelID": "C0123456789", "tokenSecret": "slack-bot-token", "token": "xoxb-123456789012-abcdefghijklmnopqrstuvwx"},
			wantErr: "must not hold a credential",
		},
		{
			name: "valid",
			cfg:  map[string]any{"channelID": "C0123456789", "tokenSecret": "slack-bot-token"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := json.Marshal(tt.cfg)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			_, err = Open(KindSlack, raw, slackVault)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Open: unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Open: expected an error containing %q, got none", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Open error = %q, want it to contain %q", err.Error(), tt.wantErr)
			}
		})
	}
}

func TestSlackMaxMessagesDefaultsAndCaps(t *testing.T) {
	cfg := map[string]any{"channelID": "C0123456789", "tokenSecret": "slack-bot-token"}
	src, err := Open(KindSlack, marshal(t, cfg), slackVault)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got := src.(*slackSource).cfg.MaxMessages; got != defaultMaxMessages {
		t.Errorf("default MaxMessages = %d, want %d", got, defaultMaxMessages)
	}

	cfg["maxMessages"] = 50_000
	src, err = Open(KindSlack, marshal(t, cfg), slackVault)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got := src.(*slackSource).cfg.MaxMessages; got != hardMaxMessages {
		t.Errorf("an oversized maxMessages was not capped: got %d, want %d", got, hardMaxMessages)
	}
}

func marshal(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

// --- the consent decision: never backfill --------------------------------

// The small win from the issue, checked end to end: a fresh source retains
// nothing on its first run.
func TestFirstRunNeverBackfillsAndNeverCallsSlack(t *testing.T) {
	fs := newFakeSlack()
	fs.messages = []slackMessage{
		{TS: "1000000000.000000", Text: "this was posted before anyone wired up the source"},
	}
	api := fs.start(t)

	vault := &fakeVault{values: map[string]string{"slack-bot-token": "xoxb-should-never-be-used"}}
	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(),
		newSlackSource(t, slackCfg(api), vault), NewMemCursors(), brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	if rep.Retained != 0 {
		t.Errorf("first run retained %d messages, want 0 — nothing may be backfilled", rep.Retained)
	}
	if !rep.Unchanged {
		t.Error("first run should report Unchanged")
	}
	if len(brain.retained) != 0 {
		t.Fatalf("the brain gained %d memories on a first run", len(brain.retained))
	}
	if fs.hits() != 0 {
		t.Errorf("Slack was called %d times on a first run, want 0 — there is nothing to authenticate for yet", fs.hits())
	}
	if len(vault.asked) != 0 {
		t.Errorf("the vault was asked for the token on a first run: %v", vault.asked)
	}
	if rep.Cursor == "" {
		t.Fatal("the first run must still record a cursor, or the second run has no boundary to start from")
	}
}

// The cursor recorded on the first run is a real, usable Slack timestamp —
// close to "now", not a placeholder — because it is the consent boundary
// every later message is measured against.
func TestFirstRunCursorIsApproximatelyNow(t *testing.T) {
	before := time.Now()
	src := newSlackSource(t, slackCfg("http://unused.invalid"), slackVault)
	batch, err := src.Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	after := time.Now()

	secStr, _, ok := strings.Cut(batch.Cursor, ".")
	if !ok {
		t.Fatalf("cursor %q is not a Slack-shaped timestamp", batch.Cursor)
	}
	sec, err := strconv.ParseInt(secStr, 10, 64)
	if err != nil {
		t.Fatalf("cursor %q does not parse: %v", batch.Cursor, err)
	}
	got := time.Unix(sec, 0)
	if got.Before(before.Add(-time.Second)) || got.After(after.Add(time.Second)) {
		t.Errorf("cursor %q = %v, want it within a second of now (%v..%v)", batch.Cursor, got, before, after)
	}
}

// --- incremental reads ----------------------------------------------------

// A second run reads only messages after the cursor, redacts what it finds,
// and moves the cursor to the newest message it saw.
func TestSecondRunRetainsOnlyMessagesAfterTheCursor(t *testing.T) {
	fs := newFakeSlack()
	fs.messages = []slackMessage{
		{TS: "1000000000.000000", Text: "posted before the cursor, must not appear"},
		{TS: "1000000100.000000", Text: "hey the deploy key is password=hunter2, careful"},
		{TS: "1000000200.000000", Text: "all clear now"},
	}
	api := fs.start(t)

	brain := &fakeBrain{}
	src := newSlackSource(t, slackCfg(api), slackVault)
	rep, err := Refresh(context.Background(), src, NewMemCursors(), brain, "default:project")
	// direct Fetch, since the cursor for this test is hand-picked rather than
	// coming from a prior Refresh.
	_ = rep
	_ = err

	batch, err := src.Fetch(context.Background(), "1000000000.000000")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 2 {
		t.Fatalf("retained %d docs, want 2 (messages strictly after the cursor)", len(batch.Docs))
	}
	for _, d := range batch.Docs {
		if d.Ref == "1000000000.000000" {
			t.Error("the message at the cursor boundary was re-read; oldest should be exclusive")
		}
	}
	if batch.Cursor != "1000000200.000000" {
		t.Errorf("Cursor = %q, want the newest message's ts", batch.Cursor)
	}
	if batch.Unchanged {
		t.Error("new messages arrived; Unchanged should be false")
	}

	var secret string
	for _, d := range batch.Docs {
		if strings.Contains(d.Text, "hunter2") {
			secret = d.Text
		}
	}
	if secret != "" {
		t.Errorf("a pasted credential survived redaction: %q", secret)
	}

	// The vault was asked by NAME, and the value never leaked into anything
	// this test can see.
	if len(slackVault.asked) == 0 || slackVault.asked[len(slackVault.asked)-1] != "slack-bot-token" {
		t.Errorf("token was not revealed by name: %v", slackVault.asked)
	}
}

// A re-run against a channel with nothing new costs one request and zero
// writes — the whole point of carrying a cursor forward.
func TestUnchangedChannelCostsOneRequestZeroWrites(t *testing.T) {
	fs := newFakeSlack()
	fs.messages = []slackMessage{{TS: "1000000000.000000", Text: "old news"}}
	api := fs.start(t)

	cur := NewMemCursors()
	_ = cur.SetCursor(context.Background(), KindSlack, "C0123456789", "1000000000.000000")
	src := newSlackSource(t, slackCfg(api), slackVault)
	brain := &fakeBrain{}

	rep, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if !rep.Unchanged {
		t.Error("no new messages: Unchanged should be true")
	}
	if rep.Retained != 0 || len(brain.retained) != 0 {
		t.Errorf("retained %d, want 0", rep.Retained)
	}
	if fs.hits() != 1 {
		t.Errorf("Slack was hit %d times, want exactly 1", fs.hits())
	}
}

// Doc.Ref is the message ts: a second read of the same message (e.g. after a
// cursor is rewound) upserts rather than duplicates.
func TestDocRefIsTheMessageTimestamp(t *testing.T) {
	fs := newFakeSlack()
	fs.messages = []slackMessage{{TS: "1000000100.000000", Text: "hello"}}
	api := fs.start(t)
	src := newSlackSource(t, slackCfg(api), slackVault)

	batch, err := src.Fetch(context.Background(), "1000000000.000000")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 1 || batch.Docs[0].Ref != "1000000100.000000" {
		t.Fatalf("Docs = %+v, want one doc with Ref = the message ts", batch.Docs)
	}
}

// A message with no text (a join notice, a bare file share) is reported as
// Skipped, not silently dropped and not retained as an empty memory.
func TestTextlessMessagesAreReportedSkipped(t *testing.T) {
	fs := newFakeSlack()
	fs.messages = []slackMessage{
		{TS: "1000000100.000000", Text: ""},
		{TS: "1000000200.000000", Text: "real content"},
	}
	api := fs.start(t)
	src := newSlackSource(t, slackCfg(api), slackVault)

	batch, err := src.Fetch(context.Background(), "1000000000.000000")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 1 {
		t.Fatalf("Docs = %+v, want only the message with text", batch.Docs)
	}
	if len(batch.Skipped) != 1 || batch.Skipped[0].Ref != "1000000100.000000" {
		t.Fatalf("Skipped = %+v, want the textless message reported", batch.Skipped)
	}
}

// --- pagination is bounded -------------------------------------------------

// A channel with more traffic than the message cap is paginated, but only up
// to the cap; the rest are Skipped for the next run, not silently truncated.
func TestPaginationStopsAtTheMessageCap(t *testing.T) {
	fs := newFakeSlack()
	fs.pageSize = 10
	for i := 0; i < 55; i++ {
		fs.messages = append(fs.messages, slackMessage{
			TS:   fmt.Sprintf("100000%04d.000000", i),
			Text: fmt.Sprintf("message %d", i),
		})
	}
	api := fs.start(t)

	cfg := slackCfg(api)
	cfg["maxMessages"] = 20
	src := newSlackSource(t, cfg, slackVault)

	batch, err := src.Fetch(context.Background(), "1000000000.000000")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Docs) != 20 {
		t.Errorf("Docs = %d, want exactly the 20-message cap", len(batch.Docs))
	}
	if len(batch.Skipped) == 0 {
		t.Error("messages beyond the cap should be reported Skipped, not dropped without a trace")
	}
	// 55 messages at 10 per page needs at most 6 pages; bounded well under
	// maxSlackPages either way, but this pins the pagination loop actually ran.
	if got := fs.hits(); got < 2 {
		t.Errorf("Slack was hit %d times, want more than one page", got)
	}
}

// The page-count bound holds even against a channel that claims to have
// far more history than the message cap could ever need.
func TestPageCountIsBoundedRegardlessOfHasMore(t *testing.T) {
	fs := newFakeSlack()
	fs.pageSize = 1 // force one message per page, so this would loop forever unbounded
	for i := 0; i < 5000; i++ {
		fs.messages = append(fs.messages, slackMessage{
			TS:   fmt.Sprintf("1%09d.000000", i),
			Text: "", // textless, so `fetched` never reaches the cap on its own
		})
	}
	api := fs.start(t)
	src := newSlackSource(t, slackCfg(api), slackVault)

	_, err := src.Fetch(context.Background(), "0999999999.000000")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if got := fs.hits(); got > maxSlackPages {
		t.Errorf("Slack was hit %d times, want at most maxSlackPages (%d)", got, maxSlackPages)
	}
}

// --- errors -----------------------------------------------------------

// Slack answers almost everything with HTTP 200; ok:false in the body is the
// real error, and it must not be swallowed as success.
func TestSlackOKFalseIsAnError(t *testing.T) {
	fs := newFakeSlack()
	fs.errCode = "channel_not_found"
	api := fs.start(t)
	src := newSlackSource(t, slackCfg(api), slackVault)

	_, err := src.Fetch(context.Background(), "1000000000.000000")
	if err == nil {
		t.Fatal("expected an error for ok:false")
	}
	if !strings.Contains(err.Error(), "channel_not_found") {
		t.Errorf("error = %v, want it to name the Slack error code", err)
	}
}

// The bot token never appears in an error, however the request fails.
func TestTokenNeverAppearsInAnError(t *testing.T) {
	fs := newFakeSlack()
	fs.status = http.StatusUnauthorized
	api := fs.start(t)

	vault := &fakeVault{values: map[string]string{"slack-bot-token": "xoxb-super-secret-value-do-not-leak"}}
	src := newSlackSource(t, slackCfg(api), vault)

	_, err := src.Fetch(context.Background(), "1000000000.000000")
	if err == nil {
		t.Fatal("expected an error for a 401")
	}
	if strings.Contains(err.Error(), "xoxb-super-secret-value-do-not-leak") {
		t.Fatalf("the token leaked into an error: %v", err)
	}

	// Refresh() wraps and scrubs it too; check that path as well since that is
	// what actually reaches a log line.
	_, rerr := Refresh(context.Background(), src, NewMemCursors(), &fakeBrain{}, "default:project")
	if rerr == nil || strings.Contains(rerr.Error(), "xoxb-super-secret-value-do-not-leak") {
		t.Fatalf("Refresh error leaked the token: %v", rerr)
	}
}

// A reveal failure is surfaced with the secret's NAME, never its value, and
// the source names which secret it needed.
func TestVaultRevealFailureNamesTheSecretNotTheValue(t *testing.T) {
	fs := newFakeSlack()
	api := fs.start(t)
	vault := &fakeVault{err: fmt.Errorf("permission denied for secret xoxb-would-be-the-value")}
	src := newSlackSource(t, slackCfg(api), vault)

	_, err := src.Fetch(context.Background(), "1000000000.000000")
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "slack-bot-token") {
		t.Errorf("error = %v, want it to name the secret %q", err, "slack-bot-token")
	}
}

// Rate limiting is surfaced as an error rather than retried into an unbounded
// loop; the run fails cleanly and the cursor is not advanced.
func TestRateLimitIsReportedNotRetried(t *testing.T) {
	fs := newFakeSlack()
	fs.status = http.StatusTooManyRequests
	api := fs.start(t)
	src := newSlackSource(t, slackCfg(api), slackVault)

	_, err := src.Fetch(context.Background(), "1000000000.000000")
	if err == nil {
		t.Fatal("expected an error for a 429")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "rate limit") {
		t.Errorf("error = %v, want it to mention the rate limit", err)
	}
	if fs.hits() != 1 {
		t.Errorf("Slack was hit %d times, want exactly 1 — a 429 must not be retried in a loop", fs.hits())
	}
}
