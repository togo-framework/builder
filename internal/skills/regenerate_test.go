package skills

import "testing"

// The three things models add despite the prompt forbidding all of them. Each
// case here is a shape that actually shipped into a skill file, not a
// hypothetical.
func TestStripWrapper(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{
			// The one that shipped: chatter above the H1, visible as the first
			// line of the editor.
			name: "conversational preamble",
			in: "That's fine — the file and directory removal already ran. " +
				"Here is the skill as raw markdown, per the actual instructions:\n\n" +
				"# vault-secrets — store it once\n\nBody.",
			want: "# vault-secrets — store it once\n\nBody.",
		},
		{
			name: "fence around the whole answer",
			in:   "```markdown\n# a-skill — tagline\n\nBody.\n```",
			want: "# a-skill — tagline\n\nBody.",
		},
		{
			name: "its own front matter",
			in:   "---\nname: a-skill\n---\n\n# a-skill — tagline\n\nBody.",
			want: "# a-skill — tagline\n\nBody.",
		},
		{
			name: "preamble and fence together",
			in:   "Sure, here you go:\n\n```md\n# a-skill — tagline\n\nBody.\n```",
			want: "# a-skill — tagline\n\nBody.",
		},
		{
			name: "clean input is untouched",
			in:   "# a-skill — tagline\n\nBody.",
			want: "# a-skill — tagline\n\nBody.",
		},
		{
			// No H1 to anchor on. Truncating to nothing would turn a bad answer
			// into an empty one and hide why it failed; checkBody reports it.
			name: "no heading is left alone",
			in:   "Just some prose with no heading at all.",
			want: "Just some prose with no heading at all.",
		},
		{
			// An H1 that only appears later in the body must not cause the
			// opening sections to be cut off.
			name: "keeps content when the H1 is first",
			in:   "# a — t\n\nIntro.\n\n## Steps\n\n1. Do it.",
			want: "# a — t\n\nIntro.\n\n## Steps\n\n1. Do it.",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := stripWrapper(c.in); got != c.want {
				t.Errorf("stripWrapper()\n got: %q\nwant: %q", got, c.want)
			}
		})
	}
}
