package brain

import "regexp"

// Credential scrubbing on the way into the brain.
//
// Rule 34: a secret is referenced by name and never copied. The vault enforces
// that for values an agent asks for by name. Document ingestion is the hole in
// it — nobody vets an uploaded file, and the files an operator uploads to
// explain a system are exactly the ones with a connection string in an example
// block or a .env pasted into an appendix.
//
// What makes that worse than an ordinary leak is where it lands. A document
// goes into the PROJECT brain, which every agent holds a read grant on, and a
// recalled chunk is quoted verbatim into chat replies and PR descriptions. One
// unredacted line in an uploaded runbook becomes a credential in a dozen
// transcripts, and `forget` marks the memory invalid without unsaying any of it.
//
// So the patterns are blunt on purpose: redacting a harmless string occasionally
// costs a slightly worse chunk, and the alternative costs somebody's password.
//
// Deliberately NOT the "any long token is a secret" rule that query-output
// redaction uses. A spec document legitimately contains base64 examples, hashes
// and long identifiers, and blanking all of them would leave a reference
// nobody can read. Here the pattern has to say what it thinks the thing IS.
var (
	// A URL carrying credentials: postgres://user:password@host/db.
	dsnCreds = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://[^:/@\s]+):[^@\s]*@`)

	// key = value form, which is how .env files, libpq DSNs, YAML and config
	// appendices all write one.
	kvCreds = regexp.MustCompile(`(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|auth|authorization|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)`)

	// Vendor-prefixed keys that are unambiguous on sight.
	vendorKeys = regexp.MustCompile(`\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b`)

	// A JWT: three base64url segments separated by dots.
	jwtToken = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`)

	// A PEM private key, collapsed to a note that one was here.
	pemBlock = regexp.MustCompile(`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`)
)

const redacted = "[redacted]"

// scrubCredentials removes credential-shaped text from a document before any
// of it becomes a memory.
//
// Called once on the WHOLE extracted document rather than per chunk: a key that
// straddles a chunk boundary matches no pattern in either half.
func scrubCredentials(s string) string {
	if s == "" {
		return s
	}
	s = pemBlock.ReplaceAllString(s, "[redacted private key]")
	s = dsnCreds.ReplaceAllString(s, "$1:"+redacted+"@")
	s = kvCreds.ReplaceAllString(s, "$1$2"+redacted)
	s = vendorKeys.ReplaceAllString(s, redacted)
	s = jwtToken.ReplaceAllString(s, redacted)
	return s
}
