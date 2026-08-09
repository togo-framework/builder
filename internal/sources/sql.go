package sources

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"text/template"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Caps. A source exists to answer a question in one paragraph, so these are
// sized for that rather than for reporting. A query that wants more than this
// wants a dashboard, not a memory.
const (
	DefaultMaxRows   = 200
	MaxMaxRows       = 5000
	DefaultTimeoutMS = 10_000
	MaxTimeoutMS     = 60_000

	// The rendered text is one memory row that an agent pastes into its
	// context on every recall. Past a few KB it stops being a fact and starts
	// being a document that crowds out everything else the agent knows.
	MaxRenderedBytes = 8192
)

// SQLConfig is builder_sources.config for kind='sql'.
//
// It is the schema of record for that column: the migration stores jsonb
// precisely so this struct, and the validation below it, is the only place the
// shape is defined.
type SQLConfig struct {
	// DSNSecret is the NAME of a vault secret holding the connection string.
	// Never the connection string. A source row is ordinary table data — it is
	// in every backup and readable by anything with SELECT on the table.
	DSNSecret string `json:"dsnSecret"`

	// RunAs is the agent slug the reveal is audited under, and whose grant
	// decides whether the reveal is allowed at all.
	//
	// This is not decoration. builder_secret_grants.agent_slug is a foreign key
	// to builder_agents(slug), so a source can only run as an agent that
	// actually exists, and only if a human has granted that agent can_reveal on
	// this secret. Nothing in this package creates such a grant: widening who
	// can read a production credential is a human decision (Rule 34), and a
	// scheduler that could grant itself access would make the audit trail
	// meaningless.
	RunAs string `json:"runAs"`

	SQL string `json:"sql"`

	// Template renders rows to the text an agent quotes. Empty means the
	// built-in table rendering.
	Template string `json:"template"`

	MaxRows   int `json:"maxRows"`
	TimeoutMS int `json:"timeoutMs"`
}

// Revealer is the vault, narrowed to the one call this package makes.
//
// The interface exists so the runner cannot reach anything else in the vault by
// accident, and so tests can exercise it without a real secret. *vault.Store
// satisfies it.
type Revealer interface {
	RevealFor(ctx context.Context, name, agentSlug, runID string) (string, error)
}

// parseSQLConfig decodes and validates config, applying defaults and caps.
func parseSQLConfig(raw []byte) (SQLConfig, error) {
	var c SQLConfig
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, fmt.Errorf("config is not valid JSON: %w", err)
	}
	c.DSNSecret = strings.TrimSpace(c.DSNSecret)
	c.RunAs = strings.TrimSpace(c.RunAs)

	if c.DSNSecret == "" {
		return c, errors.New("config.dsnSecret is required (the NAME of a vault secret, not a connection string)")
	}
	// A connection string where a secret name belongs is worth catching loudly:
	// it means somebody pasted the credential into the row.
	if strings.Contains(c.DSNSecret, "://") || strings.Contains(c.DSNSecret, "@") {
		return c, errors.New("config.dsnSecret looks like a connection string; it must be the NAME of a vault secret")
	}
	if c.RunAs == "" {
		return c, errors.New("config.runAs is required: a reveal has to be audited against an agent")
	}

	q, err := ValidateReadOnly(c.SQL)
	if err != nil {
		return c, err
	}
	c.SQL = q

	switch {
	case c.MaxRows <= 0:
		c.MaxRows = DefaultMaxRows
	case c.MaxRows > MaxMaxRows:
		c.MaxRows = MaxMaxRows
	}
	switch {
	case c.TimeoutMS <= 0:
		c.TimeoutMS = DefaultTimeoutMS
	case c.TimeoutMS > MaxTimeoutMS:
		c.TimeoutMS = MaxTimeoutMS
	}
	return c, nil
}

// Result is one refresh's output.
type Result struct {
	Text      string
	RowsRead  int
	Truncated bool
}

// runSQL reveals the DSN, runs the query under every cap, and renders the rows.
//
// It never returns the DSN, never logs it, and scrubs anything it puts in an
// error — see scrub.go for why that is not paranoia.
func runSQL(ctx context.Context, cfg SQLConfig, name string, rev Revealer) (Result, error) {
	var out Result

	// The reveal is audited by the vault, in the same transaction as the
	// decrypt, and refused outright unless a human has granted cfg.RunAs
	// can_reveal on this secret.
	dsn, err := rev.RevealFor(ctx, cfg.DSNSecret, cfg.RunAs, "")
	if err != nil {
		return out, fmt.Errorf("reveal %q as %q: %s", cfg.DSNSecret, cfg.RunAs, ScrubErr(err))
	}
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return out, fmt.Errorf("vault secret %q is empty", cfg.DSNSecret)
	}
	if err := checkDriver(dsn); err != nil {
		return out, err
	}

	// A fresh pool per refresh, capped at one connection. Sources run hourly,
	// so there is nothing to pool, and a per-run connection means a source
	// pointed at a wedged database cannot hold one open until the app restarts.
	pool, err := sql.Open("pgx", dsn)
	if err != nil {
		return out, fmt.Errorf("open: %s", Scrub(err.Error()))
	}
	defer pool.Close()
	pool.SetMaxOpenConns(1)
	pool.SetConnMaxLifetime(time.Duration(cfg.TimeoutMS) * time.Millisecond)

	// The Go-side deadline is deliberately longer than statement_timeout.
	// statement_timeout should be what stops a slow query, because it produces
	// a real error the operator can read; this is the backstop for a database
	// that accepts the connection and then never answers at all.
	budget := time.Duration(cfg.TimeoutMS)*time.Millisecond + 5*time.Second
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()

	// READ ONLY is the layer that actually enforces read-only. Everything
	// ValidateReadOnly does is to produce a good error before we get here;
	// this is what makes a write impossible when that analysis is wrong.
	tx, err := pool.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelReadCommitted})
	if err != nil {
		return out, fmt.Errorf("begin read-only transaction: %s", Scrub(err.Error()))
	}
	defer func() { _ = tx.Rollback() }() // always: nothing here should commit

	// SET LOCAL dies with the transaction, so a pooled connection cannot carry
	// this setting into somebody else's query.
	if _, err := tx.ExecContext(ctx,
		fmt.Sprintf("SET LOCAL statement_timeout = %d", cfg.TimeoutMS)); err != nil {
		return out, fmt.Errorf("set statement_timeout: %s", Scrub(err.Error()))
	}

	rows, err := tx.QueryContext(ctx, cfg.SQL)
	if err != nil {
		return out, fmt.Errorf("query: %s", Scrub(err.Error()))
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return out, fmt.Errorf("columns: %s", Scrub(err.Error()))
	}

	// Read at most MaxRows+1: the extra row is how we know the query had more
	// to give without reading all of it.
	var records []map[string]any
	for rows.Next() {
		if len(records) >= cfg.MaxRows {
			out.Truncated = true
			break
		}
		cells := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range cells {
			ptrs[i] = &cells[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return out, fmt.Errorf("scan: %s", Scrub(err.Error()))
		}
		rec := make(map[string]any, len(cols))
		for i, c := range cols {
			rec[c] = normalise(cells[i])
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("read rows: %s", Scrub(err.Error()))
	}
	out.RowsRead = len(records)

	text, err := render(cfg.Template, name, cols, records, out.Truncated)
	if err != nil {
		return out, err
	}

	// Last gate before this becomes a memory an agent can quote.
	text = Redact(text)
	if len(text) > MaxRenderedBytes {
		text = text[:MaxRenderedBytes] + "\n… (truncated)"
	}
	out.Text = text
	return out, nil
}

// checkDriver refuses a DSN this process cannot run read-only.
//
// Only Postgres is supported, because pgx is already a dependency and adding a
// driver is `dependency_addition` — a must_ask. Refusing clearly beats handing
// a MySQL DSN to pgx and reporting whatever it says.
func checkDriver(dsn string) error {
	l := strings.ToLower(dsn)
	switch {
	case strings.HasPrefix(l, "postgres://"), strings.HasPrefix(l, "postgresql://"):
		return nil
	case strings.Contains(l, "host=") || strings.Contains(l, "dbname="):
		return nil // libpq keyword/value form
	case strings.HasPrefix(l, "mysql://"), strings.HasPrefix(l, "sqlserver://"),
		strings.HasPrefix(l, "mongodb://"), strings.HasPrefix(l, "file:"):
		return errors.New("only PostgreSQL sources are supported; adding a driver is a dependency decision")
	default:
		return errors.New("the vault secret does not look like a PostgreSQL connection string")
	}
}

// normalise makes driver values renderable. []byte is the one that matters:
// text/template prints it as a list of numbers.
func normalise(v any) any {
	switch t := v.(type) {
	case nil:
		return ""
	case []byte:
		return string(t)
	case time.Time:
		return t.UTC().Format(time.RFC3339)
	default:
		return v
	}
}

// render turns rows into the text an agent quotes.
func render(tmpl, name string, cols []string, records []map[string]any, truncated bool) (string, error) {
	data := map[string]any{
		"Name":      name,
		"Columns":   cols,
		"Rows":      records,
		"Count":     len(records),
		"Truncated": truncated,
	}
	if strings.TrimSpace(tmpl) == "" {
		return defaultRender(name, cols, records, truncated), nil
	}

	// text/template, not html/template: this is plain text for an agent to
	// read, and HTML escaping would turn `>` in a metric name into `&gt;`.
	// A template cannot call anything it is not given, so an operator-authored
	// template is data here, not code.
	t, err := template.New("source").Option("missingkey=zero").Parse(tmpl)
	if err != nil {
		return "", fmt.Errorf("template: %w", err)
	}
	var b strings.Builder
	if err := t.Execute(&b, data); err != nil {
		return "", fmt.Errorf("template: %w", err)
	}
	return strings.TrimSpace(b.String()), nil
}

func defaultRender(name string, cols []string, records []map[string]any, truncated bool) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s — %d row(s)", name, len(records))
	if truncated {
		// Said explicitly, because an agent quoting a truncated count as a
		// total is the most likely way this feature states a falsehood.
		b.WriteString(" (truncated at the row cap; there are more)")
	}
	b.WriteString("\n")

	if len(records) == 1 && len(cols) == 1 {
		// The overwhelmingly common shape: SELECT count(*). Render it as a
		// sentence rather than a one-cell table.
		fmt.Fprintf(&b, "%s: %v", cols[0], records[0][cols[0]])
		return strings.TrimSpace(b.String())
	}
	for _, rec := range records {
		keys := cols
		if len(keys) == 0 {
			for k := range rec {
				keys = append(keys, k)
			}
			sort.Strings(keys)
		}
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, fmt.Sprintf("%s=%v", k, rec[k]))
		}
		b.WriteString("- " + strings.Join(parts, "  ") + "\n")
	}
	return strings.TrimSpace(b.String())
}
