package brain

// PDF text extraction, on the standard library only.
//
// `deps.allow` in the autonomy grant permits three import prefixes and none of
// them is a PDF library, so pulling one in would be a `dependency_addition`
// must_ask — a human decision to unblock one checklist item. compress/zlib
// already ships the only hard part (FlateDecode), and the rest is walking a
// content stream for its text operators.
//
// WHAT THIS HANDLES: text-layer PDFs written by a word processor, an exporter
// or a spec tool — the overwhelming majority of what an operator uploads as
// "the spec".
//
// WHAT IT DOES NOT: scanned pages (no text layer at all — that is OCR, and the
// issue explicitly defers it), encrypted files, and documents whose fonts use
// a custom CID encoding with no ToUnicode mapping applied. Each of those is
// REFUSED with a message naming the reason. That refusal is the important part:
// a CID stream decodes to plausible-looking rubbish, and rubbish retained into
// the project brain is worse than a document that never arrived, because every
// agent on the team will read it and one of them will cite it.

import (
	"bytes"
	"compress/flate"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

// maxInflated bounds total decompressed content per document. A flate stream
// expands ~1000:1 in the worst case, so a 1 MB upload can ask for a gigabyte.
const maxInflated = 64 << 20

func pdfText(data []byte) (string, error) {
	head := data
	if len(head) > 1024 {
		head = head[:1024]
	}
	if !bytes.Contains(head, []byte("%PDF-")) {
		return "", errors.New("not a PDF: the %PDF- header is missing")
	}
	// Standard security handler encryption. Even "owner password only" files
	// have their streams RC4/AES encrypted, so there is nothing to read.
	if bytes.Contains(data, []byte("/Encrypt")) {
		return "", errors.New("the PDF is encrypted; export an unprotected copy and upload that")
	}

	var out strings.Builder
	budget := maxInflated

	for _, st := range pdfStreams(data) {
		body, ok := decodeStream(st, &budget)
		if !ok {
			continue
		}
		// Fonts, metadata, colour profiles and images are all streams too.
		// Only a content stream has text operators in it.
		if !bytes.Contains(body, []byte("Tj")) && !bytes.Contains(body, []byte("TJ")) {
			continue
		}
		out.WriteString(contentText(body))
		out.WriteByte('\n')
	}

	text := out.String()
	if !looksLikeProse(text) {
		return "", fmt.Errorf("%w: the PDF has no readable text layer "+
			"(scanned pages, or fonts with no Unicode mapping)", ErrNoText)
	}
	return text, nil
}

type pdfStream struct {
	dict []byte
	body []byte
}

// pdfStreams finds every stream object without parsing the cross-reference
// table. Real-world PDFs have broken xrefs, incremental updates and object
// streams; scanning for the keyword works on all of them and on linearised
// files where the xref points at offsets that a re-save invalidated.
func pdfStreams(data []byte) []pdfStream {
	var out []pdfStream
	kw := []byte("stream")
	i := 0
	for i < len(data) {
		k := bytes.Index(data[i:], kw)
		if k < 0 {
			break
		}
		start := i + k
		// "endstream" contains "stream". Skip the tail of one.
		if start >= 3 && bytes.Equal(data[start-3:start], []byte("end")) {
			i = start + len(kw)
			continue
		}
		body := start + len(kw)
		if body < len(data) && data[body] == '\r' {
			body++
		}
		if body < len(data) && data[body] == '\n' {
			body++
		}
		e := bytes.Index(data[body:], []byte("endstream"))
		if e < 0 {
			break
		}
		raw := data[body : body+e]
		raw = bytes.TrimRight(raw, "\r\n")

		out = append(out, pdfStream{dict: objectDict(data, start), body: raw})
		i = body + e + len("endstream")
	}
	return out
}

// objectDict returns the dictionary belonging to the stream at `start`.
//
// It has to stop at the enclosing object's own header. Taking a fixed window
// back from the keyword reaches into the PREVIOUS object's dictionary, and the
// filter read from there is not this stream's — a page of text immediately
// after an image was read as /DCTDecode and silently dropped.
func objectDict(data []byte, start int) []byte {
	from := max(0, start-4096)
	window := data[from:start]
	// "N 0 obj" opens an object; "endobj" closes the previous one. Either way
	// the last occurrence of "obj" is the boundary this dictionary starts after.
	if k := bytes.LastIndex(window, []byte("obj")); k >= 0 {
		return window[k+3:]
	}
	return window
}

// decodeStream applies the stream's filter. Only FlateDecode and unfiltered
// streams carry text worth reading; an image filter is skipped rather than
// decoded, since its bytes are pixels.
func decodeStream(st pdfStream, budget *int) ([]byte, bool) {
	f := bytes.LastIndex(st.dict, []byte("/Filter"))
	filter := ""
	if f >= 0 {
		filter = string(st.dict[f:min(len(st.dict), f+200)])
	}

	switch {
	case strings.Contains(filter, "FlateDecode"):
		body, err := inflate(st.body, budget)
		if err != nil {
			return nil, false
		}
		return body, true
	case f < 0 || !strings.Contains(filter, "Decode"):
		// No filter: the content stream is plain.
		if len(st.body) > *budget {
			return nil, false
		}
		*budget -= len(st.body)
		return st.body, true
	default:
		// DCTDecode, JPXDecode, CCITTFaxDecode, JBIG2Decode, LZWDecode…
		return nil, false
	}
}

func inflate(b []byte, budget *int) ([]byte, error) {
	if *budget <= 0 {
		return nil, errors.New("decompression budget exhausted")
	}
	var r io.ReadCloser
	if zr, err := zlib.NewReader(bytes.NewReader(b)); err == nil {
		r = zr
	} else {
		// Some writers emit a raw deflate stream with no zlib header.
		r = flate.NewReader(bytes.NewReader(b))
	}
	defer r.Close()

	out, err := io.ReadAll(io.LimitReader(r, int64(*budget)))
	// A truncated stream still yields everything before the break, and a PDF
	// with one damaged object usually has thirty good ones.
	if err != nil && len(out) == 0 {
		return nil, err
	}
	*budget -= len(out)
	return out, nil
}

// contentText walks a page's content stream and emits what it would draw.
//
// It is not a PDF interpreter: it tracks no graphics state, no fonts and no
// positions. It only needs to know which operands are strings and which
// operator paints them.
func contentText(b []byte) string {
	var (
		out     strings.Builder
		last    string // the most recent string operand
		arr     bytes.Buffer
		inArray bool
	)

	i := 0
	for i < len(b) {
		c := b[i]
		switch {
		case c == '%':
			for i < len(b) && b[i] != '\n' && b[i] != '\r' {
				i++
			}

		case c == '(':
			s, next := pdfLiteralString(b, i)
			i = next
			if inArray {
				arr.Write(s)
			} else {
				last = decodePDFString(s)
			}

		case c == '<' && i+1 < len(b) && b[i+1] == '<':
			i += 2 // an inline dictionary; nothing here is painted

		case c == '<':
			s, next := pdfHexString(b, i)
			i = next
			if inArray {
				arr.Write(s)
			} else {
				last = decodePDFString(s)
			}

		case c == '>':
			i++

		case c == '[':
			inArray, i = true, i+1
			arr.Reset()

		case c == ']':
			inArray, i = false, i+1
			last = decodePDFString(arr.Bytes())

		case c == '/':
			i++
			for i < len(b) && !isPDFDelim(b[i]) && !isPDFSpace(b[i]) {
				i++
			}

		case isPDFSpace(c):
			i++

		default:
			start := i
			for i < len(b) && !isPDFDelim(b[i]) && !isPDFSpace(b[i]) {
				i++
			}
			if i == start {
				i++
				continue
			}
			tok := string(b[start:i])

			if inArray {
				// Inside a TJ array the numbers are kerning, in thousandths of
				// an em. A large negative adjustment is how a PDF writes a
				// space between two runs without emitting a space character —
				// miss it and "the quick brown fox" extracts as one word.
				if v, err := strconv.ParseFloat(tok, 64); err == nil {
					if v <= -100 {
						arr.WriteByte(' ')
					}
					continue
				}
			}

			switch tok {
			case "Tj", "TJ":
				out.WriteString(last)
				last = ""
			case "'", `"`:
				// Both move to the next line before painting.
				out.WriteByte('\n')
				out.WriteString(last)
				last = ""
			case "Td", "TD", "T*", "TL", "Tm", "BT", "ET":
				out.WriteByte('\n')
			}
		}
	}
	return out.String()
}

// pdfLiteralString reads a (…) string starting at b[i]=='(' and returns its raw
// bytes plus the index just past the closing paren. Parens nest, and a
// backslash escapes the next character.
func pdfLiteralString(b []byte, i int) ([]byte, int) {
	var out []byte
	depth := 0
	for i < len(b) {
		c := b[i]
		switch c {
		case '\\':
			i++
			if i >= len(b) {
				return out, i
			}
			switch e := b[i]; e {
			case 'n':
				out = append(out, '\n')
			case 'r':
				out = append(out, '\r')
			case 't':
				out = append(out, '\t')
			case 'b':
				out = append(out, '\b')
			case 'f':
				out = append(out, '\f')
			case '\n':
				// A backslash at end of line is a continuation: emit nothing.
			case '\r':
				if i+1 < len(b) && b[i+1] == '\n' {
					i++
				}
			default:
				if e >= '0' && e <= '7' {
					v, n := 0, 0
					for n < 3 && i < len(b) && b[i] >= '0' && b[i] <= '7' {
						v = v*8 + int(b[i]-'0')
						i++
						n++
					}
					i--
					out = append(out, byte(v))
				} else {
					out = append(out, e)
				}
			}
			i++
		case '(':
			depth++
			if depth > 1 {
				out = append(out, c)
			}
			i++
		case ')':
			depth--
			if depth == 0 {
				return out, i + 1
			}
			out = append(out, c)
			i++
		default:
			out = append(out, c)
			i++
		}
	}
	return out, i
}

// pdfHexString reads a <…> string starting at b[i]=='<'. An odd final digit is
// padded with a zero, per the spec.
func pdfHexString(b []byte, i int) ([]byte, int) {
	i++ // '<'
	var digits []byte
	for i < len(b) && b[i] != '>' {
		c := b[i]
		if isHexDigit(c) {
			digits = append(digits, c)
		}
		i++
	}
	if i < len(b) {
		i++ // '>'
	}
	if len(digits)%2 == 1 {
		digits = append(digits, '0')
	}
	out := make([]byte, 0, len(digits)/2)
	for j := 0; j+1 < len(digits); j += 2 {
		v, err := strconv.ParseUint(string(digits[j:j+2]), 16, 8)
		if err != nil {
			continue
		}
		out = append(out, byte(v))
	}
	return out, i
}

// decodePDFString turns a string operand's bytes into Go text.
//
// A leading BOM means UTF-16BE. Everything else is treated as PDFDocEncoding,
// which agrees with Latin-1 over the range that carries actual letters — the
// simple encoding nearly every text-layer PDF uses.
func decodePDFString(b []byte) string {
	if len(b) >= 2 && b[0] == 0xFE && b[1] == 0xFF {
		u := make([]uint16, 0, (len(b)-2)/2)
		for i := 2; i+1 < len(b); i += 2 {
			u = append(u, uint16(b[i])<<8|uint16(b[i+1]))
		}
		return string(utf16.Decode(u))
	}
	var sb strings.Builder
	for _, c := range b {
		sb.WriteRune(rune(c))
	}
	return sb.String()
}

// looksLikeProse reports whether extracted text is language rather than the
// glyph-index rubble a CID-encoded stream decodes to.
//
// The test counts WHOLE words rather than a letter ratio, and a word is
// disqualified by a single byte that could not appear in one. A 2-byte CID
// encoding read as single bytes yields runs like "\x00T\x00h\x00e" — half
// letters by ratio, and not a word by this test, which is the distinction that
// matters. A spec full of version numbers and table cells scores poorly on
// ratio and passes here, which is the same distinction from the other side.
func looksLikeProse(s string) bool {
	// Measured over the whole string rather than word by word.
	//
	// The word-based version counted ASCII letters, so a PDF in Arabic,
	// Chinese, Cyrillic, Hebrew or Greek extracted perfectly and was then
	// discarded for not looking English — the operator was told "no readable
	// text layer" about a document whose text had in fact just been read.
	//
	// Splitting on whitespace does not survive translation either: Chinese and
	// Japanese write without spaces, so a per-word letter threshold rejects
	// them however the letters are counted.
	//
	// What survives every script is the ratio. Language is mostly letters;
	// a font with no Unicode mapping decodes to symbols, digits and control
	// characters, which is what this exists to catch.
	var letters, other int
	for _, r := range s {
		switch {
		case unicode.IsSpace(r):
		case unicode.IsLetter(r):
			letters++
		case unicode.IsPunct(r):
			// Punctuation is normal in prose and normal in noise. It votes
			// for neither.
		default:
			other++
		}
	}
	// The asymmetry is deliberate. A wrong ACCEPT gives the operator a
	// document full of nonsense they can see and delete. A wrong REJECT
	// silently discards a document they uploaded on purpose and tells them
	// their file was broken. The second is much worse, so the bar is low.
	return letters >= 12 && letters >= 2*other
}

func isPDFSpace(c byte) bool {
	return c == 0 || c == '\t' || c == '\n' || c == '\f' || c == '\r' || c == ' '
}

func isPDFDelim(c byte) bool {
	return bytes.IndexByte([]byte("()<>[]{}/%"), c) >= 0
}

func isHexDigit(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}
