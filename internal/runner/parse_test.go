package runner

import "testing"

// The real warning Claude Code emits. Note it contains `projects["…"]` — a
// bracket INSIDE the prose, which defeats a naive "find the first [" scan.
const realWarning = `Ignoring 65 permissions.allow entries from .claude/settings.json: this workspace has not been trusted. Run Claude Code interactively here once and accept the trust dialog, or set projects["/Users/fadymondy/Sites/togo/builder-dev"].hasTrustDialogAccepted: true in /Users/fadymondy/.claude.json.
[{"type":"system","subtype":"init"},{"type":"result","subtype":"success","is_error":false,"result":"ready","duration_ms":3284,"total_cost_usd":0.232}]`

func TestParseClaudeResultSkipsWarningContainingBracket(t *testing.T) {
	res, err := parseClaudeResult(realWarning)
	if err != nil {
		t.Fatalf("failed to parse past the warning: %v", err)
	}
	if res.Result != "ready" {
		t.Fatalf("result = %q, want \"ready\"", res.Result)
	}
	if res.TotalCostUSD == 0 {
		t.Fatal("cost was not parsed")
	}
}

func TestParseClaudeResultPlainArray(t *testing.T) {
	raw := `[{"type":"result","is_error":false,"result":"ok"}]`
	res, err := parseClaudeResult(raw)
	if err != nil {
		t.Fatal(err)
	}
	if res.Result != "ok" {
		t.Fatalf("result = %q", res.Result)
	}
}

func TestParseClaudeResultBareObject(t *testing.T) {
	raw := `{"type":"result","is_error":true,"result":"boom"}`
	res, err := parseClaudeResult(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Fatal("is_error not parsed")
	}
}

// The CLI writes notices AFTER the payload as well as before it — a usage or
// credit line, for instance. json.Unmarshal rejects the entire response for
// those trailing bytes ("invalid character 'C' after top-level value") even
// though the payload it needs is complete and correct.
//
// Observed in the wild: one smart-connect plan succeeded and the next failed on
// exactly this, which reads as an intermittent model outage rather than an
// output-format detail.
func TestParseIgnoresTrailingCLINotices(t *testing.T) {
	const out = `{"type":"result","subtype":"success","result":"hello","is_error":false}
Credit balance is low. Visit the billing page to top up.`

	res, err := parseClaudeResult(out)
	if err != nil {
		t.Fatalf("a complete payload followed by a notice must still parse: %v", err)
	}
	if res.Result != "hello" {
		t.Errorf("Result = %q, want %q", res.Result, "hello")
	}
}

// The same, for the array form.
func TestParseIgnoresTrailingNoticesAfterAnEventArray(t *testing.T) {
	const out = `[{"type":"result","subtype":"success","result":"ok","is_error":false}]
Some trailing chatter.`

	res, err := parseClaudeResult(out)
	if err != nil {
		t.Fatalf("event array with trailing output must parse: %v", err)
	}
	if res.Result != "ok" {
		t.Errorf("Result = %q, want %q", res.Result, "ok")
	}
}
