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
