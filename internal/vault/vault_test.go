package vault

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
)

func newService(t *testing.T) *Service {
	t.Helper()
	key := make([]byte, KeySize)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	return &Service{key: key}
}

func TestSealOpenRoundTrip(t *testing.T) {
	s := newService(t)
	aad := AAD("agent", "impl-bot", "GITHUB_TOKEN")

	sealed, err := s.Seal([]byte("ghp_supersecret"), aad)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sealed, "ghp_supersecret") {
		t.Fatal("plaintext survived into the ciphertext")
	}
	if !strings.HasPrefix(sealed, ciphertextVersion+".") {
		t.Fatalf("stored form is not self-describing: %q", sealed)
	}
	if n := len(strings.Split(sealed, ".")); n != 4 {
		t.Fatalf("want 4 ciphertext parts, got %d", n)
	}

	got, err := s.Open(sealed, aad)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "ghp_supersecret" {
		t.Fatalf("round trip returned %q", got)
	}
}

// The property the whole vault design rests on: a ciphertext lifted out of one
// row and pasted into another must fail to decrypt. Without it, an attacker who
// can write a secrets row could read any secret by copying its ciphertext under
// a name they are granted.
func TestAADBindingDefeatsRowSwapping(t *testing.T) {
	s := newService(t)

	sealed, err := s.Seal([]byte("prod-database-password"), AAD("project", "", "PROD_DB"))
	if err != nil {
		t.Fatal(err)
	}

	swaps := []struct {
		name string
		aad  string
	}{
		{"different secret name", AAD("project", "", "HARMLESS_KEY")},
		{"different scope", AAD("agent", "", "PROD_DB")},
		{"different agent", AAD("agent", "attacker-bot", "PROD_DB")},
		{"empty aad", ""},
	}
	for _, sw := range swaps {
		t.Run(sw.name, func(t *testing.T) {
			if _, err := s.Open(sealed, sw.aad); err == nil {
				t.Fatal("ciphertext decrypted under the wrong identity")
			}
		})
	}
}

func TestOpenRejectsTamperingAndWrongKey(t *testing.T) {
	s := newService(t)
	aad := AAD("project", "", "K")
	sealed, err := s.Seal([]byte("value"), aad)
	if err != nil {
		t.Fatal(err)
	}

	parts := strings.Split(sealed, ".")
	body, _ := base64.RawStdEncoding.DecodeString(parts[3])
	body[0] ^= 0xFF
	parts[3] = base64.RawStdEncoding.EncodeToString(body)
	if _, err := s.Open(strings.Join(parts, "."), aad); err == nil {
		t.Fatal("tampered ciphertext decrypted")
	}

	if _, err := newService(t).Open(sealed, aad); err == nil {
		t.Fatal("another key decrypted the ciphertext")
	}

	for _, bad := range []string{"", "garbage", "v1.a.b", "v2.a.b.c"} {
		if _, err := s.Open(bad, aad); err == nil {
			t.Fatalf("malformed ciphertext %q was accepted", bad)
		}
	}
}

func TestValidateVaultKeyAcceptsWhatOperatorsActuallyGenerate(t *testing.T) {
	raw := make([]byte, KeySize)
	if _, err := rand.Read(raw); err != nil {
		t.Fatal(err)
	}
	good := []string{
		base64.StdEncoding.EncodeToString(raw),    // openssl rand -base64 32
		base64.RawStdEncoding.EncodeToString(raw), // unpadded
		base64.URLEncoding.EncodeToString(raw),
		hex.EncodeToString(raw), // openssl rand -hex 32
	}
	for _, k := range good {
		if err := ValidateVaultKey(k); err != nil {
			t.Fatalf("rejected a valid key encoding %q: %v", k[:8]+"…", err)
		}
	}

	bad := []string{
		"", "   ",
		base64.StdEncoding.EncodeToString(raw[:16]), // 16 bytes, not 32
		"not-base64-or-hex!!",
	}
	for _, k := range bad {
		if err := ValidateVaultKey(k); err == nil {
			t.Fatalf("accepted an invalid key %q", k)
		}
	}
}

func TestHintIsNotReversible(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"sk-abcdefghijklmnop", "sk-…mnop"},
		{"ghp_1234567890", "…7890"},
		{"tiny", "••••"},
	} {
		if got := Hint(tc.in); got != tc.want {
			t.Fatalf("Hint(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	if strings.Contains(Hint("sk-abcdefghijklmnop"), "efghij") {
		t.Fatal("hint leaked the middle of the secret")
	}
}
