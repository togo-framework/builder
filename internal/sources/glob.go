package sources

import (
	"path"
	"strings"
)

// Match reports whether a slash-separated path matches a gitignore-style
// pattern.
//
// path.Match alone is not enough: its `*` does not cross a separator and it has
// no `**` at all, so `docs/**` — the single most obvious include pattern anyone
// will type — matches nothing. Rather than leave that as a footgun, `**` is
// handled here and every other segment is delegated to path.Match.
//
// Rules:
//   - `**` matches zero or more whole segments, so `docs/**` matches `docs/a.md`
//     and `docs/adr/1.md`, and also `docs` itself.
//   - `*` and `?` match within one segment, via path.Match.
//   - A pattern with no `/` matches against the BASENAME, so `README*` finds
//     `README.md` at the root and `sub/README.md` alike. This is what people
//     mean when they type it.
//   - Matching is case-insensitive: GitHub repositories contain README.md,
//     readme.md and Readme.md, and an operator should not have to guess.
func Match(pattern, name string) bool {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" || name == "" {
		return false
	}
	pattern = strings.ToLower(strings.TrimPrefix(pattern, "./"))
	name = strings.ToLower(strings.TrimPrefix(name, "./"))

	if !strings.Contains(pattern, "/") {
		return matchSegments(strings.Split(pattern, "/"), []string{path.Base(name)})
	}
	return matchSegments(strings.Split(pattern, "/"), strings.Split(name, "/"))
}

// MatchAny reports whether any pattern matches. An empty pattern list matches
// nothing — an include list that silently meant "everything" would pull an
// entire repository into the brain on a typo.
func MatchAny(patterns []string, name string) bool {
	for _, p := range patterns {
		if Match(p, name) {
			return true
		}
	}
	return false
}

func matchSegments(pat, seg []string) bool {
	switch {
	case len(pat) == 0:
		return len(seg) == 0
	case pat[0] == "**":
		// Zero segments consumed, or one and try again. The trailing `**` case
		// (nothing left to match) falls out of the zero-consumed branch.
		if matchSegments(pat[1:], seg) {
			return true
		}
		for i := range seg {
			if matchSegments(pat[1:], seg[i+1:]) {
				return true
			}
		}
		return false
	case len(seg) == 0:
		return false
	default:
		ok, err := path.Match(pat[0], seg[0])
		if err != nil || !ok {
			return false
		}
		return matchSegments(pat[1:], seg[1:])
	}
}
