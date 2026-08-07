package seeders

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func open(t *testing.T) *sql.DB {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS users (
		id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
		roles text NOT NULL DEFAULT '', permissions text NOT NULL DEFAULT '', created_at text NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	db.Exec(`DELETE FROM users`)
	return db
}

func TestSeedAdminLive(t *testing.T) {
	db := open(t)
	ctx := context.Background()

	// 1. No password => refuses, and creates nothing.
	if _, err := SeedAdmin(ctx, db, AdminOptions{Email: "ops@example.com"}); !errors.Is(err, ErrNoPassword) {
		t.Fatalf("want ErrNoPassword, got %v", err)
	}
	var n int
	db.QueryRow(`SELECT count(*) FROM users`).Scan(&n)
	if n != 0 {
		t.Fatalf("a failed seed created %d rows", n)
	}

	// 2. Short password => refuses.
	if _, err := SeedAdmin(ctx, db, AdminOptions{Email: "ops@example.com", Password: "short"}); err == nil {
		t.Fatal("accepted a 5-char password")
	}

	// 3. Creates.
	r, err := SeedAdmin(ctx, db, AdminOptions{Email: "OPS@Example.com ", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatal(err)
	}
	if !r.Created {
		t.Fatal("expected Created")
	}
	if r.Email != "ops@example.com" {
		t.Fatalf("email not normalized: %q", r.Email)
	}

	var roles, perms, hash string
	db.QueryRow(`SELECT roles, permissions, password_hash FROM users WHERE email='ops@example.com'`).Scan(&roles, &perms, &hash)
	if roles != "admin" {
		t.Fatalf("roles=%q", roles)
	}
	if perms == "*" || perms == "" {
		t.Fatalf("permissions must be enumerated, got %q", perms)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte("correct-horse-battery")) != nil {
		t.Fatal("password does not verify")
	}

	// 4. Re-run is idempotent and must NOT change the password.
	r2, err := SeedAdmin(ctx, db, AdminOptions{Email: "ops@example.com", Password: "a-totally-different-one"})
	if err != nil {
		t.Fatal(err)
	}
	if !r2.Skipped {
		t.Fatal("expected Skipped on re-run")
	}
	var hash2 string
	db.QueryRow(`SELECT password_hash FROM users WHERE email='ops@example.com'`).Scan(&hash2)
	if hash2 != hash {
		t.Fatal("re-run silently reset the password")
	}

	db.QueryRow(`SELECT count(*) FROM users`).Scan(&n)
	if n != 1 {
		t.Fatalf("re-run created a duplicate: %d rows", n)
	}

	// 5. Force does rotate it.
	r3, err := SeedAdmin(ctx, db, AdminOptions{Email: "ops@example.com", Password: "a-totally-different-one", Force: true})
	if err != nil {
		t.Fatal(err)
	}
	if !r3.Updated {
		t.Fatal("expected Updated with Force")
	}
	db.QueryRow(`SELECT password_hash FROM users WHERE email='ops@example.com'`).Scan(&hash2)
	if bcrypt.CompareHashAndPassword([]byte(hash2), []byte("a-totally-different-one")) != nil {
		t.Fatal("Force did not rotate the password")
	}
}
