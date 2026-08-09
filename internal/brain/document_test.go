package brain

import (
	"errors"
	"strings"
	"testing"
)

// TestPDFBytesAreOpaqueToTheBrain is the reproduction.
//
// A PDF retained as bytes is not a memory of anything. `builder_memories.tsv`
// is to_tsvector(content) and the embedding is a function of the same string,
// so if the document's words are not IN the string, neither index can ever
// match a question about them. This asserts that directly, against the brain's
// own tokenizer — the one the hash embedder uses — with no database needed.
func TestPDFBytesAreOpaqueToTheBrain(t *testing.T) {
	const claim = "The retention window for audit events is ninety days."
	pdf := makePDF(t, []string{claim}, true)

	raw := tokenize(string(pdf))
	for _, word := range []string{"retention", "audit", "ninety"} {
		if contains(raw, word) {
			t.Fatalf("premise wrong: %q is already visible in the raw PDF bytes", word)
		}
	}

	// Extraction is what closes the gap.
	text, err := Extract(Document{Name: "policy.pdf", Mime: "application/pdf", Data: pdf})
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	got := tokenize(text)
	for _, word := range []string{"retention", "audit", "ninety"} {
		if !contains(got, word) {
			t.Fatalf("extracted text is missing %q; got %q", word, text)
		}
	}
}

func TestExtractPerKind(t *testing.T) {
	tests := []struct {
		name string
		doc  Document
		want []string
		not  []string
	}{{
		name: "markdown passes straight through",
		doc: Document{Name: "spec.md", Mime: "text/markdown",
			Data: []byte("# Title\n\nThe scheduler retries three times.\n")},
		want: []string{"# Title", "retries three times"},
	}, {
		name: "plain text passes straight through",
		doc: Document{Name: "notes.txt", Mime: "text/plain",
			Data: []byte("Deploys are blue-green.")},
		want: []string{"Deploys are blue-green."},
	}, {
		name: "csv becomes labelled rows",
		doc: Document{Name: "limits.csv", Mime: "text/csv",
			Data: []byte("service,limit,window\napi,100,1m\nweb,500,1m\n")},
		// Each row carries its own column names, so a recalled row is readable
		// without the header that is now several chunks away.
		want: []string{"service: api; limit: 100; window: 1m.", "service: web"},
		not:  []string{"service,limit,window"},
	}, {
		name: "csv sniffed as text/plain is still a csv",
		doc: Document{Name: "limits.csv", Mime: "text/plain",
			Data: []byte("service,limit\napi,100\n")},
		want: []string{"service: api"},
	}, {
		name: "an image is its filename and the operator's caption",
		doc: Document{Name: "architecture.png", Mime: "image/png",
			Caption: "The ingress terminates TLS before the gateway.",
			Data:    []byte{0x89, 'P', 'N', 'G'}},
		want: []string{"Image: architecture.png", "terminates TLS"},
	}, {
		name: "an uncaptioned image is still its filename",
		doc:  Document{Name: "logo.png", Mime: "image/png", Data: []byte{0x89, 'P'}},
		want: []string{"Image: logo.png"},
	}}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Extract(tc.doc)
			if err != nil {
				t.Fatalf("Extract: %v", err)
			}
			for _, w := range tc.want {
				if !strings.Contains(got, w) {
					t.Errorf("want %q in extracted text:\n%s", w, got)
				}
			}
			for _, n := range tc.not {
				if strings.Contains(got, n) {
					t.Errorf("did not want %q in extracted text:\n%s", n, got)
				}
			}
		})
	}
}

func TestExtractRefusesWhatItCannotRead(t *testing.T) {
	tests := []struct {
		name string
		doc  Document
		want string
	}{
		{"an unknown type", Document{Name: "app.bin", Mime: "application/octet-stream", Data: []byte{1, 2}},
			"no text extractor"},
		{"an encrypted pdf", Document{Name: "locked.pdf", Mime: "application/pdf",
			Data: []byte("%PDF-1.7\n/Encrypt 4 0 R\ntrailer\n")}, "encrypted"},
		{"a pdf with no text layer", Document{Name: "scan.pdf", Mime: "application/pdf",
			Data: []byte("%PDF-1.7\n1 0 obj<</Type/Page>>endobj\n")}, "no extractable text"},
		{"an empty text file", Document{Name: "empty.md", Mime: "text/markdown", Data: []byte("   \n\n")},
			"no extractable text"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Extract(tc.doc)
			if err == nil {
				t.Fatal("want an error, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not mention %q", err, tc.want)
			}
		})
	}
}

// A scanned PDF and a malformed one are different problems for an operator, so
// the first is distinguishable in code and not just in a message.
func TestNoTextIsADistinctError(t *testing.T) {
	_, err := Extract(Document{Name: "scan.pdf", Mime: "application/pdf",
		Data: []byte("%PDF-1.7\n1 0 obj<</Type/Page>>endobj\n")})
	if !errors.Is(err, ErrNoText) {
		t.Fatalf("want ErrNoText, got %v", err)
	}
}

// Rule 34. A document is the one thing entering the brain that nobody vetted,
// and it lands in a namespace every agent can read and quote.
func TestExtractScrubsCredentials(t *testing.T) {
	doc := Document{Name: "runbook.md", Mime: "text/markdown", Data: []byte(`
# Runbook

Connect with postgres://builder:hunter2@db.internal:5432/prod and then export
API_KEY = sk-abcdefghijklmnopqrstuvwxyz012345 before running the job.

  password: s3cr3t-p4ssw0rd

Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk

-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----
`)}
	got, err := Extract(doc)
	if err != nil {
		t.Fatal(err)
	}
	for _, leak := range []string{
		"hunter2",
		"sk-abcdefghijklmnopqrstuvwxyz012345",
		"s3cr3t-p4ssw0rd",
		"dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
		"MIIEowIBAAKCAQEA1234567890",
	} {
		if strings.Contains(got, leak) {
			t.Errorf("a credential survived into the brain: %q\n%s", leak, got)
		}
	}
	// Redaction must not eat the document around it.
	if !strings.Contains(got, "db.internal") || !strings.Contains(got, "Runbook") {
		t.Errorf("redaction removed too much:\n%s", got)
	}
}

// Postgres rejects a NUL in a text column, so an unstripped one turns the whole
// ingestion into an opaque driver error a long way from its cause.
func TestExtractStripsControlCharacters(t *testing.T) {
	got, err := Extract(Document{Name: "n.txt", Mime: "text/plain",
		Data: []byte("before\x00\x07after\r\nnext line")})
	if err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(got, "\x00\x07\r") {
		t.Fatalf("control characters survived: %q", got)
	}
	if got != "beforeafter\nnext line" {
		t.Fatalf("got %q", got)
	}
}

func TestKindDetection(t *testing.T) {
	tests := []struct{ mime, name, want string }{
		{"application/pdf", "a.pdf", KindPDF},
		{"text/csv", "a.csv", KindCSV},
		{"text/plain", "a.csv", KindCSV},  // sniffing calls every CSV text/plain
		{"text/plain", "a.txt", KindText}, // and the extension breaks the tie
		{"text/markdown", "a.md", KindText},
		{"image/png", "a.png", KindImage},
		{"", "a.pdf", KindPDF},
		{"application/octet-stream", "a.bin", ""},
		// A specific type is never overruled by the extension.
		{"application/pdf", "report.csv", KindPDF},
	}
	for _, tc := range tests {
		if got := (Document{Mime: tc.mime, Name: tc.name}).Kind(); got != tc.want {
			t.Errorf("Kind(%q, %q) = %q, want %q", tc.mime, tc.name, got, tc.want)
		}
	}
}

// A PDF breaks a line every time the page runs out of width. Left alone, every
// visual line becomes its own "sentence" and the chunker's one guarantee — not
// cutting mid-sentence — becomes meaningless.
func TestReflowRejoinsWrappedLines(t *testing.T) {
	in := "The scheduler retries a failed job three times before it gives up and\n" +
		"records the failure against the run, which is what the dashboard reads.\n\n" +
		"- a list item that is quite long and definitely over thirty characters\n" +
		"- another item"
	got := reflow(in)
	if !strings.Contains(got, "gives up and records the failure") {
		t.Errorf("wrapped line was not rejoined:\n%s", got)
	}
	if strings.Contains(got, "characters - another") {
		t.Errorf("list items were joined into one:\n%s", got)
	}
}

func TestReflowUndoesHyphenation(t *testing.T) {
	in := "The orchestrator dispatches work to whichever agent is currently avail-\nable."
	if got := reflow(in); !strings.Contains(got, "available.") {
		t.Errorf("hyphenated break was not rejoined: %q", got)
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
