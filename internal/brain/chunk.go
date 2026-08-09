package brain

// Chunking: cutting a document into pieces small enough to embed and whole
// enough to answer from.
//
// The unit of recall is a memory row, so the chunk IS the answer an agent
// quotes. That makes the cut points the whole design:
//
//   - Too large and the embedding averages several topics into a vector that
//     matches nothing well, and the cited passage is a page rather than a claim.
//   - Cut mid-sentence and the chunk that best answers a question is the one
//     that ends "…must not exceed the" — true, useless, and cited as if it were
//     the whole rule.
//
// So chunks end at sentence boundaries and overlap. Overlap is what stops a
// fact that straddles a boundary from being lost by both neighbours: the last
// sentences of one chunk are repeated as the first of the next, so the fact
// appears whole somewhere.

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// ChunkOptions tunes the cut. The zero value is the default, which is what
// every caller should use until there is a measurement saying otherwise.
type ChunkOptions struct {
	// MaxRunes is the ceiling for one chunk.
	MaxRunes int
	// OverlapRunes is how much of the tail of a chunk is repeated at the head
	// of the next. Clamped to half of MaxRunes — at more than that the overlap
	// consumes the chunk and ingestion never terminates.
	OverlapRunes int
}

// Defaults, in runes rather than tokens because the embedder seam takes text.
//
// 1200 is roughly two paragraphs of prose: big enough that a claim and its
// qualification stay together, small enough that the vector is about one thing.
// 200 of overlap is about one sentence of run-up, which is what it takes for a
// sentence beginning "It must therefore…" to still have its antecedent.
const (
	DefaultChunkRunes   = 1200
	DefaultOverlapRunes = 200
)

func (o ChunkOptions) withDefaults() ChunkOptions {
	if o.MaxRunes <= 0 {
		o.MaxRunes = DefaultChunkRunes
	}
	if o.MaxRunes < 64 {
		o.MaxRunes = 64
	}
	if o.OverlapRunes < 0 {
		o.OverlapRunes = 0
	}
	if o.OverlapRunes == 0 && o.MaxRunes == DefaultChunkRunes {
		o.OverlapRunes = DefaultOverlapRunes
	}
	if o.OverlapRunes > o.MaxRunes/2 {
		o.OverlapRunes = o.MaxRunes / 2
	}
	return o
}

// Chunk splits text into overlapping pieces that end on sentence boundaries.
//
// Guarantees, all covered by tests:
//   - no chunk exceeds MaxRunes, unless a single word does
//   - a chunk never ends mid-sentence while a sentence boundary was available
//   - consecutive chunks overlap when OverlapRunes > 0
//   - the concatenation of the chunks contains every sentence of the input
func Chunk(text string, opt ChunkOptions) []string {
	opt = opt.withDefaults()
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	units := splitSentences(text)
	if len(units) == 0 {
		return nil
	}

	var (
		out  []string
		cur  []string
		size int
	)
	flush := func() {
		if len(cur) == 0 {
			return
		}
		out = append(out, strings.TrimSpace(strings.Join(cur, "")))
		// Carry the tail forward as the next chunk's run-up.
		cur, size = tail(cur, opt.OverlapRunes)
	}

	for _, u := range units {
		n := utf8.RuneCountInString(u)
		if n > opt.MaxRunes {
			// One sentence longer than a whole chunk. Nothing here can end on a
			// boundary, so it is cut on whitespace — the least-bad break, and
			// far better than dropping it.
			flush()
			out = append(out, hardSplit(u, opt.MaxRunes)...)
			cur, size = nil, 0
			continue
		}
		if size+n > opt.MaxRunes && len(cur) > 0 {
			flush()
			// The carried overlap could still leave no room; drop it rather
			// than emit a chunk that is nothing but the previous chunk's tail.
			if size+n > opt.MaxRunes {
				out = append(out, strings.TrimSpace(strings.Join(cur, "")))
				cur, size = nil, 0
			}
		}
		cur = append(cur, u)
		size += n
	}
	if len(cur) > 0 {
		joined := strings.TrimSpace(strings.Join(cur, ""))
		// The final flush's carry-forward can leave a chunk that is entirely
		// contained in the previous one. That is a duplicate memory, not a
		// chunk, and it would compete with its own source in recall.
		if joined != "" && (len(out) == 0 || !strings.Contains(out[len(out)-1], joined)) {
			out = append(out, joined)
		}
	}
	return out
}

// tail returns the trailing units of a chunk totalling at most n runes, to be
// repeated at the head of the next one. At least one unit is always dropped, so
// the walk always makes progress.
func tail(units []string, n int) ([]string, int) {
	if n <= 0 || len(units) < 2 {
		return nil, 0
	}
	size, start := 0, len(units)
	for i := len(units) - 1; i >= 1; i-- {
		c := utf8.RuneCountInString(units[i])
		if size+c > n {
			break
		}
		size += c
		start = i
	}
	if start == len(units) {
		return nil, 0
	}
	carried := make([]string, len(units)-start)
	copy(carried, units[start:])
	return carried, size
}

// hardSplit cuts an over-long unit on word boundaries. Reached by minified
// JSON, a base64 blob and a table rendered as one line — none of which have a
// sentence boundary to find.
func hardSplit(s string, max int) []string {
	var out []string
	var b strings.Builder
	n := 0
	for _, f := range strings.Fields(s) {
		w := utf8.RuneCountInString(f)
		if n > 0 && n+w+1 > max {
			out = append(out, b.String())
			b.Reset()
			n = 0
		}
		if n > 0 {
			b.WriteByte(' ')
			n++
		}
		b.WriteString(f)
		n += w
	}
	if b.Len() > 0 {
		out = append(out, b.String())
	}
	return out
}

// splitSentences cuts text into sentences, keeping each one's trailing
// whitespace attached so that joining the units reproduces the input.
//
// A paragraph break is its own unit for the same reason: it is a legal cut
// point, and preserving it keeps the reconstructed chunk readable.
func splitSentences(text string) []string {
	runes := []rune(text)
	var out []string
	start := 0

	for i := 0; i < len(runes); i++ {
		r := runes[i]

		if r == '\n' && i+1 < len(runes) && runes[i+1] == '\n' {
			j := i
			for j < len(runes) && runes[j] == '\n' {
				j++
			}
			out = append(out, string(runes[start:j]))
			start, i = j, j-1
			continue
		}

		if r != '.' && r != '!' && r != '?' {
			continue
		}
		// Run past "?!" and the ellipsis.
		j := i
		for j+1 < len(runes) && isTerminator(runes[j+1]) {
			j++
		}
		// A boundary needs whitespace after it. "3.5" and "e.g." do not have it.
		if j+1 < len(runes) && !unicode.IsSpace(runes[j+1]) {
			i = j
			continue
		}
		if r == '.' && isAbbreviation(runes[start:j+1]) {
			i = j
			continue
		}
		// Take the whitespace with the sentence it ends.
		k := j + 1
		for k < len(runes) && (runes[k] == ' ' || runes[k] == '\t') {
			k++
		}
		if k < len(runes) && runes[k] == '\n' {
			k++
		}
		out = append(out, string(runes[start:k]))
		start, i = k, k-1
	}

	if start < len(runes) {
		out = append(out, string(runes[start:]))
	}
	return out
}

func isTerminator(r rune) bool { return r == '.' || r == '!' || r == '?' }

// abbreviations that end in a period and are followed by a space, which is
// every way an ordinary sentence ends. Without this a spec that says "e.g. the
// header" gets cut in the middle of its own example.
var abbreviations = map[string]bool{
	"e.g.": true, "i.e.": true, "etc.": true, "vs.": true, "cf.": true,
	"al.": true, "fig.": true, "no.": true, "approx.": true, "ca.": true,
	"mr.": true, "mrs.": true, "ms.": true, "dr.": true, "st.": true,
	"jan.": true, "feb.": true, "mar.": true, "apr.": true, "jun.": true,
	"jul.": true, "aug.": true, "sep.": true, "sept.": true, "oct.": true,
	"nov.": true, "dec.": true,
}

// isAbbreviation reports whether the period ending this span is part of a word
// rather than the end of a sentence.
func isAbbreviation(span []rune) bool {
	// The last whitespace-delimited word, period included.
	end := len(span)
	i := end - 1
	for i >= 0 && !unicode.IsSpace(span[i]) {
		i--
	}
	word := strings.ToLower(strings.TrimSpace(string(span[i+1 : end])))
	if word == "" {
		return false
	}
	if abbreviations[word] {
		return true
	}
	// A single-letter initial: "J. R. R. Tolkien", "section A. of the spec".
	if utf8.RuneCountInString(word) == 2 && strings.HasSuffix(word, ".") {
		r, _ := utf8.DecodeRuneInString(word)
		return unicode.IsLetter(r)
	}
	return false
}
