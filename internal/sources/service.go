package sources

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/builder/internal/brain"
)

// The operator's view of a source.
//
// Everything in this package was reachable by nothing before this file existed:
// the registry could construct a GitHub connector, the scheduler could lease and
// run one, and no route anywhere let a person create the row that would make
// either happen. A subsystem with no surface is indistinguishable from one that
// was never written.
//
// Deliberately absent: any endpoint that returns `config` for a kind that could
// hold a credential. config is written, never read back — see handleList.

// maxNameBytes mirrors the CHECK in 0011_sources.sql, so a bad request is
// answered with a sentence rather than a constraint violation dressed as a 500.
const maxNameBytes = 200

type view struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
	// "source" collects into the brain on a schedule; "actor" sends outward
	// when invoked. One table, one scheduler, one vault path — see migration
	// 0019 for why this is a column rather than a second table.
	Direction   string     `json:"direction"`
	Namespace   string     `json:"namespace"`
	Schedule    string     `json:"schedule"`
	Enabled     bool       `json:"enabled"`
	NextRunAt   time.Time  `json:"nextRunAt"`
	LastRunAt   *time.Time `json:"lastRunAt"`
	LastStatus  string     `json:"lastStatus"`
	LastError   string     `json:"lastError"`
	Failures    int        `json:"consecutiveFailures"`
	TotalRuns   int64      `json:"totalRuns"`
	TotalAdded  int64      `json:"totalAdded"`
	CreatedAt   time.Time  `json:"createdAt"`
	Description Text       `json:"description"`
}

// Routes mounts the source surface. Read and write are both admin-only at the
// mount point: a source holds the name of a vault secret and a target brain
// namespace, and creating one is how an operator points this system at somebody
// else's database.
func (s *Store) Routes(r chi.Router) {
	r.Get("/", s.handleList)
	r.Get("/kinds", s.handleKinds)
	r.Post("/", s.handleCreate)
	r.Get("/{id}/runs", s.handleRuns)
	r.Post("/{id}/refresh", s.handleRefresh)
	r.Patch("/{id}", s.handlePatch)
	r.Delete("/{id}", s.handleDelete)
	s.AnalyticsRoutes(r)
}

// handleKinds lists what this build can actually run.
//
// Read from the registry rather than from a hardcoded list, so a kind that has
// been compiled in but not registered — the exact failure that left the GitHub
// connector unreachable — shows up as an absence here instead of as a source
// that saves fine and never runs.
func (s *Store) handleKinds(w http.ResponseWriter, r *http.Request) {
	kinds := Kinds()
	// The whole-result kinds are dispatched by execute() rather than the
	// registry, so they are not in Kinds() and would otherwise be unofferable.
	kinds = append(kinds, "sql")
	writeJSON(w, http.StatusOK, map[string]any{"kinds": kinds})
}

func (s *Store) handleList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		// config is NOT selected. For kind='sql' it names a vault secret, and
		// for a webhook it holds the signing secret's name; neither belongs in
		// a list payload that a browser will cache. An operator who needs to
		// change one sends a new value rather than reading the old.
		`SELECT id, kind, name, direction, namespace, schedule, enabled, next_run_at,
		        last_run_at, last_status, last_error, consecutive_failures,
		        total_runs, total_added, created_at
		   FROM builder_sources ORDER BY direction, kind, name`)
	if err != nil {
		s.log.Error("list sources", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not list the sources")
		return
	}
	defer rows.Close()

	out := []view{}
	for rows.Next() {
		var v view
		if err := rows.Scan(&v.ID, &v.Kind, &v.Name, &v.Direction, &v.Namespace, &v.Schedule,
			&v.Enabled, &v.NextRunAt, &v.LastRunAt, &v.LastStatus, &v.LastError,
			&v.Failures, &v.TotalRuns, &v.TotalAdded, &v.CreatedAt); err != nil {
			s.log.Error("scan source", "err", Scrub(err.Error()))
			httpErr(w, http.StatusInternalServerError, "could not read the sources")
			return
		}
		v.Description = describe(v)
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sources": out})
}

// describe says in one sentence what an operator most wants to know: is this
// thing working, and when does it next run. Assembled server-side so every
// surface says the same thing about the same row.
//
// Returned in BOTH locales rather than one. This string was the last English
// text left on an otherwise fully Arabic screen — every card title, summary and
// button translated, and then each connection row saying "Collected 3 times.
// Next run in 38 minutes." underneath. Rule 15 is explicit that a feature is
// not done in one locale, and a sentence assembled on the server is no more
// exempt than a label in a component.
//
// The server picks neither: it sends both and the client renders the one it is
// showing, which is the same rule the rest of this API follows for localized
// content.
func describe(v view) Text {
	switch {
	case !v.Enabled:
		return Text{
			EN: "Off. Nothing is collected until you turn it on.",
			AR: "متوقف. لا يُجمع أي شيء حتى تشغّله.",
		}
	case v.LastStatus == "error" && v.Failures > 1:
		return Text{
			EN: fmt.Sprintf("Failing — %d runs in a row. Retries are backing off.", v.Failures),
			AR: fmt.Sprintf("يفشل — %d تشغيلات متتالية. تتباعد إعادة المحاولة.", v.Failures),
		}
	case v.LastStatus == "error":
		return Text{
			EN: "Last run failed. It will be retried on the next schedule.",
			AR: "فشل آخر تشغيل. ستُعاد المحاولة في الموعد التالي.",
		}
	case v.LastRunAt == nil:
		return Text{
			EN: "On, and has not run yet.",
			AR: "مُفعّل، ولم يعمل بعد.",
		}
	default:
		d := time.Until(v.NextRunAt)
		return Text{
			EN: fmt.Sprintf("Collected %d times. Next run %s.", v.TotalRuns, humanUntil(d)),
			AR: fmt.Sprintf("جُمع %d مرات. التشغيل التالي %s.", v.TotalRuns, humanUntilAR(d)),
		}
	}
}

// Text is one string in both locales.
type Text struct {
	EN string `json:"en"`
	AR string `json:"ar"`
}

// humanUntilAR mirrors humanUntil.
//
// Not a translation of the English output — Arabic pluralises differently
// enough that substituting words into an English sentence shape produces
// something grammatically wrong. Written as its own set of sentences.
func humanUntilAR(d time.Duration) string {
	switch {
	case d <= 0:
		return "مستحق الآن"
	case d < time.Minute:
		return "خلال أقل من دقيقة"
	case d < time.Hour:
		return fmt.Sprintf("خلال %d دقيقة", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("خلال %d ساعة", int(d.Hours()))
	default:
		return fmt.Sprintf("خلال %d يوم", int(d.Hours()/24))
	}
}

func humanUntil(d time.Duration) string {
	switch {
	case d <= 0:
		return "is due now"
	case d < time.Minute:
		return "in under a minute"
	case d < time.Hour:
		return fmt.Sprintf("in %d minutes", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("in %d hours", int(d.Hours()))
	default:
		return fmt.Sprintf("in %d days", int(d.Hours()/24))
	}
}

type createReq struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	// Empty means "source", so every existing client keeps working unchanged —
	// which is the whole reason this is a defaulted column rather than a
	// required field on a new endpoint.
	Direction string          `json:"direction"`
	Namespace string          `json:"namespace"`
	Schedule  string          `json:"schedule"`
	Config    json.RawMessage `json:"config"`
	Enabled   bool            `json:"enabled"`
}

func (s *Store) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in createReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	in.Kind = strings.TrimSpace(in.Kind)
	in.Name = strings.TrimSpace(in.Name)
	in.Namespace = strings.TrimSpace(in.Namespace)

	if in.Kind == "" || in.Name == "" {
		httpErr(w, http.StatusUnprocessableEntity, "a source needs a kind and a name")
		return
	}
	if len(in.Name) > maxNameBytes {
		httpErr(w, http.StatusUnprocessableEntity, "that name is too long — keep it under 200 characters")
		return
	}
	direction := normalizeDirection(in.Direction)

	// Both gates below are about COLLECTING, and applying them to an actor
	// would be wrong in both directions: an actor's kind comes from a different
	// registry, and an actor has no namespace because it does not write to the
	// brain at all — it sends outward.
	if direction == "source" {
		// Refuse a kind nothing can run, at the point of creation. Saving it
		// would produce a row that looks configured, is claimed on every pass,
		// and fails with "no runner for source kind" forever.
		if !isPlugin(in.Kind) && in.Kind != "sql" {
			httpErr(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("no runner for %q — this build knows: %s, sql",
					in.Kind, strings.Join(Kinds(), ", ")))
			return
		}
		// An omitted namespace gets this installation's project brain rather
		// than an error.
		//
		// There is exactly ONE correct value here — the fleet's project brain —
		// and the server already knows it. Refusing a request that left it out,
		// with a message about "<fleet>:project" namespaces, asks the operator
		// to learn an internal concept in order to supply the only answer we
		// would have accepted. That is a form the operator cannot fill.
		//
		// The gate below is unchanged for a namespace that IS supplied: an
		// explicit agent-private target is still refused, because that one is a
		// real choice and a wrong one.
		if in.Namespace == "" {
			in.Namespace = brain.ProjectNamespace(brain.FleetName(r.Context(), s.db))
		}
		// A source writes into the project brain and nowhere else. Letting one
		// target an agent's private namespace would put unvetted external
		// content where no other agent can see it and no operator thinks to
		// look — the same rule ingestion applies to an uploaded document.
		if !strings.HasSuffix(in.Namespace, ":project") {
			httpErr(w, http.StatusUnprocessableEntity,
				"a source must collect into a project brain (a \"<fleet>:project\" namespace), not an agent's private one")
			return
		}
	} else {
		// No actor runners exist in this build yet — the senders (Slack,
		// Discord, Telegram, WhatsApp, email) are blocked behind SF-001, the
		// vault-grant defect, because every one of them needs a credential the
		// vault currently cannot grant.
		//
		// Refusing HERE, with that reason, is the honest failure. Accepting the
		// row would leave a connection an operator configured, enabled, and
		// reasonably expects to send things — which would never send anything
		// and never say why.
		httpErr(w, http.StatusUnprocessableEntity,
			"this build has no actor runners yet — sending connections are blocked on the vault grant defect (SF-001)")
		return
	}
	if len(in.Config) == 0 {
		in.Config = json.RawMessage(`{}`)
	}
	if in.Schedule == "" {
		in.Schedule = "@hourly"
	}
	// Validate the config by building the thing it configures. A connector that
	// cannot be opened is a source that will fail on a schedule at 3am instead
	// of in the form the operator is looking at.
	if isPlugin(in.Kind) {
		if _, err := Open(in.Kind, in.Config, sourceSecrets{v: s.vault, kind: in.Kind, name: in.Name}); err != nil {
			httpErr(w, http.StatusUnprocessableEntity, "that configuration is not valid: "+Scrub(err.Error()))
			return
		}
	}

	var id string
	err := s.db.QueryRowContext(r.Context(),
		`INSERT INTO builder_sources (kind, name, direction, config, namespace, schedule, enabled)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		in.Kind, in.Name, direction, []byte(in.Config),
		in.Namespace, in.Schedule, in.Enabled).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "builder_sources_uniq") {
			httpErr(w, http.StatusConflict, "a source of that kind and name already exists")
			return
		}
		s.log.Error("create source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not create the source")
		return
	}
	s.log.Info("source created", "kind", in.Kind, "name", in.Name, "enabled", in.Enabled)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type patchReq struct {
	Namespace *string `json:"namespace"`
	Schedule  *string `json:"schedule"`
	// Renaming matters once an integration can be configured more than once:
	// two RSS feeds both called "rss" are indistinguishable in the list.
	Name    *string          `json:"name"`
	Enabled *bool            `json:"enabled"`
	Config  *json.RawMessage `json:"config"`
}

func (s *Store) handlePatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in patchReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	if in.Name != nil {
		trimmed := strings.TrimSpace(*in.Name)
		if trimmed == "" {
			httpErr(w, http.StatusUnprocessableEntity, "a source needs a name")
			return
		}
		if len(trimmed) > maxNameBytes {
			httpErr(w, http.StatusUnprocessableEntity, "that name is too long — keep it under 200 characters")
			return
		}
		in.Name = &trimmed
	}
	if in.Namespace != nil && !strings.HasSuffix(*in.Namespace, ":project") {
		httpErr(w, http.StatusUnprocessableEntity,
			"a source must collect into a project brain, not an agent's private one")
		return
	}

	// COALESCE so an absent field means "leave it", not "set it to zero". A
	// PATCH that blanked the schedule because the form only sent `enabled`
	// would silently reset every source it touched.
	res, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_sources SET
		     name      = COALESCE($6, name),
		     namespace = COALESCE($2, namespace),
		     schedule  = COALESCE($3, schedule),
		     enabled   = COALESCE($4, enabled),
		     config    = COALESCE($5, config),
		     -- Turning a source on should collect promptly rather than at the
		     -- end of whatever interval it was parked on.
		     next_run_at = CASE WHEN $4::boolean IS TRUE AND NOT enabled
		                        THEN now() ELSE next_run_at END,
		     updated_at = now()
		   WHERE id = $1`,
		id, in.Namespace, in.Schedule, in.Enabled, rawOrNil(in.Config), in.Name)
	if err != nil {
		s.log.Error("patch source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not update the source")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such source")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func rawOrNil(m *json.RawMessage) any {
	if m == nil || len(*m) == 0 {
		return nil
	}
	return []byte(*m)
}

func (s *Store) handleDelete(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.ExecContext(r.Context(),
		`DELETE FROM builder_sources WHERE id = $1`, chi.URLParam(r, "id"))
	if err != nil {
		s.log.Error("delete source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not delete the source")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such source")
		return
	}
	// The memories it collected are deliberately left in the brain. They are
	// what the project knows; deleting the pipe that carried them is not a
	// statement that the knowledge was wrong.
	w.WriteHeader(http.StatusNoContent)
}

// handleRefresh runs one source now. This is the "does my configuration work?"
// path, and being unable to test a source before trusting it to a schedule is
// how a broken one runs unnoticed until somebody asks why the brain is stale.
func (s *Store) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var kind, name string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT kind, name FROM builder_sources WHERE id = $1`,
		chi.URLParam(r, "id")).Scan(&kind, &name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such source")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not read the source")
		return
	}
	if err := s.RefreshNow(r.Context(), kind, name); err != nil {
		// 200 with the error in the body, not 500: the request succeeded, the
		// refresh is what failed, and the operator needs to read why. A 500
		// here would be indistinguishable from the server falling over.
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": Scrub(err.Error())})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type runView struct {
	ID        string     `json:"id"`
	Status    string     `json:"status"`
	Trigger   string     `json:"trigger"`
	RowsRead  int        `json:"rowsRead"`
	Truncated bool       `json:"truncated"`
	Error     string     `json:"error"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
}

// handleRuns is the history a single last_error cannot give: a source that
// fails at 03:00 and succeeds at 04:00 looks like it has always been fine.
func (s *Store) handleRuns(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, status, trigger, rows_read, truncated, error, started_at, ended_at
		   FROM builder_source_runs WHERE source_id = $1
		  ORDER BY started_at DESC LIMIT 50`, chi.URLParam(r, "id"))
	if err != nil {
		s.log.Error("list source runs", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not read the run history")
		return
	}
	defer rows.Close()

	out := []runView{}
	for rows.Next() {
		var v runView
		if err := rows.Scan(&v.ID, &v.Status, &v.Trigger, &v.RowsRead,
			&v.Truncated, &v.Error, &v.StartedAt, &v.EndedAt); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the run history")
			return
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": out})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// normalizeDirection maps the request's value onto the two the schema allows.
//
// Anything unrecognised becomes a collector rather than an error: "source" is
// what every row was before migration 0019 and what every existing client
// means by omitting the field. Rejecting an unknown value here would break
// those clients to guard against a typo the CHECK constraint already catches.
func normalizeDirection(d string) string {
	if d == "actor" {
		return "actor"
	}
	return "source"
}
