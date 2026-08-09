package brain

// Document ingestion: turning an uploaded file into memories an agent can
// recall and cite.
//
// An upload is an opaque blob. `builder_memories.content` is text, its BM25
// index is `to_tsvector(content)` and its embedding is a function of the same
// string, so a PDF retained as bytes is invisible to every one of them — the
// brain stores it and can never find it. Extraction is what turns a file into
// something the brain can actually answer from.
//
// The seam is deliberately narrow: Extract takes bytes and a name and returns
// text. It knows nothing about where the bytes came from, so the document
// library, an issue attachment and a test fixture all reach the brain through
// the same path.

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"
)

// MaxDocumentBytes is the largest upload this package will read. It matches the
// attachment ceiling in internal/issues so a file that was accepted on upload
// cannot then be refused on ingestion.
const MaxDocumentBytes = 25 << 20 // 25 MB

// MaxDocumentRunes caps extracted text. A 25 MB text file is legal input and
// would otherwise become ~25 M runes of chunking work and several thousand
// embedder calls from a single upload.
const MaxDocumentRunes = 2 << 20 // ~2 M runes

// Document kinds. The kind decides the extractor, not the file extension.
const (
	KindText  = "text"
	KindCSV   = "csv"
	KindPDF   = "pdf"
	KindImage = "image"
)

// ErrNoText means the file was understood but carries nothing worth retaining:
// a scanned PDF with no text layer, an empty file, an image with no caption.
//
// It is deliberately distinct from a parse failure. "This PDF is images of
// paper" is a fact an operator can act on (caption it, or re-export it); "this
// PDF is malformed" is not the same problem and should not print the same
// message.
var ErrNoText = errors.New("no extractable text")

// Document is one uploaded file on its way into the brain.
type Document struct {
	// Name is the file's name as an operator would recognise it, and it is
	// IDENTITY: re-ingesting the same name replaces that document's chunks.
	// It is never used to build a filesystem path.
	Name string
	// Mime is the sniffed content type. Authoritative when present; the
	// extension is only consulted when it is empty or too vague to act on.
	Mime string
	// Caption is operator-supplied prose. The only text an image has until
	// there is an OCR step.
	Caption string
	Data    []byte
}

// Kind reports which extractor a document will go through.
func (d Document) Kind() string {
	mime := strings.ToLower(strings.TrimSpace(strings.Split(d.Mime, ";")[0]))
	switch mime {
	case "application/pdf", "application/x-pdf":
		return KindPDF
	case "text/csv", "application/csv", "text/tab-separated-values":
		return KindCSV
	case "text/markdown", "text/x-markdown":
		return KindText
	}
	if strings.HasPrefix(mime, "image/") {
		return KindImage
	}
	// Everything below here is the tie-break, and text/plain is the reason it
	// exists: http.DetectContentType returns text/plain for anything that merely
	// looks textual, so it is not a claim about structure and a CSV arrives
	// wearing it. The extension breaks that tie — and only that tie, never a
	// disagreement with one of the specific types above.
	switch strings.ToLower(filepath.Ext(d.Name)) {
	case ".csv", ".tsv":
		return KindCSV
	case ".pdf":
		return KindPDF
	case ".md", ".markdown", ".txt", ".text", ".rst", ".adoc":
		return KindText
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		return KindImage
	}
	if strings.HasPrefix(mime, "text/") {
		return KindText
	}
	return ""
}

// Extract turns a document into the text that will be retained.
//
// The returned string is normalised (LF newlines, no control characters) and
// credential-scrubbed. Scrubbing happens HERE rather than at the call site
// because this is the last point where the whole document is in one place: a
// key split across two chunks is a key nobody redacts. See redact.go.
func Extract(d Document) (string, error) {
	if len(d.Data) > MaxDocumentBytes {
		return "", fmt.Errorf("%s is %d MB, over the %d MB ingestion limit",
			d.Name, len(d.Data)>>20, MaxDocumentBytes>>20)
	}

	var (
		text string
		err  error
	)
	switch d.Kind() {
	case KindText:
		text = string(d.Data)
	case KindCSV:
		text, err = csvText(d.Data)
	case KindPDF:
		text, err = pdfText(d.Data)
	case KindImage:
		text = imageText(d)
	default:
		return "", fmt.Errorf("no text extractor for %q (%s)", d.Name, d.Mime)
	}
	if err != nil {
		return "", err
	}

	text = normalizeText(text)
	if d.Kind() == KindPDF {
		// Only PDFs need this. A PDF's line breaks are page layout, not
		// sentence structure, so they are re-joined before chunking sees them.
		text = reflow(text)
	}
	if utf8.RuneCountInString(text) > MaxDocumentRunes {
		text = truncateRunes(text, MaxDocumentRunes)
	}
	text = scrubCredentials(text)

	if strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("%s: %w", d.Name, ErrNoText)
	}
	return text, nil
}

// csvText renders a table as one line per row.
//
// A CSV pasted in raw is a wall of commas: BM25 indexes the header words once
// and the reader of a recalled chunk cannot tell which value belongs to which
// column. Repeating the header on every row costs storage and buys a chunk
// that answers a question on its own, which is the whole point of retaining it.
func csvText(data []byte) (string, error) {
	r := csv.NewReader(bytes.NewReader(data))
	// Real exports have ragged rows. Refusing the file over one short line
	// would lose the other ten thousand.
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	var (
		out    strings.Builder
		header []string
		row    int
	)
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			// One bad line does not invalidate the rows already read.
			if out.Len() > 0 {
				break
			}
			return "", fmt.Errorf("csv: %w", err)
		}
		if row == 0 && looksLikeHeader(rec) {
			header = rec
			row++
			continue
		}
		var line []string
		for i, f := range rec {
			f = strings.TrimSpace(f)
			if f == "" {
				continue
			}
			if i < len(header) && header[i] != "" {
				line = append(line, strings.TrimSpace(header[i])+": "+f)
			} else {
				line = append(line, f)
			}
		}
		if len(line) > 0 {
			out.WriteString(strings.Join(line, "; "))
			// A row is a complete statement, so it terminates like one. The
			// chunker splits on sentence boundaries and would otherwise treat
			// the entire table as one unsplittable sentence.
			out.WriteString(".\n")
		}
		row++
	}
	return out.String(), nil
}

// looksLikeHeader reports whether a record is column names rather than data.
// Names are non-empty and non-numeric; a first row of numbers is data.
func looksLikeHeader(rec []string) bool {
	if len(rec) == 0 {
		return false
	}
	for _, f := range rec {
		f = strings.TrimSpace(f)
		if f == "" {
			return false
		}
		if strings.IndexFunc(f, unicode.IsLetter) < 0 {
			return false
		}
	}
	return true
}

// imageText is the filename plus whatever a person wrote about the image.
//
// There is no OCR step yet, and inventing one silently would be worse than not
// having it: an agent citing a chunk trusts that the chunk is what the document
// says. A filename and an operator's caption are both true.
func imageText(d Document) string {
	var b strings.Builder
	b.WriteString("Image: ")
	b.WriteString(d.Name)
	if c := strings.TrimSpace(d.Caption); c != "" {
		b.WriteString("\n\n")
		b.WriteString(c)
	}
	return b.String()
}

// normalizeText gives every extractor's output the same shape: LF newlines, no
// control characters, no NULs, no trailing whitespace per line.
//
// NULs matter beyond tidiness — Postgres rejects them in a text column, so an
// unstripped one turns a whole ingestion into an opaque driver error.
func normalizeText(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.Map(func(r rune) rune {
		switch {
		case r == '\n' || r == '\t':
			return r
		case r == utf8.RuneError:
			return -1
		case unicode.IsControl(r):
			return -1
		}
		return r
	}, s)

	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(l, " \t")
	}
	s = strings.Join(lines, "\n")

	// Collapse runs of blank lines to a single paragraph break. Extractors
	// produce a lot of them and each one is a paragraph boundary to the chunker.
	for strings.Contains(s, "\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(s)
}

// reflow re-joins lines that a page layout broke mid-sentence.
//
// A PDF has no concept of a paragraph: a content stream repositions the cursor
// for every visual line, so extraction yields a newline every 70 characters.
// Handing that to the chunker makes every line its own "sentence" and defeats
// the one guarantee chunking is supposed to give.
//
// The heuristic is conservative — a line is only joined to the next when it
// looks wrapped (long, no terminal punctuation) and the next line looks like a
// continuation (not a bullet, not a heading). A missed join costs a slightly
// worse chunk boundary; a wrong join would merge two unrelated columns of text.
func reflow(s string) string {
	paras := strings.Split(s, "\n\n")
	for pi, p := range paras {
		lines := strings.Split(p, "\n")
		var out []string
		for _, line := range lines {
			cur := strings.TrimSpace(line)
			if cur == "" {
				continue
			}
			if len(out) == 0 {
				out = append(out, cur)
				continue
			}
			prev := out[len(out)-1]
			if wraps(prev) && continues(cur) {
				if strings.HasSuffix(prev, "-") {
					// A hyphen at a line break is hyphenation, not a compound.
					out[len(out)-1] = strings.TrimSuffix(prev, "-") + cur
				} else {
					out[len(out)-1] = prev + " " + cur
				}
				continue
			}
			out = append(out, cur)
		}
		paras[pi] = strings.Join(out, "\n")
	}
	return strings.Join(paras, "\n\n")
}

// wraps reports whether a line ended because the page ran out, not because the
// sentence did.
func wraps(line string) bool {
	if len([]rune(line)) < 30 {
		return false
	}
	switch line[len(line)-1] {
	case '.', '!', '?', ':', ';', '"', '\'', ')':
		return false
	}
	return true
}

// continues reports whether a line is the rest of the previous one rather than
// a new list item, heading or table cell.
func continues(line string) bool {
	if line == "" {
		return false
	}
	r, _ := utf8.DecodeRuneInString(line)
	switch r {
	case '-', '*', '#', '>', '|', '•', '–', '—':
		return false
	}
	// A digit start is usually "3.1 Scope" or a table row, not prose.
	return !unicode.IsDigit(r)
}

func truncateRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	i, count := 0, 0
	for i < len(s) {
		if count == n {
			return s[:i]
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		i += size
		count++
	}
	return s
}
