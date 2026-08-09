package sources

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// KindGitHub is the registered kind for a GitHub repository source.
const KindGitHub = "github"

func init() { Register(KindGitHub, newGitHub) }

// Defaults. Each is overridable per source; each exists because the unbounded
// version of it is a way to fill the brain with noise or to hang a refresh.
const (
	// A README is prose. Past ~128KB it is a generated API dump, and embedding
	// one produces a vector that matches everything and means nothing.
	defaultMaxFileBytes = 128 << 10

	// The contents API refuses to return a file over 1MB anyway, so a config
	// asking for more is asking for an error.
	hardMaxFileBytes = 1 << 20

	// "Recent commit subjects", not "every commit since 2014".
	defaultMaxCommits = 50

	// The compare endpoint returns at most 250 commits and 300 files per page,
	// and this connector reads one page.
	maxCompareCommits = 250

	defaultMaxIssues = 50
	defaultAPIBase   = "https://api.github.com"
	defaultTimeout   = 30 * time.Second

	// Enough for a large tree listing; small enough that a wrong URL returning
	// a gigabyte does not become this process's problem.
	maxResponseBytes = 8 << 20
)

// defaultInclude is what someone means by "the docs".
//
// README first because it answers the question the issue actually asks — "what
// does this service do?" — and ADRs anywhere in the tree because every project
// puts them somewhere different.
var defaultInclude = []string{
	"README*",
	"docs/**",
	"**/adr/**",
	"**/decisions/**",
	"ARCHITECTURE*",
	"CONTRIBUTING*",
}

// GitHubConfig is one configured repository.
//
// There is deliberately no `token` field. The credential lives in the vault and
// this config carries its NAME; a config that carries a value is rejected at
// parse time rather than quietly working, because the version that quietly
// works is the one that gets committed to a repository (Rule 34).
type GitHubConfig struct {
	Owner  string `json:"owner"`
	Repo   string `json:"repo"`
	Branch string `json:"branch,omitempty"` // empty means the repo's default branch

	Include []string `json:"include,omitempty"`
	Exclude []string `json:"exclude,omitempty"`

	// ReadIssues pulls issue and pull-request titles as well as files.
	ReadIssues bool `json:"readIssues,omitempty"`

	// TokenRef is the NAME of a vault secret, never a token. Empty is legal and
	// means unauthenticated, which works for a public repository at a much
	// lower rate limit.
	TokenRef string `json:"tokenRef,omitempty"`

	MaxFileBytes int `json:"maxFileBytes,omitempty"`
	MaxCommits   int `json:"maxCommits,omitempty"`
	MaxIssues    int `json:"maxIssues,omitempty"`

	// APIBase supports GitHub Enterprise, and lets a test point the connector
	// at an httptest server.
	APIBase string `json:"apiBase,omitempty"`
}

// ownerRe also guards the URL path: an owner of "../../orgs" would otherwise
// walk out of the repository namespace and call a different endpoint entirely.
var ownerRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)

// credentialFields are config keys that must never appear. Rejecting the key is
// better than redacting the value: the operator finds out at configuration time,
// which is when they still have somewhere sensible to put it.
var credentialFields = []string{"token", "password", "secret", "apikey", "api_key", "accesstoken", "access_token", "pat", "authorization", "auth"}

type gitHubSource struct {
	cfg  GitHubConfig
	sec  Secrets
	http *http.Client
	name string
}

func newGitHub(raw json.RawMessage, sec Secrets) (Source, error) {
	// Decode twice. The typed decode gets the config; the loose decode catches a
	// credential parked under a field this struct does not have, which the typed
	// decode would silently discard.
	var loose map[string]json.RawMessage
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil, fmt.Errorf("github source config: %w", err)
	}
	for key, v := range loose {
		k := strings.ToLower(key)
		for _, bad := range credentialFields {
			if k != bad {
				continue
			}
			var s string
			if json.Unmarshal(v, &s) == nil && strings.TrimSpace(s) == "" {
				continue // an empty field is a leftover, not a leak
			}
			return nil, fmt.Errorf("github source config: %q must not hold a credential — store it in the vault and put its name in \"tokenRef\"", key)
		}
	}

	var cfg GitHubConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("github source config: %w", err)
	}
	if err := cfg.normalise(); err != nil {
		return nil, err
	}
	return &gitHubSource{
		cfg:  cfg,
		sec:  sec,
		http: &http.Client{Timeout: defaultTimeout},
		name: cfg.Owner + "/" + cfg.Repo,
	}, nil
}

func (c *GitHubConfig) normalise() error {
	c.Owner = strings.TrimSpace(c.Owner)
	c.Repo = strings.TrimSpace(strings.TrimSuffix(c.Repo, ".git"))
	c.Branch = strings.TrimSpace(c.Branch)
	c.TokenRef = strings.TrimSpace(c.TokenRef)

	if !ownerRe.MatchString(c.Owner) {
		return fmt.Errorf("github source config: %q is not a valid owner", c.Owner)
	}
	if !ownerRe.MatchString(c.Repo) {
		return fmt.Errorf("github source config: %q is not a valid repository", c.Repo)
	}
	if LooksLikeCredential(c.TokenRef) {
		return fmt.Errorf(`github source config: "tokenRef" holds what looks like a credential — it must be the NAME of a vault secret`)
	}
	if len(c.Include) == 0 {
		c.Include = append([]string(nil), defaultInclude...)
	}
	if c.MaxFileBytes <= 0 {
		c.MaxFileBytes = defaultMaxFileBytes
	}
	if c.MaxFileBytes > hardMaxFileBytes {
		c.MaxFileBytes = hardMaxFileBytes
	}
	if c.MaxCommits <= 0 {
		c.MaxCommits = defaultMaxCommits
	}
	if c.MaxCommits > maxCompareCommits {
		c.MaxCommits = maxCompareCommits
	}
	if c.MaxIssues <= 0 {
		c.MaxIssues = defaultMaxIssues
	}
	c.APIBase = strings.TrimSuffix(strings.TrimSpace(c.APIBase), "/")
	if c.APIBase == "" {
		c.APIBase = defaultAPIBase
	}
	return nil
}

func (g *gitHubSource) Kind() string { return KindGitHub }
func (g *gitHubSource) Name() string { return g.name }

// ghCursor is where this source got to.
//
// The commit SHA is the cursor the issue asks for and does all the work: an
// unchanged HEAD means a refresh reads one endpoint and stops. IssuesSince
// exists only because issues move without a commit, and it is carried alongside
// rather than replacing the SHA.
type ghCursor struct {
	SHA         string `json:"sha,omitempty"`
	IssuesSince string `json:"issuesSince,omitempty"`
}

func parseCursor(s string) ghCursor {
	var c ghCursor
	s = strings.TrimSpace(s)
	if s == "" {
		return c
	}
	if strings.HasPrefix(s, "{") {
		_ = json.Unmarshal([]byte(s), &c)
		return c
	}
	// A bare SHA, from a hand-set cursor or an older format.
	c.SHA = s
	return c
}

func (c ghCursor) String() string {
	b, err := json.Marshal(c)
	if err != nil {
		return ""
	}
	return string(b)
}

// Fetch reads the repository, incrementally when it can.
func (g *gitHubSource) Fetch(ctx context.Context, cursor string) (Batch, error) {
	prev := parseCursor(cursor)

	token, err := g.token(ctx)
	if err != nil {
		return Batch{}, err
	}

	branch := g.cfg.Branch
	if branch == "" {
		var repo struct {
			DefaultBranch string `json:"default_branch"`
		}
		if err := g.get(ctx, token, g.path(""), nil, &repo); err != nil {
			return Batch{}, err
		}
		branch = repo.DefaultBranch
		if branch == "" {
			return Batch{}, fmt.Errorf("%s has no default branch", g.name)
		}
	}

	var br struct {
		Commit struct {
			SHA string `json:"sha"`
		} `json:"commit"`
	}
	if err := g.get(ctx, token, g.path("/branches/"+url.PathEscape(branch)), nil, &br); err != nil {
		return Batch{}, err
	}
	head := br.Commit.SHA
	if head == "" {
		return Batch{}, fmt.Errorf("%s has no commit on %s", g.name, branch)
	}

	next := ghCursor{SHA: head, IssuesSince: prev.IssuesSince}
	batch := Batch{}

	// The whole point of the cursor. Nothing has landed on the branch, so there
	// is nothing to read and nothing to write — one request and done.
	filesUnchanged := head == prev.SHA
	if !filesUnchanged {
		if prev.SHA == "" {
			if err := g.fetchFull(ctx, token, head, &batch); err != nil {
				return Batch{}, err
			}
		} else if err := g.fetchSince(ctx, token, prev.SHA, head, &batch); err != nil {
			return Batch{}, err
		}
	}

	if g.cfg.ReadIssues {
		since, err := g.fetchIssues(ctx, token, prev.IssuesSince, &batch)
		if err != nil {
			return Batch{}, err
		}
		if since != "" {
			next.IssuesSince = since
		}
	}

	batch.Cursor = next.String()
	batch.Unchanged = len(batch.Docs) == 0 && len(batch.Removed) == 0
	return batch, nil
}

// token reveals the configured secret. The value is returned to exactly one
// caller, is held in a local for the length of one Fetch, and reaches exactly
// one destination: an Authorization header.
func (g *gitHubSource) token(ctx context.Context) (string, error) {
	if g.cfg.TokenRef == "" {
		return "", nil
	}
	if g.sec == nil {
		return "", fmt.Errorf("source %s needs vault secret %q but no vault is wired in", g.name, g.cfg.TokenRef)
	}
	tok, err := g.sec.Reveal(ctx, g.cfg.TokenRef)
	if err != nil {
		// Scrubbed and named by REF: the failure says which secret, never what.
		return "", fmt.Errorf("reveal %q for source %s: %s", g.cfg.TokenRef, g.name, Scrub(err.Error()))
	}
	if strings.TrimSpace(tok) == "" {
		return "", fmt.Errorf("vault secret %q is empty", g.cfg.TokenRef)
	}
	return tok, nil
}

// fetchFull is the first run: walk the tree once and take everything that
// matches.
func (g *gitHubSource) fetchFull(ctx context.Context, token, head string, batch *Batch) error {
	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			Size int    `json:"size"`
		} `json:"tree"`
		Truncated bool `json:"truncated"`
	}
	if err := g.get(ctx, token, g.path("/git/trees/"+url.PathEscape(head)),
		url.Values{"recursive": {"1"}}, &tree); err != nil {
		return err
	}
	if tree.Truncated {
		// Reported rather than swallowed: on a very large repository the listing
		// is incomplete, and an operator who thinks the docs are indexed when
		// half of them are not is worse off than one who knows.
		batch.Skipped = append(batch.Skipped, Skip{Ref: "tree", Reason: "the repository tree was truncated by the API; narrow the include globs"})
	}

	for _, e := range tree.Tree {
		if e.Type != "blob" || !g.wanted(e.Path) {
			continue
		}
		// The size cap is applied from the LISTING, so an oversized file is
		// never downloaded at all.
		if e.Size > g.cfg.MaxFileBytes {
			batch.Skipped = append(batch.Skipped, Skip{Ref: e.Path, Reason: fmt.Sprintf("%d bytes is over the %d byte cap", e.Size, g.cfg.MaxFileBytes)})
			continue
		}
		if binaryPath(e.Path) {
			batch.Skipped = append(batch.Skipped, Skip{Ref: e.Path, Reason: "binary"})
			continue
		}
		g.appendFile(ctx, token, head, e.Path, batch)
	}
	return g.appendCommits(ctx, token, head, batch)
}

// fetchSince is every subsequent run: ask what changed between the two commits
// and read only that.
func (g *gitHubSource) fetchSince(ctx context.Context, token, base, head string, batch *Batch) error {
	var cmp struct {
		Status string `json:"status"`
		Files  []struct {
			Filename string `json:"filename"`
			Status   string `json:"status"`
			Previous string `json:"previous_filename"`
		} `json:"files"`
		Commits []struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
			} `json:"commit"`
		} `json:"commits"`
	}
	err := g.get(ctx, token, g.path("/compare/"+url.PathEscape(base)+"..."+url.PathEscape(head)), nil, &cmp)
	if err != nil {
		// A force-push or a rewritten history makes the old cursor unreachable,
		// and comparing against it 404s forever. Fall back to a full read, which
		// upserts over what is already there rather than duplicating it.
		if isNotFound(err) {
			batch.Skipped = append(batch.Skipped, Skip{Ref: base, Reason: "the previous commit is no longer reachable; re-read the repository in full"})
			return g.fetchFull(ctx, token, head, batch)
		}
		return err
	}

	for _, f := range cmp.Files {
		name := f.Filename
		if f.Status == "removed" {
			if g.wanted(name) {
				batch.Removed = append(batch.Removed, name)
			}
			continue
		}
		if f.Status == "renamed" && f.Previous != "" && g.wanted(f.Previous) {
			batch.Removed = append(batch.Removed, f.Previous)
		}
		if !g.wanted(name) {
			continue
		}
		if binaryPath(name) {
			batch.Skipped = append(batch.Skipped, Skip{Ref: name, Reason: "binary"})
			continue
		}
		// No size in a compare response, so the cap is applied from the contents
		// response instead — before decoding, and before it becomes a memory.
		g.appendFile(ctx, token, head, name, batch)
	}

	subjects := make([]string, 0, len(cmp.Commits))
	for i := len(cmp.Commits) - 1; i >= 0; i-- { // newest first
		subjects = append(subjects, subject(cmp.Commits[i].Commit.Message))
	}
	if len(subjects) > 0 {
		g.appendCommitDoc(subjects, batch)
	}
	return nil
}

// appendFile reads one file and turns it into a doc.
//
// A failure on one file is recorded and skipped rather than failing the refresh:
// one unreadable file should not cost the other forty.
func (g *gitHubSource) appendFile(ctx context.Context, token, ref, p string, batch *Batch) {
	var c struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
		Size     int    `json:"size"`
	}
	if err := g.get(ctx, token, g.path("/contents/"+escapePath(p)), url.Values{"ref": {ref}}, &c); err != nil {
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: Scrub(err.Error())})
		return
	}
	if c.Size > g.cfg.MaxFileBytes {
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: fmt.Sprintf("%d bytes is over the %d byte cap", c.Size, g.cfg.MaxFileBytes)})
		return
	}
	if c.Encoding != "base64" {
		// The API returns encoding "none" for a file it declines to inline.
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: "the API would not return the contents inline"})
		return
	}
	body, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(c.Content, "\n", ""))
	if err != nil {
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: "undecodable contents"})
		return
	}
	if len(body) > g.cfg.MaxFileBytes {
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: fmt.Sprintf("%d bytes is over the %d byte cap", len(body), g.cfg.MaxFileBytes)})
		return
	}
	// The extension check is a cheap first pass; this is the one that is right.
	// A .md file can hold anything, and an embedder fed a PNG produces a vector
	// that poisons recall for everything near it.
	if binaryContent(body) {
		batch.Skipped = append(batch.Skipped, Skip{Ref: p, Reason: "binary"})
		return
	}

	imp := 0.6
	if isReadme(p) {
		// The README is the answer to "what does this service do?", which is the
		// question this source exists to answer.
		imp = 0.9
	}
	batch.Docs = append(batch.Docs, Doc{
		Ref:        p,
		Title:      fmt.Sprintf("%s — %s", g.name, p),
		Text:       string(body),
		Importance: imp,
	})
}

// appendCommits reads recent history on a first run.
func (g *gitHubSource) appendCommits(ctx context.Context, token, head string, batch *Batch) error {
	var commits []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
		} `json:"commit"`
	}
	if err := g.get(ctx, token, g.path("/commits"), url.Values{
		"sha":      {head},
		"per_page": {strconv.Itoa(g.cfg.MaxCommits)},
	}, &commits); err != nil {
		return err
	}
	subjects := make([]string, 0, len(commits))
	for _, c := range commits { // the API already returns newest first
		subjects = append(subjects, subject(c.Commit.Message))
	}
	if len(subjects) > 0 {
		g.appendCommitDoc(subjects, batch)
	}
	return nil
}

// appendCommitDoc writes the commit subjects as ONE doc under a stable ref.
//
// One doc, not one per commit: the ref is stable, so each refresh UPDATES it and
// "what has been happening in this repo" stays a single current answer instead
// of ten thousand rows that drown out the README in every recall.
func (g *gitHubSource) appendCommitDoc(subjects []string, batch *Batch) {
	if len(subjects) > g.cfg.MaxCommits {
		subjects = subjects[:g.cfg.MaxCommits]
	}
	batch.Docs = append(batch.Docs, Doc{
		Ref:        "commits",
		Title:      fmt.Sprintf("%s — recent commits", g.name),
		Text:       strings.Join(subjects, "\n"),
		Importance: 0.4,
	})
}

// fetchIssues reads issues and pull requests, and returns the new watermark.
func (g *gitHubSource) fetchIssues(ctx context.Context, token, since string, batch *Batch) (string, error) {
	q := url.Values{
		"state":     {"all"},
		"sort":      {"updated"},
		"direction": {"desc"},
		"per_page":  {strconv.Itoa(g.cfg.MaxIssues)},
	}
	if since != "" {
		q.Set("since", since)
	}
	var issues []struct {
		Number      int    `json:"number"`
		Title       string `json:"title"`
		State       string `json:"state"`
		Body        string `json:"body"`
		UpdatedAt   string `json:"updated_at"`
		PullRequest *struct {
			URL string `json:"url"`
		} `json:"pull_request"`
	}
	if err := g.get(ctx, token, g.path("/issues"), q, &issues); err != nil {
		return "", err
	}

	watermark := since
	for _, is := range issues {
		kind := "issue"
		if is.PullRequest != nil {
			kind = "pull request"
		}
		body := is.Body
		if len(body) > 4000 {
			body = body[:4000] + "\n…"
		}
		batch.Docs = append(batch.Docs, Doc{
			Ref:        fmt.Sprintf("%s:%d", strings.ReplaceAll(kind, " ", "-"), is.Number),
			Title:      fmt.Sprintf("%s %s #%d (%s): %s", g.name, kind, is.Number, is.State, is.Title),
			Text:       body,
			Importance: 0.3,
		})
		// The watermark comes from the DATA, not the clock: using time.Now would
		// skip anything updated between the request and the response, and would
		// also be wrong whenever the two machines disagree about the time.
		if is.UpdatedAt > watermark {
			watermark = is.UpdatedAt
		}
	}
	return watermark, nil
}

func (g *gitHubSource) wanted(p string) bool {
	if p == "" {
		return false
	}
	if MatchAny(g.cfg.Exclude, p) {
		return false
	}
	return MatchAny(g.cfg.Include, p)
}

func (g *gitHubSource) path(suffix string) string {
	return "/repos/" + url.PathEscape(g.cfg.Owner) + "/" + url.PathEscape(g.cfg.Repo) + suffix
}

// httpError carries the status so a 404 can be handled without string matching.
type httpError struct {
	status int
	msg    string
}

func (e *httpError) Error() string { return e.msg }

func isNotFound(err error) bool {
	var he *httpError
	return errors.As(err, &he) && he.status == http.StatusNotFound
}

func (g *gitHubSource) get(ctx context.Context, token, path string, q url.Values, out any) error {
	u := g.cfg.APIBase + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return fmt.Errorf("build request for %s: %w", path, err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "togo-builder-sources")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := g.http.Do(req)
	if err != nil {
		// A transport error can quote the request, headers included.
		return fmt.Errorf("GET %s: %s", path, Scrub(err.Error()))
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return &httpError{status: res.StatusCode, msg: g.statusMessage(path, res)}
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(io.LimitReader(res.Body, maxResponseBytes+1)); err != nil {
		return fmt.Errorf("read %s: %s", path, Scrub(err.Error()))
	}
	if buf.Len() > maxResponseBytes {
		return fmt.Errorf("read %s: response is larger than %d bytes", path, maxResponseBytes)
	}
	if err := json.Unmarshal(buf.Bytes(), out); err != nil {
		return fmt.Errorf("decode %s: %w", path, err)
	}
	return nil
}

// statusMessage turns a failure into something an operator can act on. It never
// echoes the response body, which on a misconfigured proxy can contain the
// request that was made.
func (g *gitHubSource) statusMessage(path string, res *http.Response) string {
	switch {
	case res.StatusCode == http.StatusUnauthorized:
		return fmt.Sprintf("GET %s: the GitHub token was rejected (401)", path)
	case res.StatusCode == http.StatusForbidden && res.Header.Get("X-RateLimit-Remaining") == "0":
		reset := res.Header.Get("X-RateLimit-Reset")
		if n, err := strconv.ParseInt(reset, 10, 64); err == nil {
			return fmt.Sprintf("GET %s: GitHub rate limit exhausted until %s", path, time.Unix(n, 0).UTC().Format(time.RFC3339))
		}
		return fmt.Sprintf("GET %s: GitHub rate limit exhausted", path)
	case res.StatusCode == http.StatusForbidden:
		return fmt.Sprintf("GET %s: forbidden (403) — the token may lack access to this repository", path)
	case res.StatusCode == http.StatusNotFound:
		return fmt.Sprintf("GET %s: not found (404) — check the owner, repository and branch, and whether the token can see a private repository", path)
	default:
		return fmt.Sprintf("GET %s: unexpected status %d", path, res.StatusCode)
	}
}

// escapePath escapes each segment but keeps the separators, because a contents
// path is a path.
func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

func subject(msg string) string {
	if i := strings.IndexByte(msg, '\n'); i >= 0 {
		msg = msg[:i]
	}
	return strings.TrimSpace(msg)
}

func isReadme(p string) bool {
	base := strings.ToLower(p)
	if i := strings.LastIndexByte(base, '/'); i >= 0 {
		base = base[i+1:]
	}
	return strings.HasPrefix(base, "readme")
}

// binaryExts is the cheap first pass — it costs nothing and it stops the common
// cases (a diagram, a screenshot, a vendored font) before they are downloaded.
var binaryExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".ico": true, ".bmp": true, ".tiff": true, ".pdf": true, ".zip": true,
	".gz": true, ".tgz": true, ".bz2": true, ".xz": true, ".zst": true,
	".tar": true, ".7z": true, ".rar": true, ".jar": true, ".war": true,
	".exe": true, ".dll": true, ".so": true, ".dylib": true, ".a": true,
	".o": true, ".class": true, ".wasm": true, ".bin": true, ".dat": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
	".mp3": true, ".mp4": true, ".mov": true, ".avi": true, ".webm": true,
	".wav": true, ".ogg": true, ".flac": true, ".psd": true, ".sketch": true,
	".db": true, ".sqlite": true, ".pyc": true, ".parquet": true, ".avro": true,
}

func binaryPath(p string) bool {
	i := strings.LastIndexByte(p, '.')
	if i < 0 {
		return false
	}
	return binaryExts[strings.ToLower(p[i:])]
}

// binaryContent is the pass that is actually right: a NUL byte or invalid UTF-8
// means this is not text, whatever the extension claimed.
func binaryContent(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	head := b
	if len(head) > 8000 {
		head = head[:8000]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return true
	}
	return !utf8.Valid(head)
}
