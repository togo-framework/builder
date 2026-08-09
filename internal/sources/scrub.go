package sources

import (
	"regexp"
	"strings"
)

// The vault's whole contract is that a credential is referenced by name and
// never copied anywhere (Rule 34). A source runner holds a live token in memory,
// so it is a place that can leak one, and it has two ways to do it that are easy
// to miss:
//
//   - An error. An HTTP client that fails mid-request will happily quote the
//     request it was making, headers included, and that string is otherwise
//     headed straight for a log line.
//   - The result itself. A README with a key checked into it becomes text that
//     is retained as a memory an agent will quote back into a chat reply.
//
// Both are handled by blunt pattern matching. Blunt is correct here: redacting a
// harmless number occasionally is a cosmetic problem, and printing somebody's
// production token is not.

var (
	// A URL with credentials: https://user:token@host/path.
	dsnCreds = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://[^:/@\s]+):[^@\s]*@`)

	// Keyword/value form: password=hunter2, and its friends.
	kvCreds = regexp.MustCompile(`(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)`)

	// Vendor-prefixed keys that are unambiguous on sight.
	vendorKeys = regexp.MustCompile(`\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b`)

	// A JWT: three base64url segments separated by dots.
	jwt = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`)

	// A PEM block, collapsed to its header.
	pemBlock = regexp.MustCompile(`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`)
)

const redacted = "[redacted]"

// Scrub removes credentials from a string that is about to be logged or stored.
//
// Always call this on an error before it reaches a log line or an API response.
func Scrub(s string) string {
	if s == "" {
		return s
	}
	s = pemBlock.ReplaceAllString(s, "[redacted private key]")
	s = dsnCreds.ReplaceAllString(s, "$1:"+redacted+"@")
	s = kvCreds.ReplaceAllString(s, "$1$2"+redacted)
	s = vendorKeys.ReplaceAllString(s, redacted)
	s = jwt.ReplaceAllString(s, redacted)
	return s
}

// ScrubErr is Scrub for an error, returning "" for nil.
func ScrubErr(err error) string {
	if err == nil {
		return ""
	}
	return Scrub(err.Error())
}

// Redact cleans fetched text before it is retained as a memory.
//
// This is Scrub plus one extra rule: a long unbroken run of key-shaped
// characters is redacted on sight, even with nothing around it to say what it
// is. A bare 40-character token in a code fence is not documentation.
//
// The threshold is 32 because that is where real values stop looking like them:
// a version string and a file path are comfortably below it, while an API key, a
// session token and a password hash are all above.
//
// `=` is excluded from the body of the run and allowed only as trailing base64
// padding, so that `api_key=<value>` matches the value rather than swallowing
// the `api_key=` label along with it.
var longToken = regexp.MustCompile(`\b[A-Za-z0-9+/_-]{32,}={0,2}`)

// A git SHA, a uuid and a checksum are long, and they are identifiers rather
// than credentials. Redacting them would make a commit log unreadable, which is
// most of what this package ingests.
var (
	uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	hexRe  = regexp.MustCompile(`^[0-9a-f]{32,64}$`)
)

// Redact returns text safe to retain.
func Redact(s string) string {
	s = Scrub(s)
	return longToken.ReplaceAllStringFunc(s, func(tok string) string {
		// Keep things that are long but obviously not secret: a uuid, a hex
		// digest or commit sha, a run of digits, and a run of one repeated
		// character (a separator rule).
		if uuidRe.MatchString(tok) || hexRe.MatchString(tok) || isAllDigits(tok) || isRepeated(tok) {
			return tok
		}
		return redacted
	})
}

// LooksLikeCredential reports whether a value that is supposed to be a NAME is
// in fact a secret somebody pasted in.
//
// This is the check behind "uses the vault's token, never a token pasted into
// the config": a config field holding a credential is rejected at parse time
// rather than quietly working, because the version that quietly works is the one
// that ends up in a git repository.
func LooksLikeCredential(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	if vendorKeys.MatchString(s) || jwt.MatchString(s) || pemBlock.MatchString(s) {
		return true
	}
	// A vault NAME is a short handle an operator typed: "github-token". Anything
	// long and high-entropy in that slot is a value, not a name.
	if len(s) >= 32 && longToken.MatchString(s) && !uuidRe.MatchString(s) {
		return true
	}
	return false
}

func isAllDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

func isRepeated(s string) bool {
	return len(s) > 0 && strings.Count(s, string(s[0])) == len(s)
}
