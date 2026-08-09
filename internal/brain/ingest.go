package brain

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ProjectNamespace is the brain the whole system shares, as opposed to the
// per-agent brains named `<fleet>:<agent-slug>`.
//
// The namespace itself comes from ProjectNamespace(fleet) in project.go. This
// file used to carry its own `const ProjectNamespace = "default:project"`,
// which was the same name for a different thing: a hardcoded fleet, on an
// install where the fleet is configurable. Two spellings of one idea is how a
// document ends up in a brain nobody reads.

// DocSourceKind is the source_kind every document chunk carries, so a citation
// can say "this came from an uploaded document" and a cleanup can find them all.
const DocSourceKind = "document"

// docRefPrefix is the shared prefix of every chunk of one document. It is also
// the delete key for replacing a document, so it must not be a prefix of
// another document's refs — hence the '#', which cannot appear in the middle.
func docRefPrefix(name string) string { return "doc:" + name + "#" }

// DocSourceRef is the source_ref of one chunk: stable across re-uploads, so
// chunk 3 of a revised document updates chunk 3 rather than adding a row.
//
// Zero-padded to a FIXED width, which is load-bearing twice over: it is what an
// operator reads in a citation (#10 must not sort before #2), and the prune
// below finds a shorter document's leftovers by string comparison, which is
// only the numeric order while every index is the same width.
func DocSourceRef(name string, i int) string {
	return fmt.Sprintf("%s%05d", docRefPrefix(name), i)
}

// MaxDocumentChunks bounds how many memories one upload may create.
//
// With the default chunk size the rune cap binds first and this never fires;
// it exists for a caller that passes a tiny MaxRunes, where one file could
// otherwise become tens of thousands of rows in the brain every agent reads.
// It also keeps every index inside the width DocSourceRef pads to.
const MaxDocumentChunks = 5000

// IngestResult is what one ingestion did, for the log line and the API reply.
type IngestResult struct {
	Namespace string `json:"namespace"`
	Document  string `json:"document"`
	Kind      string `json:"kind"`
	Runes     int    `json:"runes"`
	Chunks    int    `json:"chunks"`
	// Removed counts chunks of a PREVIOUS version of this document that the new
	// one no longer has. Non-zero means the document got shorter.
	Removed   int      `json:"removed"`
	MemoryIDs []string `json:"memoryIds"`
}

// IngestDocument extracts a document, chunks it, and retains every chunk.
//
// Re-ingesting the same Document.Name REPLACES that document rather than
// duplicating it: chunk N upserts on (namespace, source_ref), and any chunk the
// new version does not have is deleted. Without the second half a spec that
// loses a section keeps answering from the section it lost, which is worse than
// not having ingested it — the stale chunk is indistinguishable from a current
// one and outranks nothing.
func (s *Store) IngestDocument(ctx context.Context, ns string, d Document, opt ChunkOptions) (IngestResult, error) {
	res := IngestResult{Namespace: ns, Document: d.Name, Kind: d.Kind()}

	d.Name = strings.TrimSpace(d.Name)
	if d.Name == "" {
		return res, errors.New("a document needs a name: it is the identity that re-upload replaces")
	}
	// '#' separates the name from the chunk index in a source_ref, so a name
	// containing one could forge another document's refs and delete its chunks.
	if strings.ContainsAny(d.Name, "#\n\r\x00") {
		return res, fmt.Errorf("document name %q contains a character that is not allowed in a name", d.Name)
	}
	res.Document = d.Name

	// A document is PROJECT knowledge. Writing one into `<fleet>:<agent>` would
	// put content nobody vetted inside a single agent's private brain, where no
	// other agent can see it and no operator thinks to look — and it is the
	// same reasoning that CHECK-constrains webhook sources to a project
	// namespace: an inbound payload must never reach an agent's own memory.
	// IsProjectNamespace, not a local HasSuffix: the predicate belongs next to
	// the constant it derives from and to the CHECK constraint it mirrors, and
	// two copies of "what counts as a project brain" drift apart the first time
	// one of them changes.
	if !IsProjectNamespace(ns) {
		// Names the SHAPE, not one namespace. Resolving the fleet here would
		// mean a database round-trip to build an error string — which panics on
		// a store with no handle, and would report one install's fleet as if it
		// were the rule.
		return res, fmt.Errorf("refusing to ingest %q into %q: documents belong in a project brain (a %q namespace), not an agent's private one",
			d.Name, ns, "<fleet>:"+ProjectSlot)
	}

	text, err := Extract(d)
	if err != nil {
		return res, err
	}
	res.Runes = len([]rune(text))

	chunks := Chunk(text, opt)
	if len(chunks) == 0 {
		return res, fmt.Errorf("%s: %w", d.Name, ErrNoText)
	}
	if len(chunks) > MaxDocumentChunks {
		return res, fmt.Errorf("%s splits into %d chunks, over the %d limit; "+
			"raise ChunkOptions.MaxRunes or split the document",
			d.Name, len(chunks), MaxDocumentChunks)
	}

	// Importance sits above the 0.5 default: an operator uploaded this on
	// purpose, which is a stronger signal than an agent's incidental note.
	const importance = 0.7

	for i, c := range chunks {
		id, err := s.Retain(ctx, ns, c, DocSourceKind, DocSourceRef(d.Name, i), importance)
		if err != nil {
			// Stop rather than continue. A half-ingested document is a document
			// that answers questions with half its content and gives no sign of
			// it; the stale-chunk sweep below is deliberately not reached, so
			// the previous version stays intact and usable.
			return res, fmt.Errorf("ingest %s chunk %d/%d: %w", d.Name, i+1, len(chunks), err)
		}
		res.MemoryIDs = append(res.MemoryIDs, id)
	}
	res.Chunks = len(chunks)

	removed, err := s.pruneDocument(ctx, ns, d.Name, len(chunks))
	if err != nil {
		// The new content is already in place and correct. A failed prune
		// leaves stale tail chunks, which is worth a loud log and not worth
		// discarding a successful ingestion over.
		s.log.Error("stale chunks of a replaced document were not removed",
			"document", d.Name, "namespace", ns, "err", err)
	}
	res.Removed = removed

	s.log.Info("document ingested",
		"document", d.Name, "kind", res.Kind, "namespace", ns,
		"chunks", res.Chunks, "replaced", res.Removed, "runes", res.Runes)
	return res, nil
}

// pruneDocument deletes chunks left over from a longer previous version.
//
// Deleted, not invalidated. Forget invalidates because a wrong conclusion is
// worth a trace of having been believed; a chunk of a superseded draft is not a
// belief, it is a stale copy of a file the operator has already replaced, and
// keeping it means the graph still links entities that the document no longer
// mentions. builder_memory_entities cascades on delete, so the edges go too.
func (s *Store) pruneDocument(ctx context.Context, ns, name string, keep int) (int, error) {
	// starts_with rather than LIKE: a document called "50%_report.csv" is a
	// legal name whose LIKE pattern matches half the brain.
	//
	// COLLATE "C" so the comparison is byte order. The refs differ only in a
	// fixed-width run of digits, which every collation orders the same way —
	// but "every collation" is an assumption about the deployment's locale, and
	// this statement DELETEs.
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM builder_memories
		  WHERE namespace = $1
		    AND starts_with(source_ref, $2)
		    AND source_ref COLLATE "C" > $3 COLLATE "C"`,
		ns, docRefPrefix(name), DocSourceRef(name, keep-1))
	if err != nil {
		return 0, fmt.Errorf("prune %s: %w", name, err)
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE builder_brains
			    SET memory_count = (SELECT count(*) FROM builder_memories m WHERE m.namespace = $1)
			  WHERE namespace = $1`, ns)
	}
	return int(n), nil
}

// ForgetDocument removes every chunk of a document, for when the underlying
// file is deleted from the library.
//
// The uploaded file and its chunks are one thing in an operator's head. Deleting
// the file and leaving the chunks means the brain keeps answering from a
// document that is no longer there and cannot be re-read to check.
func (s *Store) ForgetDocument(ctx context.Context, ns, name string) (int, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, errors.New("which document?")
	}
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM builder_memories WHERE namespace = $1 AND starts_with(source_ref, $2)`,
		ns, docRefPrefix(name))
	if err != nil {
		return 0, fmt.Errorf("forget document %s: %w", name, err)
	}
	n, _ := res.RowsAffected()
	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_brains
		    SET memory_count = (SELECT count(*) FROM builder_memories m WHERE m.namespace = $1)
		  WHERE namespace = $1`, ns)
	return int(n), nil
}

// DocumentName recovers the document a memory came from, for a citation.
// Returns "" for a memory that is not a document chunk.
func DocumentName(m Memory) string {
	if m.SourceKind != DocSourceKind || !strings.HasPrefix(m.SourceRef, "doc:") {
		return ""
	}
	rest := strings.TrimPrefix(m.SourceRef, "doc:")
	i := strings.LastIndex(rest, "#")
	if i < 0 {
		return ""
	}
	return rest[:i]
}
