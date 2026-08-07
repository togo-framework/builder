package issues

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// The pin text from a real report that broke issue creation.
//
// It ends inside a 4-byte emoji at the 80-byte boundary the pin's `name` is cut
// to. Byte-slicing there produced invalid UTF-8 and Postgres rejected the
// INSERT, so every report filed from that element failed with "could not create
// the issue" — with the real cause visible only in the server log.
const realPinName = "To do2#15highfeatureadd hire agent buttonfeedbackorchestrator💬 6↻ 333mTo do#16n"

func TestTruncateNeverSplitsACharacter(t *testing.T) {
	// Every cut point through the real payload must stay valid UTF-8.
	for n := 0; n <= len(realPinName)+4; n++ {
		got := truncate(realPinName, n)
		if !utf8.ValidString(got) {
			t.Fatalf("truncate(%d) produced invalid UTF-8: %q", n, got)
		}
		if len(got) > n && n <= len(realPinName) {
			t.Fatalf("truncate(%d) returned %d bytes — the byte limit is what the column is sized in", n, len(got))
		}
	}
}

// Arabic is multi-byte in its entirety, and this product renders it throughout.
// An emoji made the bug visible; Arabic would have hit it on ordinary prose.
func TestTruncateHandlesArabic(t *testing.T) {
	ar := "لوحة التحكم — إزالة الخلفية من أعمدة المشكلات"
	for n := 0; n <= len(ar); n++ {
		got := truncate(ar, n)
		if !utf8.ValidString(got) {
			t.Fatalf("truncate(%d) split an Arabic character: %q", n, got)
		}
	}
}

func TestTruncateLeavesShortStringsAlone(t *testing.T) {
	for _, s := range []string{"", "a", "hello", "💬", "مرحبا"} {
		if got := truncate(s, 1000); got != s {
			t.Errorf("truncate(%q, 1000) = %q, want it unchanged", s, got)
		}
	}
}

// A limit that lands before the first character yields "", not a broken byte.
func TestTruncateBelowTheFirstRune(t *testing.T) {
	if got := truncate("💬abc", 2); got != "" {
		t.Fatalf("truncate = %q; a cut inside the first rune must yield an empty string", got)
	}
}

// The failure as the database saw it: the exact call the ingress makes.
func TestPinNameAtTheRealLimitIsStorable(t *testing.T) {
	got := truncate(realPinName, 80) // the ingress cuts pin names at 80
	if !utf8.ValidString(got) {
		t.Fatalf("the pin name is still not storable: %q", got)
	}
	if strings.HasSuffix(got, "\xf0") {
		t.Fatal("output ends on a lone 0xf0 lead byte — this is the original bug")
	}
}
