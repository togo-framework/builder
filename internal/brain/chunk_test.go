package brain

import (
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

// The guarantee the issue asks for: "so a paragraph is not split mid-sentence".
//
// It is the one that matters, because the chunk IS the citation. A chunk ending
// "…must not exceed the" is true, useless, and quoted as if it were the rule.
func TestChunksEndOnSentenceBoundaries(t *testing.T) {
	doc := prose(60)
	chunks := Chunk(doc, ChunkOptions{MaxRunes: 400, OverlapRunes: 80})
	if len(chunks) < 3 {
		t.Fatalf("want several chunks from %d runes, got %d", len([]rune(doc)), len(chunks))
	}
	for i, c := range chunks[:len(chunks)-1] {
		last := c[len(c)-1]
		if last != '.' && last != '!' && last != '?' {
			t.Errorf("chunk %d ends mid-sentence: …%q", i, tailOf(c, 60))
		}
	}
}

func TestChunksRespectMaxRunes(t *testing.T) {
	for _, max := range []int{200, 400, 1200} {
		chunks := Chunk(prose(120), ChunkOptions{MaxRunes: max, OverlapRunes: max / 6})
		for i, c := range chunks {
			if n := utf8.RuneCountInString(c); n > max {
				t.Errorf("MaxRunes=%d: chunk %d is %d runes", max, i, n)
			}
		}
	}
}

// Overlap is what stops a fact that straddles a boundary from being lost by
// both neighbours.
func TestChunksOverlap(t *testing.T) {
	chunks := Chunk(prose(60), ChunkOptions{MaxRunes: 400, OverlapRunes: 100})
	if len(chunks) < 2 {
		t.Fatal("need at least two chunks to have an overlap")
	}
	for i := 1; i < len(chunks); i++ {
		prev, cur := chunks[i-1], chunks[i]
		first := firstSentence(cur)
		if first == "" || !strings.Contains(prev, first) {
			t.Errorf("chunk %d does not begin inside chunk %d: %q", i, i-1, tailOf(first, 60))
		}
	}
}

// Overlap that is not strictly smaller than a chunk means the carried tail
// refills the next chunk forever.
func TestChunkingTerminatesWithAbsurdOverlap(t *testing.T) {
	done := make(chan []string, 1)
	go func() { done <- Chunk(prose(40), ChunkOptions{MaxRunes: 200, OverlapRunes: 100000}) }()
	select {
	case got := <-done:
		if len(got) == 0 {
			t.Fatal("no chunks")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Chunk did not terminate: the overlap consumed the chunk")
	}
}

// No sentence may be dropped. A chunker that loses the last paragraph is worse
// than none, because nothing says the document is incomplete.
func TestEverySentenceSurvives(t *testing.T) {
	var b strings.Builder
	for i := range 40 {
		fmt.Fprintf(&b, "Fact number %d is that the subsystem retries on failure. ", i)
	}
	chunks := Chunk(b.String(), ChunkOptions{MaxRunes: 300, OverlapRunes: 60})
	all := strings.Join(chunks, "\n")
	for i := range 40 {
		if !strings.Contains(all, fmt.Sprintf("Fact number %d is", i)) {
			t.Errorf("sentence %d was dropped", i)
		}
	}
}

func TestChunkDoesNotSplitOnAbbreviations(t *testing.T) {
	text := "The gateway rejects malformed input, e.g. a truncated header. " +
		"Version 3.5 changed that behaviour. Dr. Ada wrote the original rule."
	got := splitSentences(text)
	if len(got) != 3 {
		t.Fatalf("want 3 sentences, got %d: %q", len(got), got)
	}
	if !strings.Contains(got[0], "e.g. a truncated header") {
		t.Errorf("split inside an abbreviation: %q", got[0])
	}
	if !strings.Contains(got[1], "3.5") {
		t.Errorf("split inside a version number: %q", got[1])
	}
}

// Minified JSON, a base64 blob, a table rendered as one line: no boundary to
// find, and dropping it is not an option.
func TestOverlongSentenceIsHardSplitNotDropped(t *testing.T) {
	long := strings.Repeat("token ", 500) // one "sentence", ~3000 runes
	chunks := Chunk(long, ChunkOptions{MaxRunes: 200})
	if len(chunks) < 10 {
		t.Fatalf("an over-long unit was not split: %d chunks", len(chunks))
	}
	total := 0
	for _, c := range chunks {
		if n := utf8.RuneCountInString(c); n > 200 {
			t.Errorf("hard split produced a %d-rune chunk", n)
		}
		total += strings.Count(c, "token")
	}
	if total != 500 {
		t.Errorf("hard split lost content: %d of 500 tokens", total)
	}
}

func TestChunkEdgeCases(t *testing.T) {
	if got := Chunk("", ChunkOptions{}); got != nil {
		t.Errorf("empty input produced %d chunks", len(got))
	}
	if got := Chunk("   \n\n  ", ChunkOptions{}); got != nil {
		t.Errorf("whitespace produced %d chunks", len(got))
	}
	got := Chunk("One short sentence.", ChunkOptions{})
	if len(got) != 1 || got[0] != "One short sentence." {
		t.Errorf("short input: %q", got)
	}
}

// The default is what every caller gets, so it is worth asserting rather than
// leaving to the zero value's mercy.
func TestChunkDefaults(t *testing.T) {
	o := ChunkOptions{}.withDefaults()
	if o.MaxRunes != DefaultChunkRunes || o.OverlapRunes != DefaultOverlapRunes {
		t.Fatalf("defaults drifted: %+v", o)
	}
	if o := (ChunkOptions{MaxRunes: 100, OverlapRunes: 90}).withDefaults(); o.OverlapRunes != 50 {
		t.Fatalf("overlap not clamped to half the chunk: %+v", o)
	}
}

// --- helpers ---------------------------------------------------------------

// prose builds a document of n sentences in a few paragraphs, so the chunker is
// exercised on something with real boundaries in it.
func prose(n int) string {
	var b strings.Builder
	for i := range n {
		fmt.Fprintf(&b, "Sentence %d explains that the orchestrator leases an issue "+
			"before any agent may claim it. ", i)
		if i%5 == 4 {
			b.WriteString("\n\n")
		}
	}
	return b.String()
}

func firstSentence(s string) string {
	if u := splitSentences(s); len(u) > 0 {
		return strings.TrimSpace(u[0])
	}
	return ""
}

func tailOf(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return string(r)
	}
	return string(r[len(r)-n:])
}
