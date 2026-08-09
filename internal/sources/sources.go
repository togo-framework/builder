// Package sources pulls knowledge from outside this repository into the brain.
//
// A source is a thing an agent should know about but cannot read for itself: a
// repository's README, a runbook, a changelog. The package is a registry of
// source KINDS plus one function that runs a source and retains what it found.
//
// Three seams are deliberate, and all three exist so that a credential, a
// namespace and a schema decision stay outside this package:
//
//   - Secrets is reveal-BY-NAME. A source config holds the NAME of a vault
//     secret, never its value (Rule 34), and the caller binds which principal
//     is doing the revealing. Nothing here logs, returns or retains a revealed
//     value — it reaches exactly one place, an Authorization header.
//   - Retainer is the brain narrowed to its one write. The NAMESPACE is the
//     caller's decision, because "which brain may an unattended ingester write
//     to" is a grant question, not a connector question (Rule 40).
//   - CursorStore is where a source's incremental position lives. The obvious
//     home is a builder_sources row, but that is a new table and therefore a
//     `schema_change` — a human's call. Keeping it an interface means the
//     connector is finished and tested today and gains persistence with one
//     adapter later, rather than waiting on a migration.
package sources

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Doc is one unit of knowledge on its way to becoming a memory.
type Doc struct {
	// Ref is stable across refreshes and unique within the source. It becomes
	// part of the memory's source_ref, and the brain's unique index on
	// (namespace, source_ref) turns the second refresh of the same Ref into an
	// UPDATE. A source that minted a fresh Ref every run would bury its own
	// current answer under a pile of stale copies within a fortnight.
	Ref string

	Title      string
	Text       string
	Importance float64
}

// Skip is something the source deliberately did not ingest. Skips are reported
// rather than dropped: "the README never appeared" and "the README was 4MB and
// was skipped" are very different failures, and only one of them is a bug.
type Skip struct {
	Ref    string
	Reason string
}

// Batch is one fetch's worth of work.
type Batch struct {
	Docs    []Doc
	Skipped []Skip

	// Removed lists refs the source knows are gone upstream. Invalidating the
	// matching memories needs a writer identity this package does not have, so
	// it reports them and lets the caller decide.
	Removed []string

	// Cursor is opaque to everything except the source that produced it. It is
	// persisted only after every Doc in the batch has been retained, so a
	// refresh that dies halfway is retried rather than silently skipped.
	Cursor string

	// Unchanged is true when the source found nothing new. It is the whole
	// point of the cursor: a re-run against an unchanged repository should cost
	// one HTTP request and zero writes.
	Unchanged bool
}

// Source is one configured thing to read from.
type Source interface {
	Kind() string
	Name() string
	Fetch(ctx context.Context, cursor string) (Batch, error)
}

// Secrets is the vault, narrowed to the one call a source may make.
//
// The implementation binds the principal and the run, so that the audit row
// says who read the credential. A source never sees, stores or logs the value
// it gets back.
type Secrets interface {
	Reveal(ctx context.Context, name string) (string, error)
}

// Retainer is the brain, narrowed to its one write. *brain.Store satisfies it.
type Retainer interface {
	Retain(ctx context.Context, ns, content, sourceKind, sourceRef string, importance float64) (string, error)
}

// CursorStore persists where each source got to.
type CursorStore interface {
	Cursor(ctx context.Context, kind, name string) (string, error)
	SetCursor(ctx context.Context, kind, name, cursor string) error
}

// Factory builds a source from its stored config.
type Factory func(cfg json.RawMessage, sec Secrets) (Source, error)

var (
	registryMu sync.RWMutex
	registry   = map[string]Factory{}
)

// Register adds a source kind. Called from a package init, so that importing
// the connector is all it takes to make the kind available.
func Register(kind string, f Factory) {
	registryMu.Lock()
	defer registryMu.Unlock()
	if kind == "" || f == nil {
		panic("sources: Register needs a kind and a factory")
	}
	if _, dup := registry[kind]; dup {
		panic("sources: duplicate source kind " + kind)
	}
	registry[kind] = f
}

// Open builds a configured source of the named kind.
func Open(kind string, cfg json.RawMessage, sec Secrets) (Source, error) {
	registryMu.RLock()
	f, ok := registry[kind]
	registryMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("no source kind %q (known: %s)", kind, strings.Join(Kinds(), ", "))
	}
	return f(cfg, sec)
}

// Kinds lists the registered source kinds, sorted.
func Kinds() []string {
	registryMu.RLock()
	defer registryMu.RUnlock()
	out := make([]string, 0, len(registry))
	for k := range registry {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// MemoryRef is the source_ref a doc is retained under.
//
// Namespaced by kind and source name so that two repositories with a README
// each do not overwrite one another, and so an operator can see at a glance
// where a memory came from.
func MemoryRef(kind, name, ref string) string {
	return "source:" + kind + ":" + name + ":" + ref
}

// Report is what one refresh did.
type Report struct {
	Retained  int
	Skipped   int
	Removed   int
	Unchanged bool
	Cursor    string
}

// ErrNoNamespace is returned when a refresh is asked to write nowhere.
var ErrNoNamespace = errors.New("sources: refresh needs a target namespace")

// Refresh runs one source and retains what it found.
//
// The cursor is advanced only after every doc has landed. The alternative —
// saving first, retaining after — turns a transient network error into a
// permanent hole in the brain, because the next run starts after the documents
// that were never written.
func Refresh(ctx context.Context, src Source, cur CursorStore, brain Retainer, ns string) (Report, error) {
	if ns == "" {
		return Report{}, ErrNoNamespace
	}
	kind, name := src.Kind(), src.Name()

	var prev string
	if cur != nil {
		var err error
		if prev, err = cur.Cursor(ctx, kind, name); err != nil {
			return Report{}, fmt.Errorf("read cursor for %s/%s: %w", kind, name, err)
		}
	}

	batch, err := src.Fetch(ctx, prev)
	if err != nil {
		// Scrubbed: a connector's error can quote the request it failed on, and
		// this string is headed for a log line and an operator's screen.
		return Report{}, fmt.Errorf("fetch %s/%s: %s", kind, name, Scrub(err.Error()))
	}

	rep := Report{
		Skipped:   len(batch.Skipped),
		Removed:   len(batch.Removed),
		Unchanged: batch.Unchanged,
		Cursor:    batch.Cursor,
	}

	for _, d := range batch.Docs {
		if strings.TrimSpace(d.Text) == "" {
			continue
		}
		imp := d.Importance
		if imp <= 0 {
			imp = 0.5
		}
		// Redact, not Scrub: this text is about to become a memory an agent can
		// quote into a chat reply, so a key checked into a README must not
		// survive the trip (Rule 34).
		body := Redact(strings.TrimSpace(d.Text))
		if d.Title != "" {
			body = Redact(d.Title) + "\n\n" + body
		}
		if _, err := brain.Retain(ctx, ns, body, kind, MemoryRef(kind, name, d.Ref), imp); err != nil {
			return rep, fmt.Errorf("retain %s: %s", d.Ref, Scrub(err.Error()))
		}
		rep.Retained++
	}

	if cur != nil && batch.Cursor != "" && batch.Cursor != prev {
		if err := cur.SetCursor(ctx, kind, name, batch.Cursor); err != nil {
			return rep, fmt.Errorf("save cursor for %s/%s: %w", kind, name, err)
		}
	}
	return rep, nil
}

// MemCursors is an in-process CursorStore. It is what the tests use, and what a
// single-process run uses until source rows have somewhere durable to live.
type MemCursors struct {
	mu sync.Mutex
	m  map[string]string
}

func NewMemCursors() *MemCursors { return &MemCursors{m: map[string]string{}} }

func (c *MemCursors) Cursor(_ context.Context, kind, name string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.m[kind+"/"+name], nil
}

func (c *MemCursors) SetCursor(_ context.Context, kind, name, cursor string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]string{}
	}
	c.m[kind+"/"+name] = cursor
	return nil
}
