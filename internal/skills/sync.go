package skills

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// skipped is one entry the operator asked for and did not get, with the reason.
// A sync or an import that quietly does less than it claimed is the failure
// this type exists to prevent.
type skipped struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

type syncResult struct {
	Dir     string    `json:"dir"`
	Scanned int       `json:"scanned"`
	Created []string  `json:"created"`
	Updated []string  `json:"updated"`
	Skipped []skipped `json:"skipped"`
}

// handleSync reads .claude/skills/ and brings the catalogue up to date with it.
//
// Every install already has skills on disk that nobody typed into this app, and
// asking an operator to re-enter them by hand to make them visible would mean
// nobody ever uses the page. This is the disk -> database direction; create and
// edit are the other one.
func (s *Service) handleSync(w http.ResponseWriter, r *http.Request) {
	dir := s.skillsRoot()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			httpErr(w, http.StatusUnprocessableEntity,
				"there is no "+s.relSkillsDir()+" directory here — nothing to sync")
			return
		}
		s.log.Error("read the skills directory", "dir", dir, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skills directory")
		return
	}

	out := syncResult{
		Dir: s.relSkillsDir(),
		// Allocated rather than nil: the page reads .length on all three, and Go
		// marshals a nil slice as null.
		Created: make([]string, 0, 4),
		Updated: make([]string, 0, 4),
		Skipped: make([]skipped, 0, 4),
	}

	for _, e := range entries {
		// One level only. A skill is a directory holding a SKILL.md; recursing
		// would pick up whatever else a repository keeps under .claude/.
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		out.Scanned++

		if !nameRe.MatchString(name) {
			out.Skipped = append(out.Skipped, skipped{name,
				"the directory name is not a valid skill name — 2-64 lowercase letters, digits and hyphens"})
			continue
		}
		file := filepath.Join(dir, name, "SKILL.md")
		body, title, desc, err := readSkillFile(file)
		if err != nil {
			out.Skipped = append(out.Skipped, skipped{name, err.Error()})
			continue
		}

		created, ok, err := s.upsert(r.Context(), upsertInput{
			Name: name, Title: title, Description: desc, Body: body,
			Source: "local", SourceRef: filepath.Join(s.relSkillsDir(), name),
			InstalledPath: filepath.Join(s.relSkillsDir(), name, "SKILL.md"),
		})
		switch {
		case err != nil:
			s.log.Error("upsert synced skill", "name", name, "err", err)
			out.Skipped = append(out.Skipped, skipped{name, "could not be saved"})
		case !ok:
			out.Skipped = append(out.Skipped, skipped{name,
				"written in this app — syncing would overwrite what you wrote here"})
		case created:
			out.Created = append(out.Created, name)
		default:
			out.Updated = append(out.Updated, name)
		}
	}

	s.log.Info("synced the skills directory", "dir", dir, "scanned", out.Scanned,
		"created", len(out.Created), "updated", len(out.Updated), "skipped", len(out.Skipped))
	writeJSON(w, http.StatusOK, out)
}

// readSkillFile reads one SKILL.md and derives the fields the catalogue stores.
//
// The error is returned to the operator verbatim as the skip reason, so it is
// written as a sentence rather than a Go error string.
func readSkillFile(path string) (body, title, description string, err error) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", "", "", errors.New("no SKILL.md in that directory")
		}
		return "", "", "", errors.New("could not be read")
	}
	if info.Size() > maxBodyBytes {
		return "", "", "", errors.New("the SKILL.md is larger than 512 KB")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", "", "", errors.New("could not be read")
	}

	fm, body := parseSkillMD(string(raw))
	if strings.TrimSpace(body) == "" {
		return "", "", "", errors.New("the SKILL.md has no instructions in it")
	}
	title = fm.Title
	if title == "" {
		title = firstHeading(body)
	}
	return body, truncate(title, maxTitleBytes), truncate(oneLine(fm.Description), maxDescBytes), nil
}

type upsertInput struct {
	Name          string
	Title         string
	Description   string
	Body          string
	Source        string
	SourceRef     string
	InstalledPath string
}

// upsert writes one catalogue row.
//
// ok is false when the row exists and was written in this app: a file that
// happens to share a name must not silently replace an operator's own text, and
// the caller reports that as a skip rather than pretending it landed.
func (s *Service) upsert(ctx context.Context, in upsertInput) (created bool, ok bool, err error) {
	// `xmax = 0` distinguishes an INSERT from an ON CONFLICT UPDATE: Postgres
	// leaves xmax zero on a freshly inserted tuple and sets it to the updating
	// transaction on one that was replaced. Without it the two cases are
	// indistinguishable and the report cannot say what it actually did.
	//
	// The WHERE on DO UPDATE is what makes ok=false reachable — a conflicting
	// operator-authored row matches neither the insert nor the update, so
	// nothing is returned at all.
	err = s.db.QueryRowContext(ctx,
		`INSERT INTO builder_skills
		   (name, title, description, body_md, source, source_ref, installed_path)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (name) DO UPDATE
		    SET title          = EXCLUDED.title,
		        description    = EXCLUDED.description,
		        body_md        = EXCLUDED.body_md,
		        source         = EXCLUDED.source,
		        source_ref     = EXCLUDED.source_ref,
		        installed_path = EXCLUDED.installed_path,
		        updated_at     = now()
		  WHERE builder_skills.source <> 'operator'
		 RETURNING (xmax = 0)`,
		in.Name, truncate(in.Title, maxTitleBytes), truncate(oneLine(in.Description), maxDescBytes),
		in.Body, in.Source, truncate(in.SourceRef, maxPathBytes),
		truncate(in.InstalledPath, maxPathBytes)).Scan(&created)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	return created, true, nil
}
