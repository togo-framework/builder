package sources

import (
	"strings"
	"testing"
)

// Retain stores what it is given as ONE memory with ONE vector. A 188 KB
// reference page embeds as a single point that means nothing and matches
// everything — and most embedders would truncate it long before that anyway,
// so the tail would simply not exist.
func TestLongContentIsSplitIntoEmbeddableChunks(t *testing.T) {
	para := strings.Repeat("The scheduler leases a source before it runs. ", 40) // ~1800 chars
	long := strings.Join([]string{para, para, para, para}, "\n\n")

	parts := splitForEmbedding(long)
	if len(parts) < 2 {
		t.Fatalf("a %d-character page produced %d chunk(s)", len(long), len(parts))
	}
	for i, p := range parts {
		if n := len([]rune(p)); n > maxRetainRunes {
			t.Errorf("chunk %d is %d runes, over the %d ceiling", i, n, maxRetainRunes)
		}
		if strings.TrimSpace(p) == "" {
			t.Errorf("chunk %d is blank", i)
		}
	}
	// Nothing may be dropped: the point is to make the tail reachable, not to
	// truncate it more politely.
	joined := strings.Join(parts, " ")
	if !strings.Contains(joined, "leases a source") {
		t.Error("content went missing in the split")
	}
}

func TestShortContentIsNotSplit(t *testing.T) {
	parts := splitForEmbedding("A short note about deploys.")
	if len(parts) != 1 {
		t.Fatalf("short content produced %d chunks, want 1 — its ref must stay plain", len(parts))
	}
}

// A single enormous line is legal input and cannot be split on paragraphs.
func TestOneHugeLineIsStillBounded(t *testing.T) {
	for _, p := range splitForEmbedding(strings.Repeat("x", maxRetainRunes*3)) {
		if len([]rune(p)) > maxRetainRunes {
			t.Fatalf("a chunk of %d runes escaped the ceiling", len([]rune(p)))
		}
	}
}

// Cutting by runes, not bytes: a byte slice through a multi-byte character
// produces invalid UTF-8, which Postgres rejects outright.
func TestMultiByteTextIsNotCutInHalf(t *testing.T) {
	for _, p := range splitForEmbedding(strings.Repeat("سياسة الاحتفاظ ", maxRetainRunes)) {
		if !strings.ContainsRune(p, '�') {
			continue
		}
		t.Fatal("a chunk contains a replacement character — the cut was by bytes")
	}
}
