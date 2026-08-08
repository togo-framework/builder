package skills

import "testing"

func TestParseSkillMD(t *testing.T) {
	cases := []struct {
		name              string
		raw               string
		wantName, wantDsc string
		wantBody          string
	}{
		{
			name:     "frontmatter and body",
			raw:      "---\nname: verify\ndescription: Collect the evidence.\n---\n\n# verify\n\nBody.\n",
			wantName: "verify", wantDsc: "Collect the evidence.",
			wantBody: "# verify\n\nBody.\n",
		},
		{
			// A description containing a colon has to be quoted in the file, and
			// the quotes are not part of the value.
			name:     "quoted scalar",
			raw:      "---\nname: x\ndescription: \"Use when: you need it\"\n---\n\nBody.\n",
			wantName: "x", wantDsc: "Use when: you need it", wantBody: "Body.\n",
		},
		{
			name: "crlf",
			raw:  "---\r\nname: x\r\ndescription: y\r\n---\r\n\r\nBody.\r\n",
			// \r\n is normalised, so the body must not keep a stray \r that
			// would end up written back to disk.
			wantName: "x", wantDsc: "y", wantBody: "Body.\n",
		},
		{
			name:     "byte order mark",
			raw:      "\ufeff---\nname: x\ndescription: y\n---\n\nBody.\n",
			wantName: "x", wantDsc: "y", wantBody: "Body.\n",
		},
		{
			// An unterminated fence is prose that starts with a rule, not
			// frontmatter — losing the whole file to it would be silent.
			name:     "unterminated fence keeps the body",
			raw:      "---\nname: x\nno close fence\n",
			wantName: "", wantDsc: "", wantBody: "---\nname: x\nno close fence\n",
		},
		{
			name:     "no frontmatter",
			raw:      "# Just markdown\n",
			wantName: "", wantDsc: "", wantBody: "# Just markdown\n",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fm, body := parseSkillMD(tc.raw)
			if fm.Name != tc.wantName {
				t.Errorf("name = %q, want %q", fm.Name, tc.wantName)
			}
			if fm.Description != tc.wantDsc {
				t.Errorf("description = %q, want %q", fm.Description, tc.wantDsc)
			}
			if body != tc.wantBody {
				t.Errorf("body = %q, want %q", body, tc.wantBody)
			}
		})
	}
}

func TestRenderSkillMDRoundTrips(t *testing.T) {
	body := "# Title\n\nDo the thing.\n"
	out := renderSkillMD("my-skill", "Use when: it matters", body)

	fm, got := parseSkillMD(out)
	if fm.Name != "my-skill" {
		t.Errorf("name = %q", fm.Name)
	}
	if fm.Description != "Use when: it matters" {
		t.Errorf("description = %q", fm.Description)
	}
	if got != body {
		t.Errorf("body = %q, want %q", got, body)
	}
}

func TestTruncateStopsOnRuneBoundary(t *testing.T) {
	// Arabic is two bytes per character: cutting at 5 lands mid-rune, and the
	// invalid UTF-8 that produces is rejected by Postgres on write.
	got := truncate("مرحبا", 5)
	for i := 0; i < len(got); i++ {
		_ = got[i]
	}
	if len(got) != 4 {
		t.Errorf("len = %d, want 4 (two whole characters)", len(got))
	}
}

func TestNameRe(t *testing.T) {
	// A trailing hyphen is ugly but harmless — it is still a legal directory
	// name and a legal text[] element, which is all the rule is protecting.
	ok := []string{"verify", "a1", "my-skill-2", "0-start", "trailing-"}
	// The ones that matter: a name that could escape the skills directory, be
	// read by git as a flag, or need escaping inside a Postgres array literal.
	bad := []string{"", "a", "A", "with space", "with/slash", "..", "-lead", `quo"te`, "back\\slash"}
	for _, s := range ok {
		if !nameRe.MatchString(s) {
			t.Errorf("%q should be a valid skill name", s)
		}
	}
	for _, s := range bad {
		if nameRe.MatchString(s) {
			t.Errorf("%q should not be a valid skill name", s)
		}
	}
}

func TestCleanSubPathRejectsEscapes(t *testing.T) {
	for _, s := range []string{"../etc", "..", "skills/../../etc", "/../x"} {
		if p, err := cleanSubPath(s); err == nil {
			t.Errorf("cleanSubPath(%q) = %q, want an error", s, p)
		}
	}
	for _, tc := range []struct{ in, want string }{
		{"", ""}, {"/skills/", "skills"}, {"a/b", "a/b"}, {"./skills", "skills"},
	} {
		got, err := cleanSubPath(tc.in)
		if err != nil {
			t.Errorf("cleanSubPath(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("cleanSubPath(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRepoReRejectsHostileInput(t *testing.T) {
	bad := []string{
		"", "owner", "owner/name/extra", "-flag/name", "owner/-flag",
		"owner name/x", "../../etc/passwd", "owner/name;rm -rf /",
		"https://evil.com/a/b", "owner/na me",
	}
	for _, s := range bad {
		if repoRe.MatchString(s) {
			t.Errorf("%q should be rejected", s)
		}
	}
	for _, s := range []string{"anthropics/skills", "a/b", "Owner_1/repo.name-2"} {
		if !repoRe.MatchString(s) {
			t.Errorf("%q should be accepted", s)
		}
	}
}
