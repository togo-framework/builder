package connections

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// render turns a delivery body into the text a memory will carry.
//
// A deliberately small template language: `{{ a.b.c }}` paths into the JSON
// body, and nothing else. No conditionals, no loops, no function calls.
//
// The endpoint is public and the template is operator-supplied, so anything
// richer is an expression evaluator reachable from the internet — and text/
// template in particular can walk methods on whatever it is handed. The job
// here is "put four fields from this payload into a sentence", which does not
// need a language.
func render(tmpl string, body []byte) (string, error) {
	if strings.TrimSpace(tmpl) == "" {
		return "", errors.New("the source has no template")
	}

	var data any
	if err := json.Unmarshal(body, &data); err != nil {
		// Not every webhook sends JSON. A template with no placeholders is
		// still valid for those — a fixed line like "a deploy finished" is a
		// legitimate mapping — so only fail if the template actually needs to
		// read something.
		if strings.Contains(tmpl, "{{") {
			return "", fmt.Errorf("body is not JSON, but the template reads from it: %w", err)
		}
		return tmpl, nil
	}

	var b strings.Builder
	rest := tmpl
	for {
		open := strings.Index(rest, "{{")
		if open < 0 {
			b.WriteString(rest)
			break
		}
		close := strings.Index(rest[open:], "}}")
		if close < 0 {
			// An unterminated placeholder is a typo in the template. Emitting
			// the rest verbatim would put "{{ deploy.stat" into project memory,
			// where it looks like corrupted data rather than a template bug.
			return "", errors.New("unterminated {{ in the template")
		}
		b.WriteString(rest[:open])
		path := strings.TrimSpace(rest[open+2 : open+close])
		b.WriteString(lookup(data, path))
		rest = rest[open+close+2:]
	}

	out := strings.TrimSpace(b.String())
	if out == "" {
		// An empty render means every placeholder missed. Retaining an empty
		// memory would be a silent no-op that looks like success.
		return "", errors.New("the template rendered empty — check its paths against the payload")
	}
	return out, nil
}

// lookup walks a dotted path. A miss renders empty rather than erroring: a
// payload that omits an optional field is normal, and one missing key should
// not discard the whole delivery.
func lookup(v any, path string) string {
	if path == "" {
		return ""
	}
	cur := v
	for _, seg := range strings.Split(path, ".") {
		switch t := cur.(type) {
		case map[string]any:
			cur = t[seg]
		case []any:
			i, err := strconv.Atoi(seg)
			if err != nil || i < 0 || i >= len(t) {
				return ""
			}
			cur = t[i]
		default:
			return ""
		}
		if cur == nil {
			return ""
		}
	}
	return stringify(cur)
}

func stringify(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case float64:
		// JSON numbers are float64. Render integers without a trailing ".0",
		// because "build 4123" reads better than "build 4123.0" in a memory
		// somebody will later recall.
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case nil:
		return ""
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}
