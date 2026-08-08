package fleet

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestNoSkillInTheCatalogueIsAStub asserts the invariant the gate exists to
// protect: every skill an agent can load is a procedure, not a restated brief.
//
// This replaces a calibration test that hardcoded the ten names the generator
// had produced and asserted the gate rejected all of them. That test did its
// job — it caught a first version of checkSkillBody that required a literal
// "## Steps" heading and would have rejected all nineteen hand-written skills —
// and then invalidated itself the moment those ten were regenerated, because
// the population it named no longer existed. A test that fails when you fix the
// problem it measures is a test that will be deleted rather than read.
//
// The invariant is durable: whatever is in .claude/skills/, none of it is thin.
func TestNoSkillInTheCatalogueIsAStub(t *testing.T) {
	// The dev app is where a real catalogue lives. Skipped rather than failed
	// when absent: the plugin's own tests must pass without it checked out.
	root := os.Getenv("BUILDER_SKILLS_FIXTURE")
	if root == "" {
		root = filepath.Join("..", "..", "..", "builder-dev", ".claude", "skills")
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Skipf("no skills fixture at %s: %v", root, err)
	}

	var thin []string
	checked := 0

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(root, e.Name(), "SKILL.md"))
		if err != nil {
			continue
		}
		// Strip the frontmatter: the gate judges the body a model returns, and
		// the frontmatter is added afterwards by renderSkill.
		body := string(b)
		if strings.HasPrefix(body, "---") {
			if i := strings.Index(body[3:], "\n---"); i >= 0 {
				body = body[i+7:]
			}
		}
		checked++
		if why := checkSkillBody(body); why != "" {
			thin = append(thin, e.Name()+": "+why)
		}
	}

	if checked == 0 {
		t.Skip("fixture contained no skills")
	}
	if len(thin) > 0 {
		t.Errorf("%d of %d skills would not pass the generator's own gate.\n"+
			"Regenerate them (POST /skills/{name}/regenerate) or write them by hand:\n  %s",
			len(thin), checked, strings.Join(thin, "\n  "))
	}
	t.Logf("checked %d skills", checked)
}

// TestCheckSkillBodyRejects pins the gate's behaviour against fixed inputs, so
// it keeps working regardless of what is on disk. The "one sentence" case is
// the exact shape the generator used to produce.
func TestCheckSkillBodyRejects(t *testing.T) {
	long := strings.Repeat("word ", minSkillWords+50)

	cases := []struct {
		name, body string
		wantReject bool
	}{
		{"empty", "", true},
		{"whitespace", "   \n\t ", true},
		{"one sentence", "Namespace per agent, retain and recall, and the secret prohibition.", true},
		{"long but no sections", long + "\n```sh\nls\n```", true},
		{"sections but no commands", long + "\n## When\n1. Do it.\n## Steps\n2. More.", true},
		{"complete", long + "\n## When to use this\nTriggers.\n## Steps\n1. Run it.\n```sh\ngo test ./...\n```", false},
		// Hand-written skills in this repository number or name their own
		// sections rather than using a literal "## Steps". Requiring that
		// heading rejected all nineteen of them; this case is why.
		{"numbered sections, no literal Steps heading",
			long + "\n## 1. Bundle scan\nDo it.\n## 2. Live render\n```sh\ncurl -s localhost\n```", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			why := checkSkillBody(c.body)
			if c.wantReject && why == "" {
				t.Fatalf("expected a rejection, got none")
			}
			if !c.wantReject && why != "" {
				t.Fatalf("expected acceptance, got %q", why)
			}
		})
	}
}
