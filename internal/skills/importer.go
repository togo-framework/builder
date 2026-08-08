package skills

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Importing a repository is the one place in this package where an outsider
// chooses the strings. Everything below is written on the assumption that
// `repo`, `path`, and every directory name inside the clone are hostile.
const (
	// A clone that has not finished by now is not going to. Without a deadline
	// a private or renamed repository parks a request until the client gives
	// up, holding a temp directory and a git process the whole time.
	importTimeout = 2 * time.Minute

	// One import installs at most this many skills. A repository with a
	// thousand SKILL.md files under it would otherwise fill the catalogue,
	// the disk and every agent's context window in a single click.
	maxImportSkills = 50

	// How deep to look for a SKILL.md. Skills live one or two levels under the
	// scanned root; deeper than this is a vendored checkout, not a skill tree.
	maxImportDepth = 4
)

// GitHub's own limits: an owner is <= 39 characters, a repository <= 100, both
// restricted to letters, digits, hyphen, underscore and dot. Anchored, so a
// value that reaches exec is a plain "owner/name" and can be nothing else —
// no scheme, no "..", no leading hyphen that git would read as a flag.
var repoRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,38}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)

type importReq struct {
	Repo string `json:"repo"`
	Path string `json:"path"`
}

type importResult struct {
	Repo string `json:"repo"`
	// The commit the skills were taken from, so the catalogue records what was
	// installed rather than "whatever main was that afternoon".
	Ref       string    `json:"ref"`
	Path      string    `json:"path"`
	Found     int       `json:"found"`
	Installed []string  `json:"installed"`
	Updated   []string  `json:"updated"`
	Skipped   []skipped `json:"skipped"`
}

// handleImport installs the skills in a GitHub repository.
//
// Partial success is the normal outcome and is reported as such: a repository
// with eight skills where two have unusable names installs the other six and
// names the two. Rolling the whole thing back, or failing on the first bad
// directory, would make importing anything real impossible.
func (s *Service) handleImport(w http.ResponseWriter, r *http.Request) {
	var in importReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	repo := strings.TrimSpace(in.Repo)
	repo = strings.TrimSuffix(strings.TrimPrefix(repo, "https://github.com/"), ".git")
	repo = strings.Trim(repo, "/")
	if !repoRe.MatchString(repo) {
		httpErr(w, http.StatusUnprocessableEntity,
			"give the repository as owner/name, for example anthropics/skills")
		return
	}

	sub, err := cleanSubPath(in.Path)
	if err != nil {
		httpErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	git, err := exec.LookPath("git")
	if err != nil {
		// 424: nothing here failed, the machine simply cannot do this.
		httpErr(w, http.StatusFailedDependency,
			"git is not installed on the server, so repositories cannot be imported")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), importTimeout)
	defer cancel()

	tmp, err := os.MkdirTemp("", "builder-skill-import-")
	if err != nil {
		s.log.Error("create the import temp directory", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not prepare the import")
		return
	}
	defer func() {
		if err := os.RemoveAll(tmp); err != nil {
			s.log.Warn("could not clean up the import temp directory", "dir", tmp, "err", err)
		}
	}()

	if err := runGit(ctx, git, tmp, repo); err != nil {
		s.log.Warn("clone for import failed", "repo", repo, "err", err)
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			httpErr(w, http.StatusGatewayTimeout, "the repository took too long to download")
			return
		}
		httpErr(w, http.StatusBadGateway, "could not download "+repo+": "+err.Error())
		return
	}

	out := importResult{
		Repo: repo, Path: sub, Ref: headSHA(ctx, git, tmp),
		Installed: make([]string, 0, 4),
		Updated:   make([]string, 0, 4),
		Skipped:   make([]skipped, 0, 4),
	}
	sourceRef := repo
	if out.Ref != "" {
		sourceRef = repo + "@" + out.Ref
	}

	scanRoot := filepath.Join(tmp, filepath.FromSlash(sub))
	if _, err := os.Stat(scanRoot); err != nil {
		httpErr(w, http.StatusUnprocessableEntity,
			"there is no "+orRoot(sub)+" in "+repo)
		return
	}

	found, err := findSkillFiles(scanRoot)
	if err != nil {
		s.log.Error("scan the cloned repository", "repo", repo, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the downloaded repository")
		return
	}
	out.Found = len(found)
	if out.Found == 0 {
		httpErr(w, http.StatusUnprocessableEntity,
			"no SKILL.md found in "+repo+" under "+orRoot(sub))
		return
	}

	seen := map[string]bool{}
	for _, file := range found {
		if len(out.Installed)+len(out.Updated) >= maxImportSkills {
			out.Skipped = append(out.Skipped, skipped{filepath.Base(filepath.Dir(file)),
				"one import installs at most 50 skills — import the rest with a narrower path"})
			continue
		}

		body, title, desc, err := readSkillFile(file)
		if err != nil {
			out.Skipped = append(out.Skipped, skipped{filepath.Base(filepath.Dir(file)), err.Error()})
			continue
		}
		name, err := importName(file)
		if err != nil {
			out.Skipped = append(out.Skipped, skipped{filepath.Base(filepath.Dir(file)), err.Error()})
			continue
		}
		if seen[name] {
			out.Skipped = append(out.Skipped, skipped{name,
				"two directories in this repository install the same skill name"})
			continue
		}
		seen[name] = true

		// The row goes in first. If it comes back refused — a skill of that name
		// was written in this app — the file is left alone too, so the operator's
		// own text survives on both sides.
		created, ok, err := s.upsert(ctx, upsertInput{
			Name: name, Title: title, Description: desc, Body: body,
			Source: "github", SourceRef: sourceRef,
			InstalledPath: filepath.Join(s.relSkillsDir(), name, "SKILL.md"),
		})
		if err != nil {
			s.log.Error("upsert imported skill", "repo", repo, "name", name, "err", err)
			out.Skipped = append(out.Skipped, skipped{name, "could not be saved"})
			continue
		}
		if !ok {
			out.Skipped = append(out.Skipped, skipped{name,
				"a skill of that name was written in this app — importing would overwrite it"})
			continue
		}

		// materialise resolves the destination under .claude/skills and refuses
		// anything that escapes it, so a repository cannot choose where its files
		// land no matter what it calls its directories.
		if s.materialise(ctx, name, desc, body) == "" {
			out.Skipped = append(out.Skipped, skipped{name, "saved, but the file could not be written to disk"})
			continue
		}
		if created {
			out.Installed = append(out.Installed, name)
		} else {
			out.Updated = append(out.Updated, name)
		}
	}

	s.log.Info("imported skills", "repo", repo, "ref", out.Ref, "found", out.Found,
		"installed", len(out.Installed), "updated", len(out.Updated), "skipped", len(out.Skipped))
	writeJSON(w, http.StatusOK, out)
}

// runGit clones one repository, shallow, into dst.
//
// exec.CommandContext with separate arguments — never a shell string. The URL
// is assembled here from a value repoRe has already proved is "owner/name", so
// there is no place for an operator's input to become an option or a command.
func runGit(ctx context.Context, git, dst, repo string) error {
	cmd := exec.CommandContext(ctx, git,
		// An empty credential helper plus GIT_TERMINAL_PROMPT=0 is what stops a
		// private or misspelled repository from blocking on a username prompt
		// until the deadline, on a server where nobody can answer it.
		"-c", "credential.helper=",
		"clone", "--depth", "1", "--single-branch", "--no-tags",
		"https://github.com/"+repo+".git", dst)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_ASKPASS=", "GCM_INTERACTIVE=never")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return errors.New(lastLine(stderr.String()))
	}
	return nil
}

// headSHA records which commit was installed. Best-effort: a missing SHA costs
// provenance, not the import.
func headSHA(ctx context.Context, git, dir string) string {
	cmd := exec.CommandContext(ctx, git, "-C", dir, "rev-parse", "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	sha := strings.TrimSpace(string(out))
	if len(sha) > 12 {
		sha = sha[:12]
	}
	return sha
}

// cleanSubPath validates the optional sub-directory to scan.
//
// It is joined onto the temp clone, so a "../.." here would walk out of it and
// scan the server's filesystem instead.
func cleanSubPath(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if p == "" {
		return "", nil
	}
	p = strings.Trim(strings.ReplaceAll(p, "\\", "/"), "/")
	if p == "" {
		return "", nil
	}
	if strings.Contains(p, "\x00") {
		return "", errors.New("that path is not valid")
	}
	clean := path.Clean(p)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", errors.New("the path must be inside the repository — no leading ..")
	}
	if len(clean) > 200 {
		return "", errors.New("that path is too long")
	}
	return clean, nil
}

// findSkillFiles returns every SKILL.md under root, depth-limited and sorted so
// the report reads the same way twice.
func findSkillFiles(root string) ([]string, error) {
	var out []string
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			// One unreadable directory must not abort the scan of the rest.
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if p != root && (name == ".git" || name == "node_modules" || name == "vendor") {
				return fs.SkipDir
			}
			if depthOf(root, p) > maxImportDepth {
				return fs.SkipDir
			}
			return nil
		}
		if d.Name() == "SKILL.md" {
			out = append(out, p)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(out)
	return out, nil
}

func depthOf(root, p string) int {
	rel, err := filepath.Rel(root, p)
	if err != nil || rel == "." {
		return 0
	}
	return strings.Count(rel, string(filepath.Separator)) + 1
}

// importName decides what an imported skill is called.
//
// The directory holding SKILL.md wins, because that is the name Claude Code
// resolves at run time and the name the file will be written under here. The
// frontmatter is the fallback for a repository that keeps its skills in
// directories named something else ("01-planning"), and if neither is a usable
// slug the skill is skipped rather than renamed into something the operator
// never asked for.
func importName(file string) (string, error) {
	dir := strings.ToLower(filepath.Base(filepath.Dir(file)))
	if nameRe.MatchString(dir) {
		return dir, nil
	}
	raw, err := os.ReadFile(file)
	if err == nil {
		fm, _ := parseSkillMD(string(raw))
		if n := strings.ToLower(strings.TrimSpace(fm.Name)); nameRe.MatchString(n) {
			return n, nil
		}
	}
	return "", errors.New("neither the directory name nor the frontmatter name is a usable skill name")
}

func orRoot(sub string) string {
	if sub == "" {
		return "the repository root"
	}
	return sub
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return truncate(l, 200)
		}
	}
	return "the clone failed"
}
