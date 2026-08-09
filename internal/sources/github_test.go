package sources

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// baseCfg is a source pointed at the fake, with issues off.
func baseCfg(api string) map[string]any {
	return map[string]any{
		"owner":   "acme",
		"repo":    "widget",
		"branch":  "main",
		"apiBase": api,
	}
}

// The small win from the issue, asserted end to end: point it at a repo, and the
// README is in the brain.
func TestFirstRunRetainsTheReadme(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget\n\nWidget renders invoices for the billing service."
	gh.files["docs/adr/0001-postgres.md"] = "# ADR 1: Postgres\n\nWe chose Postgres."
	gh.files["internal/main.go"] = "package main // not a doc"
	gh.commits = []string{"feat: invoices\n\nbody", "fix: rounding"}
	api := gh.start(t)

	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(),
		newSource(t, baseCfg(api), nil), NewMemCursors(), brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	readme, ok := brain.byRef(":README.md")
	if !ok {
		t.Fatalf("the README was not retained; got %d memories", len(brain.retained))
	}
	if !strings.Contains(readme.content, "renders invoices") {
		t.Errorf("README content did not survive: %q", readme.content)
	}
	if readme.ns != "default:project" {
		t.Errorf("retained into %q, want default:project", readme.ns)
	}
	if readme.kind != KindGitHub {
		t.Errorf("source kind %q, want %q", readme.kind, KindGitHub)
	}
	if readme.importance <= 0.6 {
		t.Errorf("the README should outrank ordinary docs, got importance %v", readme.importance)
	}
	if _, ok := brain.byRef(":docs/adr/0001-postgres.md"); !ok {
		t.Error("the ADR under docs/ was not retained")
	}
	// The include globs are an allowlist, not a suggestion.
	if _, ok := brain.byRef(":internal/main.go"); ok {
		t.Error("a source file outside the include globs was retained")
	}
	if rep.Retained != 3 { // README, ADR, commits
		t.Errorf("retained %d, want 3 (README, ADR, commits)", rep.Retained)
	}
}

// Checklist item 3: incremental by commit SHA cursor — a re-run does almost
// nothing.
func TestRerunWithAnUnchangedHeadDoesAlmostNothing(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"feat: one"}
	api := gh.start(t)

	cur := NewMemCursors()
	src := newSource(t, baseCfg(api), nil)
	brain := &fakeBrain{}

	if _, err := Refresh(context.Background(), src, cur, brain, "default:project"); err != nil {
		t.Fatalf("first Refresh: %v", err)
	}
	first := len(brain.retained)
	if first == 0 {
		t.Fatal("the first run retained nothing")
	}
	before := gh.hits("/contents/")

	rep, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("second Refresh: %v", err)
	}

	if !rep.Unchanged {
		t.Error("an unchanged HEAD should report Unchanged")
	}
	if rep.Retained != 0 {
		t.Errorf("a re-run retained %d memories, want 0", rep.Retained)
	}
	if len(brain.retained) != first {
		t.Errorf("the brain grew from %d to %d on an unchanged re-run", first, len(brain.retained))
	}
	if got := gh.hits("/contents/"); got != before {
		t.Errorf("a re-run read %d files, want 0", got-before)
	}
	// It should not even list the tree.
	if gh.hits("/git/trees/") != 1 {
		t.Errorf("the tree was listed %d times, want once", gh.hits("/git/trees/"))
	}
}

// A moved HEAD reads only what changed, and the commit doc keeps a stable ref so
// it updates in place rather than accumulating.
func TestSecondRunReadsOnlyWhatChanged(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.files["docs/guide.md"] = "old guide"
	gh.commits = []string{"feat: one"}
	api := gh.start(t)

	cur := NewMemCursors()
	src := newSource(t, baseCfg(api), nil)
	brain := &fakeBrain{}
	if _, err := Refresh(context.Background(), src, cur, brain, "default:project"); err != nil {
		t.Fatalf("first Refresh: %v", err)
	}
	firstCount := len(brain.retained)

	// A commit lands, touching one of the two documents.
	gh.head = "bbb222"
	gh.files["docs/guide.md"] = "new guide"
	gh.compare["aaa111...bbb222"] = compareResult{
		files:   []map[string]string{{"filename": "docs/guide.md", "status": "modified"}},
		commits: []string{"docs: rewrite the guide"},
	}
	before := gh.hits("/contents/")

	rep, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("second Refresh: %v", err)
	}

	if got := gh.hits("/contents/") - before; got != 1 {
		t.Errorf("read %d files, want only the changed one", got)
	}
	if rep.Retained != 2 { // the changed file plus the commit doc
		t.Errorf("retained %d, want 2 (the changed file and the commit subjects)", rep.Retained)
	}
	// Both writes to the guide use the same source_ref, which is what makes the
	// brain's unique index upsert rather than duplicate.
	refs := map[string]int{}
	for _, r := range brain.retained {
		refs[r.ref]++
	}
	if refs[MemoryRef(KindGitHub, "acme/widget", "docs/guide.md")] != 2 {
		t.Errorf("the guide should have been written twice under ONE ref, got %v", refs)
	}
	if refs[MemoryRef(KindGitHub, "acme/widget", "commits")] != 2 {
		t.Errorf("the commit doc should be one stable ref, got %v", refs)
	}
	if len(brain.retained) != firstCount+2 {
		t.Errorf("unexpected extra writes: %d then %d", firstCount, len(brain.retained))
	}
}

// A deleted document is reported so the caller can invalidate it, rather than
// leaving a memory of a file that no longer exists.
func TestDeletedAndRenamedFilesAreReported(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["docs/old.md"] = "old"
	gh.commits = []string{"init"}
	api := gh.start(t)

	cur := NewMemCursors()
	src := newSource(t, baseCfg(api), nil)
	if _, err := Refresh(context.Background(), src, cur, &fakeBrain{}, "default:project"); err != nil {
		t.Fatalf("first Refresh: %v", err)
	}

	gh.head = "bbb222"
	delete(gh.files, "docs/old.md")
	gh.files["docs/new.md"] = "new"
	gh.compare["aaa111...bbb222"] = compareResult{
		files: []map[string]string{
			{"filename": "docs/new.md", "status": "renamed", "previous_filename": "docs/old.md"},
		},
		commits: []string{"docs: rename"},
	}

	prev, _ := cur.Cursor(context.Background(), KindGitHub, "acme/widget")
	batch, err := src.Fetch(context.Background(), prev)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(batch.Removed) != 1 || batch.Removed[0] != "docs/old.md" {
		t.Errorf("Removed = %v, want [docs/old.md]", batch.Removed)
	}
}

// A rewritten history makes the old cursor unreachable. That must not wedge the
// source forever.
func TestUnreachableCursorFallsBackToAFullRead(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"init"}
	api := gh.start(t)

	cur := NewMemCursors()
	src := newSource(t, baseCfg(api), nil)
	if _, err := Refresh(context.Background(), src, cur, &fakeBrain{}, "default:project"); err != nil {
		t.Fatalf("first Refresh: %v", err)
	}

	gh.head = "ccc333" // force-pushed; no comparison exists against aaa111
	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(), src, cur, brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh after a force-push: %v", err)
	}
	if _, ok := brain.byRef(":README.md"); !ok {
		t.Error("the fallback full read did not re-read the README")
	}
	if rep.Skipped == 0 {
		t.Error("the unreachable cursor should be reported as a skip")
	}
}

// Checklist item 4: respects the file-size cap and skips binaries.
func TestSizeCapAndBinariesAreSkipped(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.files["docs/huge.md"] = strings.Repeat("x", 100)
	gh.sizes["docs/huge.md"] = 5000 // over the cap, per the tree listing
	gh.files["docs/diagram.png"] = "\x89PNG\x00\x00binary"
	gh.files["docs/sneaky.md"] = "text\x00with a NUL byte" // lies about being text
	gh.commits = []string{"init"}
	api := gh.start(t)

	cfg := baseCfg(api)
	cfg["maxFileBytes"] = 1000

	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(), newSource(t, cfg, nil), NewMemCursors(), brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	for _, unwanted := range []string{":docs/huge.md", ":docs/diagram.png", ":docs/sneaky.md"} {
		if _, ok := brain.byRef(unwanted); ok {
			t.Errorf("%s should not have been retained", unwanted)
		}
	}
	if _, ok := brain.byRef(":README.md"); !ok {
		t.Error("the README should still have been retained")
	}
	if rep.Skipped != 3 {
		t.Errorf("Skipped = %d, want 3 (oversize, binary extension, binary content)", rep.Skipped)
	}
	// The oversize file is skipped from the LISTING, so it is never downloaded.
	if gh.hits("/contents/docs/huge.md") != 0 {
		t.Error("an oversized file was downloaded before being skipped")
	}
	// A binary extension is likewise never downloaded.
	if gh.hits("/contents/docs/diagram.png") != 0 {
		t.Error("a binary was downloaded before being skipped")
	}
}

// Checklist item 2: uses the vault's GitHub token, by name.
func TestTokenComesFromTheVaultByName(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"init"}
	api := gh.start(t)

	vault := &fakeVault{values: map[string]string{"github-token": "ghp_" + strings.Repeat("a", 36)}}
	cfg := baseCfg(api)
	cfg["tokenRef"] = "github-token"

	if _, err := Refresh(context.Background(), newSource(t, cfg, vault), NewMemCursors(), &fakeBrain{}, "default:project"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	if len(vault.asked) == 0 || vault.asked[0] != "github-token" {
		t.Fatalf("the vault was asked for %v, want [github-token]", vault.asked)
	}
	if len(vault.asked) != 1 {
		t.Errorf("the vault was asked %d times for one refresh, want once", len(vault.asked))
	}
	for i, got := range gh.authSeen {
		if !strings.HasPrefix(got, "Bearer ghp_") {
			t.Fatalf("request %d carried Authorization %q", i, got)
		}
	}
}

// Checklist item 2, the other half: never a token pasted into the config.
func TestAConfigCarryingACredentialIsRejected(t *testing.T) {
	cases := map[string]map[string]any{
		"a token field": {
			"owner": "acme", "repo": "widget",
			"token": "ghp_" + strings.Repeat("a", 36),
		},
		"a password field": {
			"owner": "acme", "repo": "widget",
			"password": "hunter2",
		},
		"a value in tokenRef": {
			"owner": "acme", "repo": "widget",
			"tokenRef": "ghp_" + strings.Repeat("a", 36),
		},
		"an opaque value in tokenRef": {
			"owner": "acme", "repo": "widget",
			"tokenRef": strings.Repeat("A1b2C3d4", 6),
		},
	}
	for name, cfg := range cases {
		t.Run(name, func(t *testing.T) {
			raw, _ := json.Marshal(cfg)
			if _, err := Open(KindGitHub, raw, nil); err == nil {
				t.Fatal("the config was accepted; a credential in a config must be refused")
			}
		})
	}

	// A NAME is still fine, and so is an empty leftover field.
	ok := map[string]any{"owner": "acme", "repo": "widget", "tokenRef": "github-token", "token": ""}
	raw, _ := json.Marshal(ok)
	if _, err := Open(KindGitHub, raw, nil); err != nil {
		t.Fatalf("a legitimate config was rejected: %v", err)
	}
}

// A failing reveal must say WHICH secret, never anything about its value.
func TestARevealFailureNamesTheSecretAndNotItsValue(t *testing.T) {
	gh := newFakeGitHub()
	api := gh.start(t)
	cfg := baseCfg(api)
	cfg["tokenRef"] = "github-token"

	src := newSource(t, cfg, &fakeVault{values: map[string]string{}})
	_, err := src.Fetch(context.Background(), "")
	if err == nil {
		t.Fatal("a missing secret should fail the fetch")
	}
	if !strings.Contains(err.Error(), "github-token") {
		t.Errorf("the error should name the secret: %v", err)
	}
	if gh.hits("/repos/") != 0 {
		t.Error("the connector called GitHub despite having no credential")
	}
}

// A credential checked into a README must not become a memory an agent can
// quote back (Rule 34).
func TestACredentialInAFileIsRedactedBeforeItIsRetained(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "Set GITHUB_TOKEN=ghp_" + strings.Repeat("z", 36) + " before running.\nSee docs/ for more."
	gh.commits = []string{"init"}
	api := gh.start(t)

	brain := &fakeBrain{}
	if _, err := Refresh(context.Background(), newSource(t, baseCfg(api), nil), NewMemCursors(), brain, "default:project"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	readme, ok := brain.byRef(":README.md")
	if !ok {
		t.Fatal("no README was retained")
	}
	if strings.Contains(readme.content, "ghp_"+strings.Repeat("z", 36)) {
		t.Fatalf("a token survived into the brain: %q", readme.content)
	}
	if !strings.Contains(readme.content, "See docs/ for more") {
		t.Errorf("redaction ate the surrounding prose: %q", readme.content)
	}
}

// Issues and pull requests, when the config asks for them, and only then.
func TestIssuesAreReadOnlyWhenConfigured(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"init"}
	gh.issues = []map[string]any{
		{"number": 7, "title": "Rounding is wrong", "state": "open", "body": "cents", "updated_at": "2026-01-02T03:04:05Z"},
		{"number": 8, "title": "Fix rounding", "state": "closed", "body": "patch",
			"updated_at": "2026-01-03T03:04:05Z", "pull_request": map[string]any{"url": "x"}},
	}
	api := gh.start(t)

	// Off by default.
	if _, err := Refresh(context.Background(), newSource(t, baseCfg(api), nil), NewMemCursors(), &fakeBrain{}, "default:project"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if gh.hits("/issues") != 0 {
		t.Error("issues were read without being asked for")
	}

	cfg := baseCfg(api)
	cfg["readIssues"] = true
	brain := &fakeBrain{}
	cur := NewMemCursors()
	if _, err := Refresh(context.Background(), newSource(t, cfg, nil), cur, brain, "default:project"); err != nil {
		t.Fatalf("Refresh with issues: %v", err)
	}
	issue, ok := brain.byRef(":issue:7")
	if !ok {
		t.Fatal("issue 7 was not retained")
	}
	if !strings.Contains(issue.content, "Rounding is wrong") {
		t.Errorf("issue title missing: %q", issue.content)
	}
	pr, ok := brain.byRef(":pull-request:8")
	if !ok {
		t.Fatal("pull request 8 was not retained")
	}
	if !strings.Contains(pr.content, "pull request #8") {
		t.Errorf("a pull request should be labelled as one: %q", pr.content)
	}

	// The watermark comes from the data, so the next run asks only for what has
	// moved since the newest issue it saw.
	raw, _ := cur.Cursor(context.Background(), KindGitHub, "acme/widget")
	var c ghCursor
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		t.Fatalf("cursor is not the documented shape: %q", raw)
	}
	if c.SHA != "aaa111" {
		t.Errorf("cursor SHA = %q, want aaa111", c.SHA)
	}
	if c.IssuesSince != "2026-01-03T03:04:05Z" {
		t.Errorf("issue watermark = %q, want the newest updated_at", c.IssuesSince)
	}
}

// An empty branch config resolves the repository's default branch rather than
// guessing "main", which is wrong for every repository older than 2020.
func TestAnEmptyBranchResolvesTheDefault(t *testing.T) {
	gh := newFakeGitHub()
	gh.branch = "trunk"
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"init"}
	api := gh.start(t)

	cfg := baseCfg(api)
	delete(cfg, "branch")
	brain := &fakeBrain{}
	if _, err := Refresh(context.Background(), newSource(t, cfg, nil), NewMemCursors(), brain, "default:project"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if _, ok := brain.byRef(":README.md"); !ok {
		t.Error("nothing was read from the default branch")
	}
}

// An owner or repo that walks out of the path is refused at parse time.
func TestPathTraversalInTheConfigIsRefused(t *testing.T) {
	for _, bad := range []map[string]any{
		{"owner": "../../orgs", "repo": "widget"},
		{"owner": "acme", "repo": "widget/../../users"},
		{"owner": "", "repo": "widget"},
		{"owner": "acme", "repo": ""},
	} {
		raw, _ := json.Marshal(bad)
		if _, err := Open(KindGitHub, raw, nil); err == nil {
			t.Errorf("%v was accepted", bad)
		}
	}
}

// One unreadable file must not cost the other forty.
func TestOneUnreadableFileDoesNotFailTheRefresh(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	// Listed in the tree, gone by the time it is read.
	gh.ghosts["docs/ghost.md"] = 10
	gh.commits = []string{"init"}
	api := gh.start(t)

	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(), newSource(t, baseCfg(api), nil), NewMemCursors(), brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if _, ok := brain.byRef(":README.md"); !ok {
		t.Error("the readable file was lost along with the unreadable one")
	}
	if rep.Skipped != 1 {
		t.Errorf("Skipped = %d, want 1 (the unreadable file)", rep.Skipped)
	}
}

// The cursor is advanced only after the writes land, so a failed retain is
// retried rather than skipped forever.
func TestAFailedRetainDoesNotAdvanceTheCursor(t *testing.T) {
	gh := newFakeGitHub()
	gh.files["README.md"] = "# widget"
	gh.commits = []string{"init"}
	api := gh.start(t)

	cur := NewMemCursors()
	brain := &fakeBrain{err: errNope}
	if _, err := Refresh(context.Background(), newSource(t, baseCfg(api), nil), cur, brain, "default:project"); err == nil {
		t.Fatal("a failing retain should fail the refresh")
	}
	got, _ := cur.Cursor(context.Background(), KindGitHub, "acme/widget")
	if got != "" {
		t.Errorf("the cursor advanced to %q despite the write failing", got)
	}
}

var errNope = &httpError{status: 500, msg: "the brain is down"}
