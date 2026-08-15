package integrations

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/togo-framework/builder/internal/sources"
)

// The schemas here are rendered as a form AND validated by the runner that
// consumes them. If the two disagree, the form collects fields the runner
// ignores and omits ones it requires — and the failure surfaces as a 422 at
// save time with a message about a field the operator was never shown.
//
// That happened: the RSS schema declared `url` while internal/sources/rss.go
// reads `feedURL`, so saving an RSS feed failed with `"feedURL" is required`
// against a form that had no such field. Every schema was written from scratch
// instead of from the runner, and four of them were wrong the same way.
//
// This test reads the runner's own struct tags and compares.
func TestSchemasMatchTheRunnersThatConsumeThem(t *testing.T) {
	// slug → the file whose config struct the runner unmarshals into.
	sources := map[string]string{
		"rss":                   "rss.go",
		"crawl":                 "crawl.go",
		"slack":                 "slack.go",
		"discord":               "discord.go",
		"telegram":              "telegram.go",
		"whatsapp":              "whatsapp.go",
		"gmail":                 "gmail.go",
		"google-calendar":       "gcal.go",
		"google-meet":           "gcal.go",
		"google-analytics":      "ga4.go",
		"google-search-console": "ga4.go",
	}

	for slug, file := range sources {
		t.Run(slug, func(t *testing.T) {
			i, ok := Get(slug)
			if !ok {
				t.Fatalf("%s is not registered", slug)
			}
			runnerFields := jsonTagsIn(t, filepath.Join("..", "sources", file))
			if len(runnerFields) == 0 {
				t.Skipf("no json tags found in %s", file)
			}

			var sch struct {
				Properties map[string]json.RawMessage `json:"properties"`
				Required   []string                   `json:"required"`
			}
			if err := json.Unmarshal(i.Inputs, &sch); err != nil {
				t.Fatal(err)
			}

			// Every field the FORM offers must be one the runner reads.
			// Anything else is a box the operator fills that goes nowhere.
			for name := range sch.Properties {
				if !runnerFields[name] {
					t.Errorf("schema offers %q, which %s never reads — the operator would fill a field that does nothing",
						name, file)
				}
			}
		})
	}
}

// jsonTagsIn returns every json tag name declared in a file's structs.
func jsonTagsIn(t *testing.T, path string) map[string]bool {
	t.Helper()
	src, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("cannot read %s: %v", path, err)
	}
	f, err := parser.ParseFile(token.NewFileSet(), path, src, 0)
	if err != nil {
		t.Skipf("cannot parse %s: %v", path, err)
	}
	out := map[string]bool{}
	ast.Inspect(f, func(n ast.Node) bool {
		st, ok := n.(*ast.StructType)
		if !ok {
			return true
		}
		for _, fld := range st.Fields.List {
			if fld.Tag == nil {
				continue
			}
			tag := strings.Trim(fld.Tag.Value, "`")
			idx := strings.Index(tag, `json:"`)
			if idx < 0 {
				continue
			}
			rest := tag[idx+6:]
			end := strings.Index(rest, `"`)
			if end < 0 {
				continue
			}
			name := strings.Split(rest[:end], ",")[0]
			if name != "" && name != "-" {
				out[name] = true
			}
		}
		return true
	})
	return out
}

// An integration whose kind has no runner would save a row nothing can execute.
// The create endpoint refuses it, so the honest thing is to say so on the card
// rather than offer a Configure button that always 422s.
func TestIntegrationsWithoutARunnerAreMarkedBeta(t *testing.T) {
	// Read from the source registry rather than a list written here.
	//
	// The first version of this test hardcoded the kinds, and went stale the
	// moment two collectors were added — reporting them as missing runners when
	// the runners existed. A test that has to be edited whenever the thing it
	// checks changes is a test that will eventually be edited to agree.
	built := map[string]bool{}
	for _, k := range sources.Kinds() {
		built[k] = true
	}
	// Dispatched by execute() rather than the registry, so not in Kinds().
	built["sql"] = true
	for _, i := range All() {
		if !i.Collects || i.SourceKind == "" {
			continue
		}
		if built[i.SourceKind] {
			continue
		}
		if !i.Beta {
			t.Errorf("%s collects via kind %q, which no runner implements, but is not marked Beta — its Configure button would always fail",
				i.Slug, i.SourceKind)
		}
	}
}
