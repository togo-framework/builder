package brain

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"strings"
	"testing"
)

func TestPDFTextFromCompressedAndPlainStreams(t *testing.T) {
	lines := []string{
		"The retention window for audit events is ninety days.",
		"After that the orchestrator purges them on the nightly sweep.",
	}
	for _, compressed := range []bool{true, false} {
		name := "flate"
		if !compressed {
			name = "unfiltered"
		}
		t.Run(name, func(t *testing.T) {
			got, err := pdfText(makePDF(t, lines, compressed))
			if err != nil {
				t.Fatalf("pdfText: %v", err)
			}
			for _, l := range lines {
				if !strings.Contains(normalizeText(got), l) {
					t.Errorf("missing %q in:\n%s", l, got)
				}
			}
		})
	}
}

// A PDF writes the space between two runs as a kerning number in a TJ array,
// not as a space character. Miss it and a whole line extracts as one word,
// which BM25 indexes as a term nobody will ever search for.
func TestPDFTJKerningBecomesSpaces(t *testing.T) {
	content := `BT /F1 12 Tf 72 720 Td [(The)-320(scheduler)-320(retries)-320(three)-320(times)] TJ ET`
	got, err := pdfText(rawPDF(t, content))
	if err != nil {
		t.Fatalf("pdfText: %v", err)
	}
	if !strings.Contains(got, "The scheduler retries three times") {
		t.Fatalf("kerning was not read as spacing: %q", got)
	}
}

// Small kerning is intra-word micro-adjustment. Treating it as a space splits
// words in half, which is the same failure in the other direction.
func TestPDFSmallKerningIsNotASpace(t *testing.T) {
	content := `BT /F1 12 Tf [(sched)-20(uler)-320(dispatches)-320(the)-320(next)-320(run)] TJ ET`
	got, err := pdfText(rawPDF(t, content))
	if err != nil {
		t.Fatalf("pdfText: %v", err)
	}
	if !strings.Contains(got, "scheduler") {
		t.Fatalf("a word was split by micro-kerning: %q", got)
	}
}

func TestPDFLiteralStringEscapes(t *testing.T) {
	// Nested parens, an escaped paren, and an octal escape.
	content := `BT (the gateway \(see figure 2\) terminates TLS) Tj ` +
		`(and (nested) parens survive the reader) Tj ` +
		`(octal \101 is a capital letter here) Tj ET`
	got, err := pdfText(rawPDF(t, content))
	if err != nil {
		t.Fatalf("pdfText: %v", err)
	}
	for _, want := range []string{
		"the gateway (see figure 2) terminates TLS",
		"and (nested) parens survive the reader",
		"octal A is a capital letter here",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in:\n%s", want, got)
		}
	}
}

func TestPDFHexStringsAndUTF16(t *testing.T) {
	// "the deploy pipeline is green" as hex, then the same idea as UTF-16BE.
	hex := ""
	for _, c := range []byte("the deploy pipeline is green") {
		hex += fmt.Sprintf("%02X", c)
	}
	u16 := "FEFF"
	for _, c := range []byte("rollbacks are always manual here") {
		u16 += fmt.Sprintf("00%02X", c)
	}
	content := fmt.Sprintf("BT <%s> Tj <%s> Tj ET", hex, u16)
	got, err := pdfText(rawPDF(t, content))
	if err != nil {
		t.Fatalf("pdfText: %v", err)
	}
	if !strings.Contains(got, "the deploy pipeline is green") {
		t.Errorf("hex string not decoded: %q", got)
	}
	if !strings.Contains(got, "rollbacks are always manual here") {
		t.Errorf("UTF-16BE string not decoded: %q", got)
	}
}

// Refusing is the point. A CID stream with no ToUnicode map decodes to
// plausible-looking rubbish, and rubbish in the project brain is worse than a
// document that never arrived: every agent reads it and one of them cites it.
func TestPDFRefusesUnreadableGlyphBytes(t *testing.T) {
	var b strings.Builder
	b.WriteString("BT ")
	for i := 0; i < 40; i++ {
		b.WriteString(fmt.Sprintf("<%04X%04X%04X> Tj ", 0x0100+i, 0x0120+i, 0x0140+i))
	}
	b.WriteString("ET")
	_, err := pdfText(rawPDF(t, b.String()))
	if err == nil {
		t.Fatal("glyph-index rubble was accepted as text")
	}
	if !strings.Contains(err.Error(), "no extractable text") {
		t.Fatalf("unhelpful error: %v", err)
	}
}

// Image, font and metadata streams are streams too. Only content streams have
// text operators, and decoding a JPEG as Latin-1 would be pure noise.
func TestPDFSkipsNonContentStreams(t *testing.T) {
	body := "%PDF-1.4\n" +
		"1 0 obj<</Type/XObject/Subtype/Image/Filter/DCTDecode/Length 12>>stream\n" +
		"\xff\xd8\xff\xe0jpegbytes\n" +
		"endstream endobj\n" +
		"2 0 obj<</Length 60>>stream\n" +
		"BT (the ingress terminates TLS before the gateway) Tj ET\n" +
		"endstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
	got, err := pdfText([]byte(body))
	if err != nil {
		t.Fatalf("pdfText: %v", err)
	}
	if !strings.Contains(got, "the ingress terminates TLS before the gateway") {
		t.Errorf("content stream was not read: %q", got)
	}
	if strings.Contains(got, "jpegbytes") {
		t.Errorf("image stream bytes leaked into the text: %q", got)
	}
}

func TestPDFRejections(t *testing.T) {
	tests := []struct {
		name, want string
		data       []byte
	}{
		{"no header", "%PDF-", []byte("just some bytes, not a document at all")},
		{"encrypted", "encrypted", []byte("%PDF-1.7\ntrailer<</Encrypt 9 0 R>>\n")},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := pdfText(tc.data); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v, want an error mentioning %q", err, tc.want)
			}
		})
	}
}

// A flate stream can expand a thousandfold, so one small upload can ask for a
// gigabyte of heap.
func TestPDFDecompressionIsBounded(t *testing.T) {
	var z bytes.Buffer
	w := zlib.NewWriter(&z)
	// Highly compressible, and far larger than the budget the test sets.
	w.Write(bytes.Repeat([]byte("A"), 4<<20))
	w.Close()

	budget := 1024
	out, err := inflate(z.Bytes(), &budget)
	if err != nil {
		t.Fatalf("inflate: %v", err)
	}
	if len(out) > 1024 {
		t.Fatalf("inflate returned %d bytes against a 1024-byte budget", len(out))
	}
	if budget != 0 {
		t.Fatalf("budget not consumed: %d", budget)
	}
}

// --- fixtures ---------------------------------------------------------------

// rawPDF wraps a content stream in the smallest PDF that carries it. No xref:
// the extractor scans for stream objects precisely because real files have
// broken cross-reference tables.
func rawPDF(t *testing.T, content string) []byte {
	t.Helper()
	return []byte(fmt.Sprintf("%%PDF-1.4\n"+
		"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"+
		"2 0 obj<</Length %d>>stream\n%s\nendstream endobj\n"+
		"trailer<</Root 1 0 R>>\n%%%%EOF\n", len(content), content))
}

// makePDF builds a page that paints one line per string, optionally with the
// FlateDecode filter every real writer uses.
func makePDF(t *testing.T, lines []string, compressed bool) []byte {
	t.Helper()

	var c strings.Builder
	c.WriteString("BT /F1 12 Tf 72 720 Td\n")
	for _, l := range lines {
		esc := strings.NewReplacer(`\`, `\\`, `(`, `\(`, `)`, `\)`).Replace(l)
		fmt.Fprintf(&c, "(%s) Tj 0 -14 Td\n", esc)
	}
	c.WriteString("ET\n")

	stream, filter := []byte(c.String()), ""
	if compressed {
		var z bytes.Buffer
		w := zlib.NewWriter(&z)
		if _, err := w.Write(stream); err != nil {
			t.Fatal(err)
		}
		if err := w.Close(); err != nil {
			t.Fatal(err)
		}
		stream, filter = z.Bytes(), "/Filter/FlateDecode"
	}

	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	b.WriteString("1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n")
	b.WriteString("2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n")
	b.WriteString("3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R" +
		"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n")
	fmt.Fprintf(&b, "4 0 obj<</Length %d%s>>stream\n", len(stream), filter)
	b.Write(stream)
	b.WriteString("\nendstream\nendobj\n")
	b.WriteString("5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n")
	b.WriteString("trailer<</Size 6/Root 1 0 R>>\n%%EOF\n")
	return b.Bytes()
}
