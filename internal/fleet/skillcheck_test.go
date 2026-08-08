package fleet

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCheckSkillBodyAgainstRealSkills calibrates the gate against the two
// populations that actually exist in a builder install: the skills a human
// wrote, and the ones the generator produced before the gate existed.
//
// This is the assertion that matters. A word-count threshold is easy to write
// and easy to get wrong in either direction — too low and the stubs pass, too
// high and a real-but-terse skill is rejected on every generation. Pointing it
// at the real files is the only way to know which it is.
func TestCheckSkillBodyAgainstRealSkills(t *testing.T) {
	// The dev app is where both populations live. Skipped rather than failed
	// when absent: the plugin's own tests must pass without it checked out.
	root := os.Getenv("BUILDER_SKILLS_FIXTURE")
	if root == "" {
		root = filepath.Join("..", "..", "..", "builder-dev", ".claude", "skills")
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Skipf("no skills fixture at %s: %v", root, err)
	}

	// The ten the generator produced. Each is a single restated sentence.
	generated := map[string]bool{
		"brain-memory": true, "blueprint-scaffold": true, "feedback-sdk": true,
		"vault-secrets": true, "human-in-the-loop": true, "issue-plane": true,
		"pin-anchor-resolution": true, "agent-run-lifecycle": true,
		"realtime-sse": true, "setup-preflight": true,
	}

	var passedStub, rejectedReal []string
	seenGenerated, seenReal := 0, 0

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(root, e.Name(), "SKILL.md"))
		if err != nil {
			continue
		}
		// Strip the frontmatter: the gate judges the body the model returns,
		// and the frontmatter is added afterwards by renderSkill.
		body := string(b)
		if strings.HasPrefix(body, "---") {
			if i := strings.Index(body[3:], "\n---"); i >= 0 {
				body = body[i+7:]
			}
		}

		why := checkSkillBody(body)
		if generated[e.Name()] {
			seenGenerated++
			if why == "" {
				passedStub = append(passedStub, e.Name())
			}
		} else {
			seenReal++
			if why != "" {
				rejectedReal = append(rejectedReal, e.Name()+": "+why)
			}
		}
	}

	if seenGenerated == 0 || seenReal == 0 {
		t.Skipf("fixture did not contain both populations (generated=%d real=%d)",
			seenGenerated, seenReal)
	}
	if len(passedStub) > 0 {
		t.Errorf("the gate let %d generated stub(s) through: %v", len(passedStub), passedStub)
	}
	if len(rejectedReal) > 0 {
		t.Errorf("the gate rejected %d hand-written skill(s):\n  %s",
			len(rejectedReal), strings.Join(rejectedReal, "\n  "))
	}
	t.Logf("checked %d generated and %d hand-written skills", seenGenerated, seenReal)
}

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
