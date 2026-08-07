// Package vault stores the credentials agents need, encrypted at rest, with
// every reveal audited.
//
// Two design choices are deliberate departures from cabrain's vault, which was
// the obvious thing to reuse:
//
//   - Reveal is its own grant. cabrain requires WRITE access on a brain to
//     reveal a secret, so a read-only agent cannot read a credential — the
//     permission is backwards. Here can_reveal is separate from can_list and
//     from any write capability.
//   - Every reveal writes an audit row in the same transaction as the decrypt,
//     or the reveal does not happen. cabrain emits only a transient event, so
//     there is no durable answer to "who read this key?".
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/togo-framework/togo"
)

// KeySize is the AES-256 key length in bytes.
const KeySize = 32

// ciphertextVersion prefixes every stored blob so the format can change without
// a migration guessing game.
const ciphertextVersion = "v1"

// ErrNoKey is returned when BUILDER_VAULT_KEY is absent.
var ErrNoKey = errors.New("BUILDER_VAULT_KEY is not set")

// Service is the vault.
type Service struct {
	key []byte
}

// New builds the vault from BUILDER_VAULT_KEY.
//
// A missing or malformed key is fatal at boot rather than at first use: an app
// that starts with a broken vault fails later, inside an agent run, where the
// cause is far harder to see.
func New(k *togo.Kernel) (*Service, error) {
	raw := os.Getenv("BUILDER_VAULT_KEY")
	if err := ValidateVaultKey(raw); err != nil {
		return nil, fmt.Errorf("vault: %w", err)
	}
	key, err := decodeKey(raw)
	if err != nil {
		return nil, fmt.Errorf("vault: %w", err)
	}
	return &Service{key: key}, nil
}

// ValidateVaultKey reports whether raw is a usable 32-byte key.
//
// Accepts standard or URL-safe base64, with or without padding, or 64 hex
// characters — because operators generate these with whichever of
// `openssl rand -base64 32` or `openssl rand -hex 32` they remember.
func ValidateVaultKey(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ErrNoKey
	}
	key, err := decodeKey(raw)
	if err != nil {
		return err
	}
	if len(key) != KeySize {
		return fmt.Errorf("key must be %d bytes, got %d", KeySize, len(key))
	}
	return nil
}

func decodeKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding, base64.RawStdEncoding,
		base64.URLEncoding, base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(raw); err == nil && len(b) == KeySize {
			return b, nil
		}
	}
	if len(raw) == KeySize*2 {
		b := make([]byte, KeySize)
		if _, err := fmt.Sscanf(strings.ToLower(raw), "%x", &b); err == nil {
			return b, nil
		}
	}
	return nil, errors.New("key is neither 32-byte base64 nor 64 hex characters")
}

// Seal encrypts plaintext under the row's identity.
//
// aad binds the ciphertext to the row it belongs to (scope:agent_slug:name).
// AES-GCM authenticates it, so a ciphertext copied into a different row fails
// to decrypt — which makes row-swapping a non-attack rather than a privilege
// escalation.
func (s *Service) Seal(plaintext []byte, aad string) (string, error) {
	gcm, err := s.gcm()
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	sealed := gcm.Seal(nil, iv, plaintext, []byte(aad))
	// Split the tag out so the stored form is self-describing.
	tagStart := len(sealed) - gcm.Overhead()
	return strings.Join([]string{
		ciphertextVersion,
		base64.RawStdEncoding.EncodeToString(iv),
		base64.RawStdEncoding.EncodeToString(sealed[tagStart:]),
		base64.RawStdEncoding.EncodeToString(sealed[:tagStart]),
	}, "."), nil
}

// Open decrypts a stored ciphertext. aad must match exactly what Seal was given.
func (s *Service) Open(stored, aad string) ([]byte, error) {
	parts := strings.Split(stored, ".")
	if len(parts) != 4 || parts[0] != ciphertextVersion {
		return nil, errors.New("malformed ciphertext")
	}
	iv, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("malformed ciphertext iv")
	}
	tag, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("malformed ciphertext tag")
	}
	ct, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return nil, errors.New("malformed ciphertext body")
	}
	gcm, err := s.gcm()
	if err != nil {
		return nil, err
	}
	// A wrong aad, a tampered body and a wrong key are indistinguishable here,
	// on purpose — the error must not tell an attacker which one they got right.
	out, err := gcm.Open(nil, iv, append(ct, tag...), []byte(aad))
	if err != nil {
		return nil, errors.New("decrypt failed")
	}
	return out, nil
}

// AAD builds the additional-authenticated-data string for a secret row.
func AAD(scope, agentSlug, name string) string {
	return scope + ":" + agentSlug + ":" + name
}

// Hint returns a non-reversible display form: sk-…a1b2.
func Hint(plaintext string) string {
	const tail = 4
	if len(plaintext) <= tail {
		return strings.Repeat("•", len(plaintext))
	}
	prefix := ""
	if i := strings.IndexByte(plaintext, '-'); i > 0 && i <= 4 {
		prefix = plaintext[:i+1]
	}
	return prefix + "…" + plaintext[len(plaintext)-tail:]
}

func (s *Service) gcm() (cipher.AEAD, error) {
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, fmt.Errorf("build cipher: %w", err)
	}
	return cipher.NewGCM(block)
}
