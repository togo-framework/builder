// Package seeders creates the rows a fresh project cannot boot usefully without.
//
// The admin seeder exists because togo ships no way to get a first admin:
// there is no `togo make:admin`, no ADMIN_EMAIL convention, and no first-user
// rule anywhere in togo-framework/auth. The documented alternative, the
// auth-dev plugin, sets roles on the in-memory Identity only — the users row
// keeps an empty roles column — and it refuses to run at APP_ENV=production.
// So a real deployment has no path to an administrator at all.
package seeders

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/togo-framework/builder/internal/authz"
)

// ErrNoPassword is returned when no password was supplied.
//
// There is deliberately no default and no generated-and-printed password. A
// well-known default admin password is the single most reliable way to ship a
// compromised deployment, and printing a generated one puts a live credential
// into CI logs and shell history.
var ErrNoPassword = errors.New(
	"no admin password supplied: pipe it on stdin (`… | togo-builder seed admin`) " +
		"or set BUILDER_ADMIN_PASSWORD for non-interactive use")

// AdminOptions configures the seed.
type AdminOptions struct {
	Email string
	// Password is the plaintext to hash. Never logged, never defaulted.
	Password string
	// Force rewrites the password and role of an existing row. Off by default
	// so that re-running a scaffold cannot silently reset a live account.
	Force bool
}

// AdminResult reports what happened, for the CLI to print.
type AdminResult struct {
	Email    string
	Created  bool
	Updated  bool
	Skipped  bool
	UserID   string
	GrantedN int
}

// SeedAdmin idempotently ensures an administrator exists.
//
// Idempotency is by email. Re-running is safe: without Force an existing row is
// left exactly as it is, including its password, so `togo-builder new` can be
// re-run over a project without disturbing accounts.
func SeedAdmin(ctx context.Context, db *sql.DB, opts AdminOptions) (AdminResult, error) {
	var res AdminResult

	email := strings.ToLower(strings.TrimSpace(opts.Email))
	if email == "" {
		email = strings.ToLower(strings.TrimSpace(os.Getenv("BUILDER_ADMIN_EMAIL")))
	}
	if email == "" {
		return res, errors.New("no admin email: pass --email or set BUILDER_ADMIN_EMAIL")
	}
	if !strings.Contains(email, "@") {
		return res, fmt.Errorf("not an email address: %q", email)
	}
	res.Email = email

	// Enumerated, never "*". Upstream Can() is an exact match (auth.go:89), so
	// a row granting "*" would look omnipotent and be powerless.
	perms := authz.Expand(authz.RoleAdmin)
	res.GrantedN = len(perms)
	permCSV := strings.Join(perms, ",")

	var existingID string
	err := db.QueryRowContext(ctx, `SELECT id FROM users WHERE lower(email) = $1`, email).Scan(&existingID)
	switch {
	case err == nil && !opts.Force:
		// Row exists. Re-assert role and permissions — which is what makes this
		// safe to re-run after the permission vocabulary grows — but never
		// touch the password.
		if _, err := db.ExecContext(ctx,
			`UPDATE users SET roles = $1, permissions = $2 WHERE id = $3`,
			authz.RoleAdmin, permCSV, existingID); err != nil {
			return res, fmt.Errorf("refresh admin grants: %w", err)
		}
		res.UserID, res.Skipped = existingID, true
		return res, nil

	case err != nil && !errors.Is(err, sql.ErrNoRows):
		return res, fmt.Errorf("look up admin: %w", err)
	}

	password := opts.Password
	if password == "" {
		password = os.Getenv("BUILDER_ADMIN_PASSWORD")
	}
	if strings.TrimSpace(password) == "" {
		return res, ErrNoPassword
	}
	if len([]rune(password)) < 12 {
		return res, errors.New("admin password must be at least 12 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return res, fmt.Errorf("hash admin password: %w", err)
	}

	if existingID != "" { // Force path.
		if _, err := db.ExecContext(ctx,
			`UPDATE users SET password_hash = $1, roles = $2, permissions = $3 WHERE id = $4`,
			string(hash), authz.RoleAdmin, permCSV, existingID); err != nil {
			return res, fmt.Errorf("update admin: %w", err)
		}
		res.UserID, res.Updated = existingID, true
		return res, nil
	}

	id, err := newID()
	if err != nil {
		return res, err
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO users (id, email, password_hash, roles, permissions, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, email, string(hash), authz.RoleAdmin, permCSV,
		time.Now().UTC().Format(time.RFC3339)); err != nil {
		return res, fmt.Errorf("insert admin: %w", err)
	}
	res.UserID, res.Created = id, true
	return res, nil
}

func newID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate user id: %w", err)
	}
	return hex.EncodeToString(b), nil
}
