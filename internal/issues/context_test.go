package issues

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// The happy path: a bridge-mode SDK's snapshot passes through intact.
func TestSanitizeContextKeepsAWellFormedSnapshot(t *testing.T) {
	in := []byte(`{
		"console": [{"level":"error","text":"boom","ts":1723200000000}],
		"network": [{"method":"GET","url":"/api/x","status":500,"durationMs":42,"ts":1723200000001}],
		"viewport": {"w":1440,"h":900,"dpr":2},
		"userAgent": "Mozilla/5.0",
		"locale": "ar"
	}`)
	out, reason := sanitizeContext(in)
	if reason != "" {
		t.Fatalf("dropped a well-formed context: %s", reason)
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatalf("output is not JSON: %v", err)
	}
	if len(c.Console) != 1 || c.Console[0].Level != "error" || c.Console[0].Text != "boom" {
		t.Fatalf("console mangled: %+v", c.Console)
	}
	if len(c.Network) != 1 || c.Network[0].Status != 500 || c.Network[0].URL != "/api/x" {
		t.Fatalf("network mangled: %+v", c.Network)
	}
	if c.Viewport == nil || c.Viewport.W != 1440 || c.Viewport.DPR != 2 {
		t.Fatalf("viewport mangled: %+v", c.Viewport)
	}
}

// Absent, null and empty all mean "no context" and store NULL — never "{}",
// which would put an empty section on every issue that carried nothing.
func TestSanitizeContextEmptyMeansAbsent(t *testing.T) {
	for _, in := range []string{"", "null", "{}", `{"console":[],"network":[]}`} {
		out, reason := sanitizeContext(json.RawMessage(in))
		if out != nil || reason != "" {
			t.Fatalf("sanitizeContext(%q) = (%q, %q); want (nil, \"\")", in, out, reason)
		}
	}
}

// The 256 KB bound: one chatty tab must not write a megabyte into a row.
// The report survives — only the context is dropped, with a reason for the log.
func TestSanitizeContextRejectsOversize(t *testing.T) {
	big := fmt.Sprintf(`{"console":[{"level":"log","text":%q}]}`,
		strings.Repeat("x", maxContextBytes))
	out, reason := sanitizeContext([]byte(big))
	if out != nil || reason == "" {
		t.Fatalf("a %d-byte context must be dropped with a reason; got (%d bytes, %q)",
			len(big), len(out), reason)
	}
}

// Under the byte cap but over the entry caps: the server clamps to the ring
// sizes authoritatively, and keeps the TAIL — the newest entries are the ones
// nearest the bug; page-load noise is what gets dropped.
func TestSanitizeContextClampsToRingSizesKeepingTheTail(t *testing.T) {
	var sb strings.Builder
	sb.WriteString(`{"console":[`)
	for i := 0; i < maxConsoleEntries+50; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		fmt.Fprintf(&sb, `{"level":"log","text":"line %d"}`, i)
	}
	sb.WriteString(`]}`)

	out, reason := sanitizeContext([]byte(sb.String()))
	if reason != "" {
		t.Fatalf("dropped instead of clamped: %s", reason)
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatal(err)
	}
	if len(c.Console) != maxConsoleEntries {
		t.Fatalf("kept %d console entries, want %d", len(c.Console), maxConsoleEntries)
	}
	if c.Console[len(c.Console)-1].Text != fmt.Sprintf("line %d", maxConsoleEntries+49) {
		t.Fatalf("the tail was not kept — last entry is %q", c.Console[len(c.Console)-1].Text)
	}
}

// The typed round trip is the body/header filter: fields outside the schema —
// a smuggled response body, a headers map with an Authorization value — do not
// survive re-marshalling, whatever the client sent.
func TestSanitizeContextStripsUnknownFields(t *testing.T) {
	in := []byte(`{"network":[{"method":"POST","url":"/login","status":200,"durationMs":10,
		"body":"user=a&pass=hunter2","headers":{"Authorization":"Bearer secret"}}]}`)
	out, reason := sanitizeContext(in)
	if reason != "" {
		t.Fatalf("dropped: %s", reason)
	}
	for _, leaked := range []string{"hunter2", "Bearer", "Authorization", "body", "headers"} {
		if strings.Contains(string(out), leaked) {
			t.Fatalf("%q survived sanitization: %s", leaked, out)
		}
	}
}

// Junk levels normalize to "log" rather than being trusted into the UI, and a
// nonsense status is zeroed rather than rendered as an HTTP code that never was.
func TestSanitizeContextNormalizesHostileValues(t *testing.T) {
	in := []byte(`{
		"console": [{"level":"<img onerror=x>","text":"hi","ts":-5}],
		"network": [{"method":"GET","url":"/a","status":98765,"durationMs":-3}]
	}`)
	out, reason := sanitizeContext(in)
	if reason != "" {
		t.Fatalf("dropped: %s", reason)
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatal(err)
	}
	if c.Console[0].Level != "log" || c.Console[0].TS != 0 {
		t.Fatalf("console not normalized: %+v", c.Console[0])
	}
	if c.Network[0].Status != 0 || c.Network[0].DurationMs != 0 {
		t.Fatalf("network not normalized: %+v", c.Network[0])
	}
}

// Not JSON at all: dropped with a reason, never an error that fails the report.
func TestSanitizeContextDropsMalformedJSON(t *testing.T) {
	out, reason := sanitizeContext([]byte(`{"console": [`))
	if out != nil || reason == "" {
		t.Fatalf("malformed JSON must drop with a reason; got (%q, %q)", out, reason)
	}
}

// The app stamp survives on its own.
//
// A shell hosting several products can file a report from an app whose SDK
// never loaded, or from a reporter who opted out of the console and network
// capture. Either way the payload is nothing but the app — and that row must
// still be stored, because "which of the three surfaces was this?" is the one
// question a multi-app board cannot answer without it.
func TestSanitizeContextKeepsAnAppOnlySnapshot(t *testing.T) {
	in := []byte(`{"app":{"id":"auth","name":"auth","origin":"https://auth.app.co"}}`)
	out, reason := sanitizeContext(in)
	if reason != "" {
		t.Fatalf("dropped an app-only context: %s", reason)
	}
	if out == nil {
		t.Fatal("an app-only context stored NULL — the report would not say which app it came from")
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatal(err)
	}
	if c.App == nil || c.App.ID != "auth" || c.App.Origin != "https://auth.app.co" {
		t.Fatalf("app mangled: %+v", c.App)
	}
}

// An app object naming nothing is not an app. Dropped, so the issue page's
// "do we know where this came from" stays one nil check.
func TestSanitizeContextDropsANamelessApp(t *testing.T) {
	out, reason := sanitizeContext([]byte(`{"app":{"origin":"https://x.co"}}`))
	if out != nil || reason != "" {
		t.Fatalf("a nameless app must vanish; got (%q, %q)", out, reason)
	}
}

// The app fields are bounded like every other string on this payload — the
// ingress is public and a name is a claim, not a fact.
func TestSanitizeContextBoundsTheAppFields(t *testing.T) {
	in := fmt.Sprintf(`{"app":{"id":%q,"name":%q,"origin":%q}}`,
		strings.Repeat("i", maxAppID*2),
		strings.Repeat("n", maxAppName*2),
		strings.Repeat("o", maxAppOrigin*2))
	out, reason := sanitizeContext([]byte(in))
	if reason != "" {
		t.Fatalf("dropped instead of bounded: %s", reason)
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatal(err)
	}
	if len(c.App.ID) > maxAppID || len(c.App.Name) > maxAppName || len(c.App.Origin) > maxAppOrigin {
		t.Fatalf("app fields not bounded: %+v", c.App)
	}
}

// Multi-byte text at the truncation boundary must stay valid UTF-8 — the same
// bug truncate() exists for, at the console-line ceiling this time.
func TestSanitizeContextTruncatesLongLinesOnRuneBoundaries(t *testing.T) {
	line := strings.Repeat("م", maxConsoleText) // 2 bytes each — always over the cap
	in := fmt.Sprintf(`{"console":[{"level":"log","text":%q}]}`, line)
	out, reason := sanitizeContext([]byte(in))
	if reason != "" {
		t.Fatalf("dropped: %s", reason)
	}
	var c browserContext
	if err := json.Unmarshal(out, &c); err != nil {
		t.Fatalf("truncation broke the JSON (an invalid rune would): %v", err)
	}
	if n := len(c.Console[0].Text); n > maxConsoleText {
		t.Fatalf("line is %d bytes, cap is %d", n, maxConsoleText)
	}
}
