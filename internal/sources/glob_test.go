package sources

import "testing"

func TestMatch(t *testing.T) {
	cases := []struct {
		pattern, path string
		want          bool
	}{
		// The pattern everyone types first, and the reason path.Match alone is
		// not enough: its `*` does not cross a separator and it has no `**`.
		{"docs/**", "docs/guide.md", true},
		{"docs/**", "docs/adr/0001.md", true},
		{"docs/**", "docs", true},
		{"docs/**", "internal/docs/guide.md", false},
		{"docs/*", "docs/guide.md", true},
		{"docs/*", "docs/adr/0001.md", false},

		{"**/adr/**", "docs/adr/0001.md", true},
		{"**/adr/**", "adr/0001.md", true},
		{"**/adr/**", "a/b/c/adr/x/y.md", true},
		{"**/adr/**", "docs/guide.md", false},

		// A bare pattern matches the basename, which is what someone means by
		// "README*".
		{"README*", "README.md", true},
		{"README*", "sub/dir/README.rst", true},
		{"README*", "docs/guide.md", false},

		// Case-insensitive: a repository holds README.md, readme.md and
		// Readme.md, and an operator should not have to guess which.
		{"readme*", "README.md", true},
		{"DOCS/**", "docs/guide.md", true},

		{"*.md", "guide.md", true},
		{"*.md", "docs/guide.md", true}, // basename rule
		{"docs/*.md", "docs/guide.md", true},
		{"docs/*.md", "docs/guide.txt", false},

		{"", "docs/guide.md", false},
		{"docs/**", "", false},
	}
	for _, c := range cases {
		if got := Match(c.pattern, c.path); got != c.want {
			t.Errorf("Match(%q, %q) = %v, want %v", c.pattern, c.path, got, c.want)
		}
	}
}

// An empty include list matches nothing. The alternative — treating it as
// "everything" — pulls a whole repository into the brain on a typo.
func TestMatchAnyWithNoPatternsMatchesNothing(t *testing.T) {
	if MatchAny(nil, "README.md") {
		t.Error("an empty pattern list matched")
	}
	if !MatchAny([]string{"nope/**", "README*"}, "README.md") {
		t.Error("a later pattern in the list did not match")
	}
}
