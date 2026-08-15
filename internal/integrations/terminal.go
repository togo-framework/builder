package integrations

import "encoding/json"

// The developer tools, connected by signing in through their own CLI.
//
// These are the reason `AuthTerminal` exists as a distinct auth style rather
// than a variation on token entry. Three properties set them apart:
//
//  1. WE STORE NOTHING. `gh auth login` writes gh's own config; `claude login`
//     writes Claude Code's; `gcloud auth login` writes gcloud's. There is no
//     secret of ours to put in a vault, which is why these are the only
//     credentialed integrations not blocked by SF-001.
//
//  2. THE LOGIN IS A CONVERSATION. Each one asks something — paste this device
//     code, approve in the browser, pick a project. A form cannot answer those.
//     A terminal the operator can type into can, and the builder already has
//     one (internal/term), so connecting is: make a session, run their command,
//     attach.
//
//  3. STATUS IS A COMMAND, NOT A GUESS. Every one ships a non-interactive
//     status check, so "connected?" is answered by asking the tool rather than
//     by remembering what we did last time. A remembered answer goes stale the
//     first time a token expires somewhere else.

func init() {
	Register(Integration{
		Slug:     "claude-code",
		Title:    Text{EN: "Claude Code", AR: "Claude Code"},
		Summary:  Text{EN: "The CLI that runs the agents. Sign in once and every run uses it.", AR: "واجهة الأوامر التي تشغّل الوكلاء. سجّل الدخول مرة ويستخدمها كل تشغيل."},
		Category: CatTerminal,
		Auth:     AuthTerminal,
		Icon:     "Sparkle",
		Color:    "#d97757",
		DocsURL:  "https://docs.claude.com/en/docs/claude-code/overview",
		Terminal: &Terminal{
			Bin:     "claude",
			Install: Text{EN: "npm install -g @anthropic-ai/claude-code", AR: "npm install -g @anthropic-ai/claude-code"},
			Login:   []string{"claude", "auth", "login"},
			// `claude auth status`, NOT a prompt.
			//
			// This was `claude -p "say ok"` — which does answer, but by calling
			// the MODEL: it took longer than the 8s status budget (so every
			// probe reported "unknown — timed out") and it billed a token for
			// the privilege. A status check that costs money is one nobody can
			// afford to run when a screen opens.
			//
			// `auth status` is local, immediate, and prints JSON carrying the
			// account — which is what the badge wants to show anyway.
			Status:  []string{"claude", "auth", "status"},
			Version: []string{"claude", "--version"},
			Logout:  []string{"claude", "auth", "logout"},
		},
		Inputs: json.RawMessage(`{
  "type":"object","additionalProperties":false,
  "properties":{
    "model":{"type":"string","enum":["haiku","sonnet","opus"],"default":"sonnet",
             "title":"Default model","description":"Used by runs that do not ask for a specific one."}
  }}`),
	})

	Register(Integration{
		Slug:     "gh",
		Title:    Text{EN: "GitHub CLI", AR: "واجهة GitHub"},
		Summary:  Text{EN: "Repository access for issues, pull requests and releases.", AR: "الوصول للمستودعات: المشكلات وطلبات الدمج والإصدارات."},
		Category: CatTerminal,
		Auth:     AuthTerminal,
		Icon:     "Github",
		Color:    "#334155",
		DocsURL:  "https://cli.github.com/manual/gh_auth_login",
		Terminal: &Terminal{
			Bin:     "gh",
			Install: Text{EN: "brew install gh", AR: "brew install gh"},
			Login:   []string{"gh", "auth", "login"},
			Status:  []string{"gh", "auth", "status"},
			Version: []string{"gh", "--version"},
			Logout:  []string{"gh", "auth", "logout"},
		},
		Inputs: json.RawMessage(`{
  "type":"object","additionalProperties":false,
  "properties":{
    "defaultRepo":{"type":"string","pattern":"^[^/]+/[^/]+$",
                   "title":"Default repository","description":"owner/name. Used when a command does not name one."}
  }}`),
	})

	Register(Integration{
		Slug:     "gcloud",
		Title:    Text{EN: "Google Cloud", AR: "جوجل كلاود"},
		Summary:  Text{EN: "Project, storage and deployment access through the gcloud CLI.", AR: "الوصول للمشاريع والتخزين والنشر عبر gcloud."},
		Category: CatTerminal,
		Auth:     AuthTerminal,
		Icon:     "Cloud",
		Color:    "#4285f4",
		DocsURL:  "https://cloud.google.com/sdk/docs/install",
		Terminal: &Terminal{
			Bin:     "gcloud",
			Install: Text{EN: "brew install --cask google-cloud-sdk", AR: "brew install --cask google-cloud-sdk"},
			Login:   []string{"gcloud", "auth", "login"},
			// --filter + --format keeps the output to one line and makes the
			// "no accounts" case an empty result rather than a table header,
			// which is what lets the parser answer honestly.
			Status:  []string{"gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)"},
			Version: []string{"gcloud", "--version"},
			Logout:  []string{"gcloud", "auth", "revoke", "--all"},
		},
		Inputs: json.RawMessage(`{
  "type":"object","additionalProperties":false,
  "properties":{
    "project":{"type":"string","title":"Default project id"},
    "region":{"type":"string","title":"Default region","default":"us-central1"}
  }}`),
	})
}
