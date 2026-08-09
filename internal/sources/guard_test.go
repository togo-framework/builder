package sources

import "testing"

func TestValidateReadOnlyAccepts(t *testing.T) {
	ok := []string{
		`SELECT count(*) FROM users`,
		`select count(*) from users;`,
		`  SELECT 1  `,
		`SELECT count(*) AS total FROM users WHERE created_at > now() - interval '7 days'`,
		// A WITH prefix is legal when nothing in it writes.
		`WITH recent AS (SELECT * FROM users WHERE created_at > now() - interval '1 day')
		 SELECT count(*) FROM recent`,
		// Keywords inside string literals are data, not code. A rendering
		// query saying the word "update" must not be refused.
		`SELECT 'last update' AS label, count(*) FROM events`,
		`SELECT 'it''s fine' AS label`,
		// A column legitimately named `delete`, quoted to say so.
		`SELECT "delete" FROM flags`,
		// Comments are stripped, not parsed.
		`SELECT count(*) -- how many?
		 FROM users`,
		`SELECT /* a /* nested */ comment */ count(*) FROM users`,
		// $1 is a placeholder, not dollar quoting.
		`SELECT count(*) FROM users WHERE tenant = $1`,
		// `offset` and `array_set` must not trip whole-word matching.
		`SELECT id FROM users ORDER BY id LIMIT 10 OFFSET 5`,
	}
	for _, q := range ok {
		if _, err := ValidateReadOnly(q); err != nil {
			t.Errorf("expected to accept\n  %s\ngot: %v", q, err)
		}
	}
}

func TestValidateReadOnlyRejects(t *testing.T) {
	bad := []struct{ name, q string }{
		{"empty", ``},
		{"whitespace", `   `},
		{"insert", `INSERT INTO users (email) VALUES ('a@b.c')`},
		{"update", `UPDATE users SET admin = true`},
		{"delete", `DELETE FROM users`},
		{"drop", `DROP TABLE users`},
		{"truncate", `TRUNCATE users`},

		// The bypass this whole function exists for: a legal-looking SELECT
		// with a second statement stapled on.
		{"second statement", `SELECT 1; DROP TABLE users`},
		{"second statement, no space", `SELECT 1;DELETE FROM users`},
		{"comment hiding a second statement", `SELECT 1; -- ok
		                                       DROP TABLE users`},

		// A data-modifying CTE is a write that begins with WITH.
		{"writable CTE", `WITH x AS (INSERT INTO audit (a) VALUES (1) RETURNING *) SELECT * FROM x`},
		{"deleting CTE", `WITH x AS (DELETE FROM users RETURNING *) SELECT count(*) FROM x`},

		// SELECT INTO creates a table.
		{"select into", `SELECT * INTO copy_of_users FROM users`},

		// Reads a READ ONLY transaction is perfectly happy to allow.
		{"pg_read_file", `SELECT pg_read_file('/etc/passwd')`},
		{"pg_ls_dir", `SELECT pg_ls_dir('/')`},
		{"lo_export", `SELECT lo_export(1, '/tmp/x')`},
		{"dblink", `SELECT * FROM dblink('host=evil', 'SELECT 1') AS t(a int)`},
		{"nextval", `SELECT nextval('users_id_seq')`},
		{"pg_sleep", `SELECT pg_sleep(3600)`},
		{"terminate backend", `SELECT pg_terminate_backend(1)`},

		// Constructs refused rather than parsed.
		{"dollar quoting", `SELECT $$ DROP TABLE users $$`},
		{"tagged dollar quoting", `SELECT $tag$ anything $tag$`},
		{"E-string", `SELECT E'\\' ; DROP TABLE users --'`},

		// Malformed input must fail closed, not fall through.
		{"unterminated string", `SELECT 'abc`},
		{"unterminated comment", `SELECT 1 /* nope`},
		{"unterminated identifier", `SELECT "abc`},

		{"not a select", `EXPLAIN ANALYZE SELECT 1`},
		{"call", `CALL do_something()`},
	}
	for _, c := range bad {
		if _, err := ValidateReadOnly(c.q); err == nil {
			t.Errorf("%s: expected rejection of\n  %s", c.name, c.q)
		}
	}
}

func TestValidateReadOnlyStripsTrailingSemicolon(t *testing.T) {
	got, err := ValidateReadOnly(`SELECT 1;`)
	if err != nil {
		t.Fatal(err)
	}
	if got != `SELECT 1` {
		t.Fatalf("got %q, want %q", got, `SELECT 1`)
	}
}

// A semicolon inside a literal is data, and must not be read as a separator —
// the mirror image of the bypass test above.
func TestSemicolonInsideLiteralIsNotASeparator(t *testing.T) {
	if _, err := ValidateReadOnly(`SELECT 'a;b' AS x`); err != nil {
		t.Fatalf("expected accept, got %v", err)
	}
}

func TestScrubRemovesCredentials(t *testing.T) {
	cases := []struct{ in, mustNotContain string }{
		{`failed to connect to postgres://app:hunter2@db.internal:5432/prod`, "hunter2"},
		{`dial error: host=db user=app password=s3cr3t dbname=prod`, "s3cr3t"},
		{`token: sk-abcdefghijklmnopqrstuvwxyz012345`, "sk-abcdefghijklmnop"},
		{`ghp_abcdefghijklmnopqrstuvwxyz0123456789`, "ghp_abcdefghijklmnopqrst"},
		{`Authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk`, "dBjftJeZ4CVPmB92K27uhbUJU1p1r"},
		{`AKIAIOSFODNN7EXAMPLE`, "AKIAIOSFODNN7EXAMPLE"},
	}
	for _, c := range cases {
		got := Scrub(c.in)
		if contains(got, c.mustNotContain) {
			t.Errorf("Scrub(%q) = %q — still contains %q", c.in, got, c.mustNotContain)
		}
	}
}

// The DSN is the one secret this package holds, so the error path that quotes
// it is the leak that matters most.
func TestScrubKeepsTheUsefulPartOfADSNError(t *testing.T) {
	got := Scrub(`failed to connect to postgres://app:hunter2@db.internal:5432/prod`)
	if !contains(got, "db.internal") {
		t.Errorf("scrubbing removed the host too: %q", got)
	}
}

func TestRedactLeavesMetricsAlone(t *testing.T) {
	in := "users — 1 row(s)\ncount: 12431\nsignups_this_week: 84"
	if got := Redact(in); got != in {
		t.Errorf("Redact mangled an ordinary metric:\n got %q\nwant %q", got, in)
	}
}

func TestRedactRemovesBareTokens(t *testing.T) {
	in := "- email=a@b.c  api_key=9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c"
	got := Redact(in)
	if contains(got, "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c") {
		t.Errorf("Redact left a bare key-shaped token: %q", got)
	}
}

// A uuid is not a secret and shows up in real metric output constantly.
func TestRedactKeepsUUIDs(t *testing.T) {
	in := "id=6f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
	if got := Redact(in); got != in {
		t.Errorf("Redact removed a uuid: %q", got)
	}
}

func contains(s, sub string) bool {
	return len(sub) > 0 && len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
