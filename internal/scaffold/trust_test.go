package scaffold

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The scaffolder edits the user's real ~/.claude.json. It must amend, never
// replace — that file holds settings for every other project on the machine.
func TestTrustWorkspacePreservesOtherSettings(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	existing := map[string]any{
		"theme":      "dark",
		"someOption": 42,
		"projects": map[string]any{
			"/someone/elses/project": map[string]any{
				"hasTrustDialogAccepted": true,
				"customField":            "keep me",
			},
		},
	}
	b, _ := json.MarshalIndent(existing, "", "  ")
	path := filepath.Join(home, ".claude.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := trustWorkspace("/my/new/project"); err != nil {
		t.Fatal(err)
	}

	var got map[string]any
	raw, _ := os.ReadFile(path)
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}

	if got["theme"] != "dark" {
		t.Fatal("top-level setting was lost")
	}
	if got["someOption"].(float64) != 42 {
		t.Fatal("top-level option was lost")
	}

	projects := got["projects"].(map[string]any)
	other := projects["/someone/elses/project"].(map[string]any)
	if other["customField"] != "keep me" {
		t.Fatal("another project's settings were clobbered")
	}
	mine := projects["/my/new/project"].(map[string]any)
	if mine["hasTrustDialogAccepted"] != true {
		t.Fatal("the new project was not trusted")
	}

	// Permissions must stay tight — this file can hold credentials.
	fi, _ := os.Stat(path)
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", fi.Mode().Perm())
	}
}

// A config we cannot parse must be left alone, not overwritten.
func TestTrustWorkspaceRefusesToClobberBadJSON(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	path := filepath.Join(home, ".claude.json")
	os.WriteFile(path, []byte("{not json"), 0o600)

	if err := trustWorkspace("/x"); err == nil {
		t.Fatal("expected an error rather than overwriting an unparsable config")
	}
	b, _ := os.ReadFile(path)
	if string(b) != "{not json" {
		t.Fatal("an unparsable config was overwritten")
	}
}
