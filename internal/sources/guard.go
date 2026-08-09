// Package sources runs saved read-only queries against real databases on a
// schedule and retains the rendered result as project memory.
//
// This file is the part that has to be right. A source holds a credential for
// somebody's production database, so the query it runs is treated as hostile
// input even though an operator typed it: the operator who typed it is not
// necessarily the one whose database it reaches.
//
// Read-only is enforced at four independent layers, because any one of them can
// be wrong:
//
//  1. ValidateReadOnly, here — a single statement that begins SELECT or WITH,
//     with nothing data-modifying hidden in it.
//  2. A READ ONLY transaction — Postgres itself refuses every write, whatever
//     this file failed to notice. This is the layer that actually guarantees it.
//  3. statement_timeout and a row cap — see sql.go.
//  4. A read-only database role in the DSN, which is the operator's job and the
//     only layer that also survives a bug in pgx.
//
// Layer 1 exists to give a clear error at save time instead of a confusing one
// at 03:00, and to catch the things layer 2 permits — pg_read_file is a *read*,
// so a READ ONLY transaction is perfectly happy to hand back /etc/passwd.
package sources

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// forbidden are tokens that must not appear in a source query.
//
// The list is deliberately short. It is NOT trying to enumerate everything
// dangerous in SQL — it targets only what can hide INSIDE a legal single
// SELECT, because "starts with SELECT" plus "one statement" already makes
// TRUNCATE, SET, COMMIT and friends unreachable. Listing those too would buy
// nothing and cost false positives on ordinary column names.
//
// What is left is real:
//
//   - Data-modifying CTEs. `WITH x AS (INSERT INTO t ... RETURNING *) SELECT`
//     is a legal statement beginning with WITH, and it writes.
//   - SELECT ... INTO, which creates a table.
//   - Functions that read the server's filesystem or reach another host.
//     A READ ONLY transaction allows all of these: they are reads.
//   - Sequence functions, which mutate without being a write statement.
var forbidden = []string{
	"insert", "update", "delete", "merge", "upsert",
	"into",
	"nextval", "setval",
	"dblink", "dblink_exec", "postgres_fdw_handler",
	"pg_read_file", "pg_read_binary_file", "pg_stat_file", "pg_ls_dir",
	"lo_import", "lo_export",
	"pg_sleep", "pg_sleep_for", "pg_sleep_until",
	"pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf",
	"pg_rotate_logfile", "pg_read_server_files", "pg_execute_server_program",
}

// identifier characters, for whole-word matching. Underscore is included so
// `array_set` is one token and never matches a bare `set`.
var wordRe = regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_$]*`)

// ValidateReadOnly checks that q is a single, read-only SELECT and returns it
// trimmed of a trailing semicolon.
//
// It reports the FIRST problem it finds rather than a list: an operator fixing
// a query wants one thing to change, and a validator that says "and also"
// tends to be argued with rather than obeyed.
func ValidateReadOnly(q string) (string, error) {
	q = strings.TrimSpace(q)
	if q == "" {
		return "", errors.New("the query is empty")
	}
	if len(q) > 20000 {
		return "", errors.New("the query is longer than 20000 characters")
	}

	code, err := stripLiteralsAndComments(q)
	if err != nil {
		return "", err
	}

	// One statement. A semicolon with anything after it is a second statement,
	// and a second statement is how every "but it starts with SELECT" bypass
	// works. Checked against `code`, so a semicolon inside a string literal or
	// a comment is not mistaken for a separator.
	if i := strings.IndexByte(code, ';'); i >= 0 {
		if strings.TrimSpace(code[i+1:]) != "" {
			return "", errors.New("only a single statement is allowed; found more than one")
		}
		code = code[:i]
		q = trimTrailingSemicolon(q)
	}

	words := wordRe.FindAllString(code, -1)
	if len(words) == 0 {
		return "", errors.New("the query has no statement in it")
	}

	switch strings.ToLower(words[0]) {
	case "select":
	case "with":
		// Allowed, but it is the one prefix that can legally introduce a write,
		// so the token scan below is what makes it safe rather than this case.
	default:
		return "", fmt.Errorf("only SELECT is allowed; this query starts with %q", strings.ToUpper(words[0]))
	}

	deny := make(map[string]bool, len(forbidden))
	for _, f := range forbidden {
		deny[f] = true
	}
	for _, w := range words {
		if lw := strings.ToLower(w); deny[lw] {
			return "", fmt.Errorf("%q is not allowed in a source query", strings.ToUpper(lw))
		}
	}
	return strings.TrimSpace(q), nil
}

// stripLiteralsAndComments returns q with string literals blanked and comments
// removed, so keyword scanning sees only code.
//
// Blanking rather than deleting keeps token boundaries intact: deleting the
// literal in `a'x'b` would produce the single token `ab`.
//
// Two constructs are refused outright instead of parsed:
//
//   - Dollar quoting ($$ ... $$). It exists to embed a function body without
//     escaping, which is precisely the thing a metrics query never needs and an
//     attacker always wants.
//   - E'' escape strings, where a backslash escapes the closing quote. Parsing
//     them correctly means knowing the server's standard_conforming_strings
//     setting, which this process does not; guessing wrong mis-parses the rest
//     of the statement, and mis-parsing is how a scanner gets walked past.
func stripLiteralsAndComments(q string) (string, error) {
	var b strings.Builder
	b.Grow(len(q))
	r := []rune(q)

	for i := 0; i < len(r); i++ {
		c := r[i]
		switch {
		case c == '-' && i+1 < len(r) && r[i+1] == '-':
			for i < len(r) && r[i] != '\n' {
				i++
			}
			b.WriteByte(' ')

		case c == '/' && i+1 < len(r) && r[i+1] == '*':
			// Postgres block comments nest, so a naive scan to the first */
			// stops inside a comment that is still open.
			depth, j := 1, i+2
			for j < len(r) && depth > 0 {
				switch {
				case r[j] == '/' && j+1 < len(r) && r[j+1] == '*':
					depth, j = depth+1, j+2
				case r[j] == '*' && j+1 < len(r) && r[j+1] == '/':
					depth, j = depth-1, j+2
				default:
					j++
				}
			}
			if depth != 0 {
				return "", errors.New("the query has an unterminated /* comment")
			}
			i = j - 1
			b.WriteByte(' ')

		case c == '\'':
			// An E immediately before the quote makes this an escape string.
			if prev := lastWritten(&b); prev == 'e' || prev == 'E' {
				return "", errors.New("E'' escape strings are not allowed in a source query")
			}
			j := i + 1
			for j < len(r) {
				if r[j] == '\'' {
					if j+1 < len(r) && r[j+1] == '\'' { // '' is a literal quote
						j += 2
						continue
					}
					break
				}
				j++
			}
			if j >= len(r) {
				return "", errors.New("the query has an unterminated string literal")
			}
			i = j
			b.WriteString("''")

		case c == '"':
			j := i + 1
			for j < len(r) {
				if r[j] == '"' {
					if j+1 < len(r) && r[j+1] == '"' {
						j += 2
						continue
					}
					break
				}
				j++
			}
			if j >= len(r) {
				return "", errors.New("the query has an unterminated quoted identifier")
			}
			i = j
			// Blanked to a placeholder token: a column may legally be named
			// "delete", and quoting it is how you say you mean the name.
			b.WriteString("id_")

		case c == '$':
			// $1 is a parameter placeholder and harmless; $$ or $tag$ is a
			// dollar-quoted string and is not.
			j := i + 1
			for j < len(r) && (r[j] == '_' || isAlnum(r[j])) {
				j++
			}
			if j < len(r) && r[j] == '$' {
				return "", errors.New("dollar-quoted strings are not allowed in a source query")
			}
			b.WriteRune(c)

		default:
			b.WriteRune(c)
		}
	}
	return b.String(), nil
}

func lastWritten(b *strings.Builder) rune {
	s := b.String()
	if s == "" {
		return 0
	}
	return rune(s[len(s)-1])
}

func isAlnum(r rune) bool {
	return r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z'
}

func trimTrailingSemicolon(q string) string {
	q = strings.TrimSpace(q)
	for strings.HasSuffix(q, ";") {
		q = strings.TrimSpace(strings.TrimSuffix(q, ";"))
	}
	return q
}
