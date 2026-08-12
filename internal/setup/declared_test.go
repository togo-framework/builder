package setup

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// TestEveryEnvVarIsDeclared is the gate that makes the operator's rule
// structural instead of remembered:
//
//	"anything you add to .env must show up in the setup as steps"
//
// It walks every os.Getenv / firstEnv call site in the repository and fails on
// any name absent from the registry. Before this existed the builder read 51
// variables and .env.example documented 4 — not because anyone decided that,
// but because nothing connected the two. Adding a variable and forgetting the
// step is now a red build, which is the only kind of reminder that survives.
//
// Adding a capability is one declaration in capabilities.go. That is the whole
// cost, and it buys the wizard step, the .env.example line, the docs row and
// the probe.
func TestEveryEnvVarIsDeclared(t *testing.T) {
	root := repoRoot(t)
	declared := Capabilities.Names()

	// os.Getenv("NAME") and firstEnv("A", "B", ...)
	getenv := regexp.MustCompile(`os\.Getenv\("([A-Z_0-9]+)"\)`)
	firstEnv := regexp.MustCompile(`firstEnv\(([^)]*)\)`)
	quoted := regexp.MustCompile(`"([A-Z_0-9]+)"`)

	type site struct{ name, file string }
	var undeclared []site
	seen := map[string]bool{}

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // unreadable paths are not this test's business
		}
		if info.IsDir() {
			switch info.Name() {
			case ".git", "node_modules", "dist", "vendor", "blueprint":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		add := func(name string) {
			if declared[name] || seen[name+rel] {
				return
			}
			seen[name+rel] = true
			undeclared = append(undeclared, site{name, rel})
		}
		for _, m := range getenv.FindAllStringSubmatch(string(src), -1) {
			add(m[1])
		}
		for _, m := range firstEnv.FindAllStringSubmatch(string(src), -1) {
			for _, q := range quoted.FindAllStringSubmatch(m[1], -1) {
				add(q[1])
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(undeclared) == 0 {
		return
	}
	sort.Slice(undeclared, func(i, j int) bool { return undeclared[i].name < undeclared[j].name })
	var b strings.Builder
	b.WriteString("environment variables are read but not declared in capabilities.go:\n\n")
	for _, u := range undeclared {
		b.WriteString("  " + u.name + "  (" + u.file + ")\n")
	}
	b.WriteString(`
Every variable this codebase reads must be declared, so that it appears as a
setup step, in .env.example, and in the docs — all generated from the one
declaration. Add it to Capabilities in internal/setup/capabilities.go.

If it is not something an operator configures (an OS-provided value, a test
fixture), declare it anyway with a Deprecated note. The gate does not care
about our opinion of a name, only that somebody wrote it down.`)
	t.Fatal(b.String())
}

// A capability nobody can read is not a capability. Both locales are required
// because a half-translated wizard looks finished and is not.
func TestEveryCapabilityIsUsable(t *testing.T) {
	seen := map[string]string{}
	for _, c := range Capabilities {
		if c.Env == "" {
			t.Errorf("a capability has no Env name")
			continue
		}
		if prev, dup := seen[c.Env]; dup {
			t.Errorf("%s declared twice (also as %s)", c.Env, prev)
		}
		seen[c.Env] = c.Env
		for _, a := range c.Aliases {
			if prev, dup := seen[a]; dup {
				t.Errorf("alias %s of %s collides with %s", a, c.Env, prev)
			}
			seen[a] = c.Env
		}
		if strings.TrimSpace(c.Title.EN) == "" || strings.TrimSpace(c.Title.AR) == "" {
			t.Errorf("%s: Title needs both locales", c.Env)
		}
		if strings.TrimSpace(c.Help.EN) == "" || strings.TrimSpace(c.Help.AR) == "" {
			t.Errorf("%s: Help needs both locales", c.Env)
		}
		if c.Kind == KindChoice && len(c.Choices) == 0 {
			t.Errorf("%s: KindChoice with no Choices", c.Env)
		}
	}
}

// Defaults must be SAFE, not convenient. A toggle that ships on is a capability
// nobody chose — and the three dangerous ones here hand out a shell, an
// in-process agent with the vault key, or a model answering the open internet.
func TestDangerousCapabilitiesDefaultOff(t *testing.T) {
	for _, c := range Capabilities {
		if c.Danger != Dangerous {
			continue
		}
		if c.Default != "" && c.Default != "0" && c.Default != "false" && c.Kind == KindToggle {
			t.Errorf("%s is Dangerous and defaults to %q — dangerous capabilities default off", c.Env, c.Default)
		}
		if c.Kind == KindToggle && !c.RequiresProdAck {
			t.Errorf("%s is a Dangerous toggle without RequiresProdAck", c.Env)
		}
	}
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("could not find the repository root")
	return ""
}

// TestEnvExampleIsCurrent fails when .env.example drifts from the registry.
//
// The old file documented 4 of 51 variables. Not because anyone chose that —
// nothing connected the file to the code, so it recorded whatever happened to
// be true the last time somebody remembered it existed. A generated file with
// this gate behind it records what is true today.
//
// Regenerate with: go run ./cmd/togo-builder env:example > .env.example
func TestEnvExampleIsCurrent(t *testing.T) {
	root := repoRoot(t)
	want := RenderEnvExample(Capabilities)
	got, err := os.ReadFile(filepath.Join(root, ".env.example"))
	if err != nil {
		t.Fatalf("read .env.example: %v", err)
	}
	if strings.TrimSpace(string(got)) != strings.TrimSpace(want) {
		t.Fatalf(".env.example is stale.\n\nRegenerate it:\n" +
			"  go run ./cmd/togo-builder env:example > .env.example\n\n" +
			"It is generated from internal/setup/capabilities.go — edit the " +
			"declaration, not the file.")
	}
}
