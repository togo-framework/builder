package sources

import (
	"strings"
	"testing"
)

func TestScrubRemovesCredentialsAndKeepsProse(t *testing.T) {
	cases := []struct {
		name, in, mustNotContain, mustContain string
	}{
		{
			"a token in a URL",
			"dial https://user:s3cr3tvalue@api.github.com/repos failed",
			"s3cr3tvalue",
			"api.github.com",
		},
		{
			"a keyword assignment",
			"config: token=ghp_abcdefghijklmnopqrstuvwxyz012345 retries=3",
			"ghp_abcdefghijklmnopqrstuvwxyz012345",
			"retries=3",
		},
		{
			"a vendor key on its own",
			"the key AKIAIOSFODNN7EXAMPLE is expired",
			"AKIAIOSFODNN7EXAMPLE",
			"is expired",
		},
		{
			"a JWT",
			"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U here",
			"dozjgNryP4J3jVmNHl0w5N",
			"here",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Scrub(c.in)
			if strings.Contains(got, c.mustNotContain) {
				t.Errorf("credential survived: %q", got)
			}
			if !strings.Contains(got, c.mustContain) {
				t.Errorf("scrub ate the useful part: %q", got)
			}
		})
	}
}

func TestScrubRemovesAPrivateKey(t *testing.T) {
	in := "before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nlines\n-----END RSA PRIVATE KEY-----\nafter"
	got := Scrub(in)
	if strings.Contains(got, "MIIEow") {
		t.Errorf("key body survived: %q", got)
	}
	if !strings.Contains(got, "before") || !strings.Contains(got, "after") {
		t.Errorf("surrounding text was lost: %q", got)
	}
}

// Redact is the retain-time pass, and it must not make a commit log unreadable.
func TestRedactKeepsIdentifiersAndDropsKeys(t *testing.T) {
	keep := []string{
		"9dd2350fcb1a4d8e9f0b2c3d4e5f60718293a4b5",           // a git sha
		"3f2504e0-4f89-11d3-9a0c-0305e82c3301",               // a uuid
		"00000000000000000000000000000000",                   // a separator run
		"12345678901234567890123456789012345678901234567890", // digits
	}
	for _, k := range keep {
		if got := Redact("value " + k + " end"); !strings.Contains(got, k) {
			t.Errorf("Redact removed the identifier %q: %q", k, got)
		}
	}

	drop := "Xk8Lm2Qp9Rt4Wz7Bv3Nc6Yh1Jd5Fg0Sa"
	if got := Redact("key " + drop + " end"); strings.Contains(got, drop) {
		t.Errorf("Redact kept an opaque high-entropy value: %q", got)
	}
}

func TestLooksLikeCredential(t *testing.T) {
	yes := []string{
		"ghp_abcdefghijklmnopqrstuvwxyz012345",
		"github_pat_11ABCDEFG0abcdefghijklmno",
		"sk-abcdefghijklmnopqrstuvwx",
		"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijkl",
		"Xk8Lm2Qp9Rt4Wz7Bv3Nc6Yh1Jd5Fg0Sa",
	}
	for _, s := range yes {
		if !LooksLikeCredential(s) {
			t.Errorf("LooksLikeCredential(%q) = false, want true", s)
		}
	}

	no := []string{
		"", "github-token", "acme_github_pat", "GITHUB_TOKEN",
		"3f2504e0-4f89-11d3-9a0c-0305e82c3301",
	}
	for _, s := range no {
		if LooksLikeCredential(s) {
			t.Errorf("LooksLikeCredential(%q) = true, want false — that is a NAME", s)
		}
	}
}

func TestScrubErrIsEmptyForNil(t *testing.T) {
	if ScrubErr(nil) != "" {
		t.Error("ScrubErr(nil) should be empty")
	}
}
