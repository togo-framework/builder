// Package skills owns the skill catalogue: the reusable instruction files that
// agents load by name.
//
// A skill lived only as .claude/skills/<name>/SKILL.md on disk, while
// builder_agents.skills is a text[] of bare names. Nothing connected the two —
// an operator could not see which skills existed, could not tell whether a name
// in an agent's array resolved to anything at all, and could only add one by
// writing a file by hand on whichever machine the runner happens to execute on.
//
// This package makes the catalogue readable and editable, keeps the disk files
// in step in both directions (sync reads disk, create/edit writes it), and
// installs skills from a GitHub repository.
package skills

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
)

// Limits. Every one of these is also a database CHECK in 0006_skills.sql; they
// are repeated here so a bad request is answered with a sentence rather than a
// constraint-violation 500.
const (
	maxTitleBytes = 200
	maxDescBytes  = 2000
	maxBodyBytes  = 512 << 10
	maxPathBytes  = 500

	// Mirrors the cap the fleet's own agent PATCH applies (cleanList(.., 60)).
	// Without the same ceiling here, assigning a 61st skill from this page would
	// be silently dropped the next time the agent profile was saved.
	maxSkillsPerAgent = 60
)

// A skill name is also a directory name and a value inside a Postgres text[]
// literal, so it is a slug and nothing else. Kept identical to the CHECK in
// 0006_skills.sql.
var nameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,63}$`)

type Service struct {
	db  *sql.DB
	log *slog.Logger
	// root is the application directory that owns .claude/skills. Everything
	// this package writes is resolved beneath it and checked for containment.
	root string
}

func New(db *sql.DB, log *slog.Logger, root string) *Service {
	if strings.TrimSpace(root) == "" {
		root = "."
	}
	return &Service{db: db, log: log, root: root}
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/", s.handleList)
	r.Post("/", s.handleCreate)
	// Static segments are matched ahead of {name} by chi's trie regardless of
	// registration order, so "sync" and "import" can never be read as a skill.
	r.Post("/sync", s.handleSync)
	r.Post("/import", s.handleImport)
	r.Get("/{name}", s.handleGet)
	r.Get("/{name}/activity", s.handleActivity)
	r.Patch("/{name}", s.handlePatch)
	r.Delete("/{name}", s.handleDelete)
	r.Post("/{name}/agents", s.handleAssign)
	r.Delete("/{name}/agents/{slug}", s.handleUnassign)
}

// ── the catalogue ───────────────────────────────────────────────────────────

type skill struct {
	Name          string `json:"name"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Source        string `json:"source"`
	SourceRef     string `json:"sourceRef"`
	InstalledPath string `json:"installedPath"`
	Enabled       bool   `json:"enabled"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
	// How many agents currently name this skill. The number that answers "is
	// this catalogue entry doing anything?".
	Agents int `json:"agents"`
	// Only populated by the detail endpoint — a listing of forty skills should
	// not carry forty documents.
	BodyMD string `json:"bodyMd,omitempty"`
}

const skillSelect = `
SELECT s.name, s.title, s.description, s.source, s.source_ref, s.installed_path, s.enabled,
       -- to_char's OF emits "+03", which JS Date parses as NaN. to_json emits a
       -- full ISO-8601 timestamp, so the surrounding quotes are trimmed instead.
       btrim(to_json(s.created_at)::text, '"'),
       btrim(to_json(s.updated_at)::text, '"'),
       coalesce((SELECT count(*) FROM builder_agents a WHERE s.name = ANY(a.skills)), 0)
  FROM builder_skills s`

func scanSkill(rows *sql.Rows) (skill, error) {
	var sk skill
	err := rows.Scan(&sk.Name, &sk.Title, &sk.Description, &sk.Source, &sk.SourceRef,
		&sk.InstalledPath, &sk.Enabled, &sk.CreatedAt, &sk.UpdatedAt, &sk.Agents)
	return sk, err
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	// Search runs in the DATABASE, not the browser.
	//
	// Filtering client-side means shipping the whole catalogue on every page
	// load and searching only what happened to be fetched — which silently
	// misses anything past the first page as soon as paging exists. The body is
	// searched too, because a skill is usually remembered by what it says rather
	// than by its slug.
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, offset := 50, 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	where, args := "", []any{}
	if q != "" {
		// ILIKE rather than full-text: a catalogue this size wants substring and
		// prefix matches on identifiers ("togo-mig"), which to_tsquery does not
		// give without extra configuration.
		args = append(args, "%"+q+"%")
		where = ` WHERE (s.name ILIKE $1 OR s.title ILIKE $1 OR s.description ILIKE $1 OR s.body_md ILIKE $1)`
	}

	var total int
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT count(*) FROM builder_skills s`+where, args...).Scan(&total); err != nil {
		s.log.Error("count skills", "err", err)
	}

	args = append(args, limit, offset)
	rows, err := s.db.QueryContext(r.Context(), skillSelect+where+fmt.Sprintf(`
	 ORDER BY s.enabled DESC, s.name ASC LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		s.log.Error("list skills", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list the skills")
		return
	}
	defer rows.Close()

	// Allocated, not nil: Go marshals a nil slice as `null` and the page reads
	// .length on it, so an empty catalogue would crash the table instead of
	// rendering the empty state.
	out := make([]skill, 0, 16)
	for rows.Next() {
		sk, err := scanSkill(rows)
		if err != nil {
			s.log.Error("scan skill", "err", err)
			httpErr(w, http.StatusInternalServerError, "could not read the skills")
			return
		}
		out = append(out, sk)
	}
	if err := rows.Err(); err != nil {
		s.log.Error("list skills", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skills")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"skills": out, "dir": s.relSkillsDir(),
		"total": total, "offset": offset, "limit": limit,
	})
}

// skillAgent is one row of the assignment picker: every agent in the fleet, and
// whether it currently names this skill. The whole fleet is returned rather
// than just the holders because the picker's job is to let the operator add
// one, and a list of the agents that already have it cannot do that.
type skillAgent struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
	Enabled     bool   `json:"enabled"`
	Has         bool   `json:"has"`
}

func (s *Service) handleGet(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !nameRe.MatchString(name) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}

	rows, err := s.db.QueryContext(r.Context(), skillSelect+` WHERE s.name = $1`, name)
	if err != nil {
		s.log.Error("get skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not load the skill")
		return
	}
	defer rows.Close()
	if !rows.Next() {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}
	sk, err := scanSkill(rows)
	if err != nil {
		s.log.Error("scan skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill")
		return
	}
	rows.Close()

	if err := s.db.QueryRowContext(r.Context(),
		`SELECT body_md FROM builder_skills WHERE name = $1`, name).Scan(&sk.BodyMD); err != nil {
		s.log.Error("read skill body", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill")
		return
	}

	agents := make([]skillAgent, 0, 8)
	arows, err := s.db.QueryContext(r.Context(),
		`SELECT a.slug, a.display_name, a.enabled, ($1 = ANY(a.skills))
		   FROM builder_agents a
		  ORDER BY ($1 = ANY(a.skills)) DESC, a.slug ASC`, name)
	if err != nil {
		// The skill itself loaded; a fleet query that failed must not take the
		// page down with it, but it is not something to swallow silently either.
		s.log.Error("list agents for skill", "name", name, "err", err)
	} else {
		defer arows.Close()
		for arows.Next() {
			var a skillAgent
			if err := arows.Scan(&a.Slug, &a.DisplayName, &a.Enabled, &a.Has); err != nil {
				s.log.Error("scan agent for skill", "name", name, "err", err)
				continue
			}
			agents = append(agents, a)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"skill": sk, "agents": agents})
}

// ── writing ─────────────────────────────────────────────────────────────────

type newSkill struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	BodyMD      string `json:"bodyMd"`
}

func (s *Service) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in newSkill
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes+64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	in.Name = strings.ToLower(strings.TrimSpace(in.Name))
	if !nameRe.MatchString(in.Name) {
		httpErr(w, http.StatusUnprocessableEntity,
			"a skill name must be 2-64 lowercase letters, digits and hyphens — it is also the directory name on disk")
		return
	}
	if len(in.BodyMD) > maxBodyBytes {
		httpErr(w, http.StatusUnprocessableEntity, "that skill is too large — keep a SKILL.md under 512 KB")
		return
	}
	// A skill with no instructions is worse than no skill: an agent loads it,
	// spends the context window on nothing, and the operator sees a catalogue
	// entry that looks real.
	if strings.TrimSpace(in.BodyMD) == "" {
		httpErr(w, http.StatusUnprocessableEntity, "write the skill's instructions — an empty skill teaches an agent nothing")
		return
	}

	title := truncate(strings.TrimSpace(in.Title), maxTitleBytes)
	desc := truncate(oneLine(in.Description), maxDescBytes)

	// The row lands first. The file is best-effort below, because a read-only
	// checkout must not stop an operator from cataloguing a skill — and the
	// database is what the dashboard reads.
	_, err := s.db.ExecContext(r.Context(),
		`INSERT INTO builder_skills (name, title, description, body_md, source, source_ref, installed_path)
		 VALUES ($1, $2, $3, $4, 'operator', '', '')`,
		in.Name, title, desc, in.BodyMD)
	if err != nil {
		if isUniqueViolation(err) {
			httpErr(w, http.StatusConflict, "a skill with that name already exists")
			return
		}
		s.log.Error("create skill", "name", in.Name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the skill")
		return
	}

	path := s.materialise(r.Context(), in.Name, desc, in.BodyMD)
	s.log.Info("created a skill", "name", in.Name, "path", path)
	writeJSON(w, http.StatusCreated, map[string]any{"name": in.Name, "installedPath": path})
}

// patchSkill is the editable surface. Every field is a pointer so "not sent"
// and "set to empty" stay distinguishable — a PATCH of {"enabled":false} must
// not blank the instructions.
//
// `name` is deliberately absent. Agents reference a skill by bare name in
// builder_agents.skills; renaming the row would leave every one of those arrays
// pointing at a skill that no longer exists, with nothing to warn the operator.
type patchSkill struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	BodyMD      *string `json:"bodyMd"`
	Enabled     *bool   `json:"enabled"`
}

func (s *Service) handlePatch(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !nameRe.MatchString(name) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}
	var in patchSkill
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes+64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	sets := []string{}
	args := []any{}
	add := func(frag string, v any) {
		args = append(args, v)
		sets = append(sets, frag+"$"+itoa(len(args)))
	}

	if in.Title != nil {
		add("title = ", truncate(strings.TrimSpace(*in.Title), maxTitleBytes))
	}
	if in.Description != nil {
		add("description = ", truncate(oneLine(*in.Description), maxDescBytes))
	}
	if in.BodyMD != nil {
		if len(*in.BodyMD) > maxBodyBytes {
			httpErr(w, http.StatusUnprocessableEntity, "that skill is too large — keep a SKILL.md under 512 KB")
			return
		}
		if strings.TrimSpace(*in.BodyMD) == "" {
			httpErr(w, http.StatusUnprocessableEntity, "a skill cannot have empty instructions")
			return
		}
		add("body_md = ", *in.BodyMD)
	}
	if in.Enabled != nil {
		add("enabled = ", *in.Enabled)
	}
	if len(sets) == 0 {
		httpErr(w, http.StatusBadRequest, "nothing to change")
		return
	}
	sets = append(sets, "updated_at = now()")
	args = append(args, name)

	res, err := s.db.ExecContext(r.Context(),
		"UPDATE builder_skills SET "+strings.Join(sets, ", ")+
			" WHERE name = $"+itoa(len(args)), args...)
	if err != nil {
		s.log.Error("patch skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not save the skill")
		return
	}
	n, err := res.RowsAffected()
	if err != nil {
		s.log.Error("patch skill rows", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not save the skill")
		return
	}
	if n == 0 {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}

	// Mirror the saved text back to disk. Skipping this would make the editor a
	// lie: Claude Code reads SKILL.md from the working tree, so an edit that
	// only reached Postgres would change nothing about how the agent behaves.
	var desc, body string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT description, body_md FROM builder_skills WHERE name = $1`, name).Scan(&desc, &body); err != nil {
		s.log.Warn("could not re-read the skill to write it to disk", "name", name, "err", err)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	path := s.materialise(r.Context(), name, desc, body)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "installedPath": path})
}

func (s *Service) handleDelete(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !nameRe.MatchString(name) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.log.Error("delete skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the skill")
		return
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(r.Context(), `DELETE FROM builder_skills WHERE name = $1`, name)
	if err != nil {
		s.log.Error("delete skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the skill")
		return
	}
	n, err := res.RowsAffected()
	if err != nil {
		s.log.Error("delete skill rows", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the skill")
		return
	}
	if n == 0 {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}

	// The same transaction unassigns it everywhere. builder_agents.skills is a
	// bare text[] with no foreign key, so deleting only the row would leave
	// every agent that held it naming a skill that no longer resolves — and
	// nothing would ever tell the operator.
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_agents SET skills = array_remove(skills, $1), updated_at = now()
		  WHERE $1 = ANY(skills)`, name); err != nil {
		s.log.Error("unassign deleted skill", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the skill")
		return
	}
	if err := tx.Commit(); err != nil {
		s.log.Error("commit skill delete", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the skill")
		return
	}

	// And the directory, if it is one of ours. Leaving the file behind means the
	// next sync re-creates the row — a skill the operator deleted reappearing on
	// its own is worse than either outcome.
	removed := ""
	if dir, err := s.dirFor(name); err == nil {
		if err := os.RemoveAll(dir); err != nil {
			s.log.Warn("could not remove the skill directory", "name", name, "dir", dir, "err", err)
		} else {
			removed = s.rel(dir)
		}
	}
	s.log.Info("deleted a skill", "name", name, "removedPath", removed)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "removedPath": removed})
}

// ── assignment ──────────────────────────────────────────────────────────────

type assignReq struct {
	Slug string `json:"slug"`
}

func (s *Service) handleAssign(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !nameRe.MatchString(name) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}
	var in assignReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	slug := strings.TrimSpace(in.Slug)
	if slug == "" {
		httpErr(w, http.StatusUnprocessableEntity, "name the agent to assign this skill to")
		return
	}

	var exists bool
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT true FROM builder_skills WHERE name = $1`, name).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such skill")
			return
		}
		s.log.Error("assign skill lookup", "name", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not assign the skill")
		return
	}

	var held int
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT cardinality(skills) FROM builder_agents WHERE slug = $1`, slug).Scan(&held); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such agent")
			return
		}
		s.log.Error("assign skill agent lookup", "slug", slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not assign the skill")
		return
	}
	if held >= maxSkillsPerAgent {
		httpErr(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("that agent already holds %d skills, which is the cap — remove one first", maxSkillsPerAgent))
		return
	}

	// Guarded by NOT ... = ANY so a repeated assign is a no-op rather than a
	// duplicate entry in the array. Zero rows here means "already had it".
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_agents SET skills = array_append(skills, $1), updated_at = now()
		  WHERE slug = $2 AND NOT ($1 = ANY(skills))`, name, slug); err != nil {
		s.log.Error("assign skill", "name", name, "slug", slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not assign the skill")
		return
	}
	s.log.Info("assigned a skill", "name", name, "agent", slug)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Service) handleUnassign(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	slug := chi.URLParam(r, "slug")
	if !nameRe.MatchString(name) || strings.TrimSpace(slug) == "" {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}

	res, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_agents SET skills = array_remove(skills, $1), updated_at = now()
		  WHERE slug = $2`, name, slug)
	if err != nil {
		s.log.Error("unassign skill", "name", name, "slug", slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not unassign the skill")
		return
	}
	n, err := res.RowsAffected()
	if err != nil {
		s.log.Error("unassign skill rows", "name", name, "slug", slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not unassign the skill")
		return
	}
	if n == 0 {
		httpErr(w, http.StatusNotFound, "no such agent")
		return
	}
	s.log.Info("unassigned a skill", "name", name, "agent", slug)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// isUniqueViolation reports a duplicate name without importing a driver.
//
// The kernel hands this package a *sql.DB whose driver is chosen by the host
// app (lib/pq here, pgx elsewhere), and the two return different error types
// for SQLSTATE 23505. Matching the text is ugly but it is the only check that
// holds for both.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "23505") || strings.Contains(msg, "duplicate key")
}

// truncate cuts to at most n BYTES without splitting a character.
//
// Plain s[:n] cuts mid-rune when the boundary lands inside a multi-byte
// character, leaving invalid UTF-8 that Postgres refuses to store. Skill text
// is prose written by whoever wrote the repository — Arabic and emoji are both
// entirely normal in it.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

// oneLine flattens a description to a single line.
//
// It is rendered into YAML frontmatter as a quoted scalar, and an embedded
// newline there produces a file Claude Code cannot parse.
func oneLine(s string) string {
	s = strings.ReplaceAll(s, "\r\n", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	return strings.TrimSpace(strings.Join(strings.Fields(s), " "))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// rel renders an absolute path relative to the app root, which is what the
// dashboard shows. An absolute path leaks the deploy's directory layout into
// the UI and means nothing to the reader.
func (s *Service) rel(abs string) string {
	root, err := filepath.Abs(s.root)
	if err != nil {
		return abs
	}
	if r, err := filepath.Rel(root, abs); err == nil && !strings.HasPrefix(r, "..") {
		return r
	}
	return abs
}

func (s *Service) relSkillsDir() string {
	return filepath.Join(".claude", "skills")
}

var errEscapesRoot = errors.New("path escapes the skills directory")

// dirFor resolves <root>/.claude/skills/<name> and refuses anything outside it.
//
// nameRe already forbids slashes and dots, so this cannot currently fail — the
// check stays because it is the invariant that has to hold if that regex is
// ever loosened, and because every path in this package that touches the disk
// goes through here. A skill installed from a repository is the one place where
// an attacker chooses the name.
func (s *Service) dirFor(name string) (string, error) {
	if !nameRe.MatchString(name) {
		return "", errEscapesRoot
	}
	base, err := filepath.Abs(s.skillsRoot())
	if err != nil {
		return "", err
	}
	full := filepath.Join(base, name)
	rel, err := filepath.Rel(base, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) ||
		filepath.IsAbs(rel) {
		return "", errEscapesRoot
	}
	return full, nil
}

func (s *Service) skillsRoot() string {
	return filepath.Join(s.root, ".claude", "skills")
}

// materialise writes <root>/.claude/skills/<name>/SKILL.md and returns the path
// relative to the root, or "" if it could not be written.
//
// Failure is logged and never fatal: the catalogue is the database, and an
// operator running against a read-only checkout should still be able to write
// down a skill.
func (s *Service) materialise(ctx context.Context, name, description, body string) string {
	dir, err := s.dirFor(name)
	if err != nil {
		s.log.Warn("refusing to write a skill outside the skills directory", "name", name)
		return ""
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		s.log.Warn("could not create the skill directory", "dir", dir, "err", err)
		return ""
	}
	full := filepath.Join(dir, "SKILL.md")
	if err := os.WriteFile(full, []byte(renderSkillMD(name, description, body)), 0o644); err != nil {
		s.log.Warn("could not write the skill", "path", full, "err", err)
		return ""
	}

	rel := s.rel(full)
	if _, err := s.db.ExecContext(ctx,
		`UPDATE builder_skills SET installed_path = $1, updated_at = now() WHERE name = $2`,
		truncate(rel, maxPathBytes), name); err != nil {
		// The file is on disk; only the bookkeeping failed. Say so rather than
		// reporting a path the row does not know about.
		s.log.Warn("wrote the skill but could not record its path", "name", name, "err", err)
	}
	return rel
}
