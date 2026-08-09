package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

type waVault struct{ key string }

func (f waVault) Reveal(context.Context, string) (string, error) { return f.key, nil }

func waSource(t *testing.T, base string, extra map[string]any) *whatsAppSource {
	t.Helper()
	cfg := map[string]any{
		"baseURL": base, "instance": "main",
		"chatID": "120363@g.us", "apiKeySecret": "evolution-key",
	}
	for k, v := range extra {
		cfg[k] = v
	}
	raw, _ := json.Marshal(cfg)
	s, err := newWhatsApp(raw, waVault{key: "secret-key"})
	if err != nil {
		t.Fatal(err)
	}
	w := s.(*whatsAppSource)
	w.c = &http.Client{}
	return w
}

// The consent rule, and the reason this connector exists in this shape. The
// people in a chat did not know they were being collected before the source
// existed, so a first run must not sweep up their history — and must not even
// ask for it.
func TestFirstRunCollectsNothingAndAsksForNothing(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		fmt.Fprint(w, `[]`)
	}))
	defer srv.Close()

	b, err := waSource(t, srv.URL, nil).Fetch(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if called {
		t.Error("the first run contacted Evolution — it must not even ask for history")
	}
	if len(b.Docs) != 0 {
		t.Errorf("the first run collected %d messages; it must collect none", len(b.Docs))
	}
	if b.Cursor == "" {
		t.Error("the first run must record where collection starts")
	}
	if len(b.Skipped) == 0 {
		t.Error("skipping the history must be reported, not silent")
	}
}

func TestOnlyMessagesAfterTheCursorAreCollected(t *testing.T) {
	now := time.Now().Unix()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "secret-key" {
			t.Errorf("apikey header = %q", r.Header.Get("apikey"))
		}
		fmt.Fprintf(w, `[
		  {"key":{"id":"old","remoteJid":"120363@g.us"},"pushName":"Sam","messageTimestamp":%d,
		   "message":{"conversation":"before the source existed"}},
		  {"key":{"id":"new","remoteJid":"120363@g.us"},"pushName":"Sam","messageTimestamp":%d,
		   "message":{"conversation":"the deploy is blue-green"}}
		]`, now-1000, now)
	}))
	defer srv.Close()

	b, err := waSource(t, srv.URL, nil).Fetch(context.Background(), strconv.FormatInt(now-500, 10))
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Docs) != 1 {
		t.Fatalf("collected %d messages, want 1: %+v", len(b.Docs), b.Docs)
	}
	if b.Docs[0].Ref != "new" {
		t.Errorf("collected %q, want the message after the cursor", b.Docs[0].Ref)
	}
	if b.Cursor != strconv.FormatInt(now, 10) {
		t.Errorf("cursor = %q, want the newest timestamp %d", b.Cursor, now)
	}
}

// Another chat's message arriving in the response must not be collected: one
// chat means one chat, whatever the server sends back.
func TestAnotherChatIsRefused(t *testing.T) {
	now := time.Now().Unix()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `[{"key":{"id":"x","remoteJid":"999@s.whatsapp.net"},
		   "messageTimestamp":%d,"message":{"conversation":"a private message"}}]`, now)
	}))
	defer srv.Close()

	b, _ := waSource(t, srv.URL, nil).Fetch(context.Background(), strconv.FormatInt(now-10, 10))
	if len(b.Docs) != 0 {
		t.Errorf("collected a message from another chat: %+v", b.Docs)
	}
}

// A key pasted into a group chat must not become a memory an agent quotes back.
func TestCredentialsInMessagesAreRedacted(t *testing.T) {
	now := time.Now().Unix()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `[{"key":{"id":"k","remoteJid":"120363@g.us"},"messageTimestamp":%d,
		  "message":{"conversation":"use password=hunter2 for the staging box"}}]`, now)
	}))
	defer srv.Close()

	b, _ := waSource(t, srv.URL, nil).Fetch(context.Background(), strconv.FormatInt(now-10, 10))
	if len(b.Docs) != 1 {
		t.Fatalf("want 1 doc, got %d", len(b.Docs))
	}
	if strings.Contains(b.Docs[0].Text, "hunter2") {
		t.Errorf("a password survived into a memory: %q", b.Docs[0].Text)
	}
}

func TestConfigRefusesAnythingButOneChat(t *testing.T) {
	for _, tc := range []struct{ name, cfg string }{
		{"no base URL", `{"instance":"main","chatID":"1@g.us","apiKeySecret":"k"}`},
		{"no instance", `{"baseURL":"http://x","chatID":"1@g.us","apiKeySecret":"k"}`},
		{"no chat", `{"baseURL":"http://x","instance":"main","apiKeySecret":"k"}`},
		{"a wildcard", `{"baseURL":"http://x","instance":"main","chatID":"*","apiKeySecret":"k"}`},
		{"a list", `{"baseURL":"http://x","instance":"main","chatID":"1@g.us,2@g.us","apiKeySecret":"k"}`},
		{"no key name", `{"baseURL":"http://x","instance":"main","chatID":"1@g.us"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := newWhatsApp(json.RawMessage(tc.cfg), waVault{}); err == nil {
				t.Error("accepted a config that does not name exactly one chat")
			}
		})
	}
}

// Evolution has shipped two response shapes; both have to decode or the
// connector silently collects nothing on half the deployments out there.
func TestBothEvolutionResponseShapesDecode(t *testing.T) {
	for name, body := range map[string]string{
		"bare array": `[{"key":{"id":"a"},"messageTimestamp":1}]`,
		"wrapped":    `{"messages":{"records":[{"key":{"id":"a"},"messageTimestamp":1}]}}`,
	} {
		msgs, err := decodeEvolutionMessages([]byte(body))
		if err != nil || len(msgs) != 1 || msgs[0].Key.ID != "a" {
			t.Errorf("%s did not decode: %v %+v", name, err, msgs)
		}
	}
}

// The timestamp arrives as a number or a string depending on version.
func TestTimestampParsesEitherWay(t *testing.T) {
	var asNum, asStr waMessage
	json.Unmarshal([]byte(`{"messageTimestamp":1700000000}`), &asNum)
	json.Unmarshal([]byte(`{"messageTimestamp":"1700000000"}`), &asStr)
	if asNum.unix() != 1700000000 || asStr.unix() != 1700000000 {
		t.Errorf("num=%d str=%d, want both 1700000000", asNum.unix(), asStr.unix())
	}
}
