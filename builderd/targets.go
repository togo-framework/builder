package main

import (
	"fmt"
	"net/url"
	"strings"
)

// The shell's target list.
//
// # WHY AN ENV VAR AND NOT A CONFIG FILE
//
// builderd is configured entirely through the environment — ADDR,
// DATABASE_URL, DB_DRIVER, BUILDER_WORKDIR, BUILDER_WEB_DIR, BUILDER_RUNNER,
// BUILDER_VAULT_KEY. Introducing a JSON file for this one setting would add a
// second configuration mechanism to a binary that has exactly one: a path to
// resolve relative to something (cwd? the binary? the workdir?), a parse error
// surface with its own failure mode, a file that has to be mounted into every
// container beside the binary, and a second place an operator has to look when
// the shell frames the wrong thing.
//
// What is being configured here is a list of two-field records — a name and a
// URL — usually two to four of them. A file earns its keep when the records
// carry many fields, nest, or are long enough that a shell line becomes
// unreadable. These do not. One line reads fine:
//
//	BUILDER_TARGETS="app=https://app.co,auth=https://auth.app.co,dashboard=https://dashboard.app.co"
//
// and it works unchanged in a .env file, a docker-compose `environment:`, a
// systemd unit, a Cloud Run service and an `export` in a shell — every one of
// which can carry an env var and only some of which can conveniently carry a
// file.
//
// BUILDER_TARGET (singular) stays exactly as it was: when BUILDER_TARGETS is
// empty it becomes a one-entry list, so every existing deployment keeps
// working and the shell it renders is byte-identical to today's.

const defaultTarget = "http://localhost:3000"

// target is one application the shell hosts.
//
// Origin is the load-bearing field. It is derived HERE, from configuration,
// and it is the only origin the corresponding frame is ever allowed to speak
// from — a frame that navigates itself somewhere else simply stops being
// heard. Nothing the frame says can change it.
type target struct {
	// ID is the stable key every bridge message is routed and stamped with.
	// Slugged from the name so it survives a URL change: an issue filed from
	// "auth" stays attributable after auth.app.co moves to id.app.co.
	ID string
	// Name is what the operator reads in the switcher and what the filed
	// issue says it came from.
	Name string
	// URL is the frame's initial src and the liveness probe's endpoint.
	URL string
	// Origin is scheme://host[:port] — the security boundary for this frame.
	Origin string
	// Active marks the one frame in view. Set per request, never by config.
	Active bool
}

// parseTargets turns the two env vars into the hosted list.
//
// list is BUILDER_TARGETS: `name=url` entries separated by commas or newlines,
// where a bare `url` takes its host as the name. single is BUILDER_TARGET, used
// only when list is empty. Neither set falls back to defaultTarget, so an
// operator who has read nothing still gets a working shell.
func parseTargets(list, single string) ([]target, error) {
	entries := splitEntries(list)
	if len(entries) == 0 {
		if s := strings.TrimSpace(single); s != "" {
			entries = []string{s}
		} else {
			entries = []string{defaultTarget}
		}
	}

	out := make([]target, 0, len(entries))
	seen := make(map[string]bool, len(entries))
	for _, e := range entries {
		t, err := parseEntry(e)
		if err != nil {
			return nil, err
		}
		// A duplicate id would make two frames indistinguishable to the relay,
		// which routes by id — the exact failure this whole change exists to
		// prevent. Refuse rather than silently host one of them.
		if seen[t.ID] {
			return nil, fmt.Errorf("two targets resolve to the same name %q — give one an explicit name=url", t.ID)
		}
		seen[t.ID] = true
		out = append(out, t)
	}
	return out, nil
}

// splitEntries breaks the list on commas and newlines.
//
// Both, because the same value is written two ways depending on where it
// lives: one line in a shell export, several lines in a compose file or a
// heredoc. A URL containing a literal comma is not supported and would have to
// be percent-encoded; no host or path this list will ever carry has one.
func splitEntries(s string) []string {
	raw := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r'
	})
	out := make([]string, 0, len(raw))
	for _, e := range raw {
		if e = strings.TrimSpace(e); e != "" {
			out = append(out, e)
		}
	}
	return out
}

// parseEntry reads one `name=url` (or bare `url`) entry.
func parseEntry(entry string) (target, error) {
	name, raw := "", entry
	// SplitN on the FIRST '=': a URL's query string is full of them, and
	// splitting on the last would turn `app=https://x/?a=b` into a name of
	// "app=https://x/?a" and a URL of "b".
	if i := strings.Index(entry, "="); i > 0 {
		// Only when what precedes it is a name and not a scheme fragment.
		// "https://x" has no '=' before its first '/', so this is unambiguous.
		if before := entry[:i]; !strings.ContainsAny(before, ":/") {
			name = strings.TrimSpace(before)
			raw = strings.TrimSpace(entry[i+1:])
		}
	}

	u, err := url.Parse(raw)
	if err != nil {
		return target{}, fmt.Errorf("target %q is not a URL: %w", entry, err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return target{}, fmt.Errorf("target %q must be http or https, got %q", entry, u.Scheme)
	}
	if u.Host == "" {
		return target{}, fmt.Errorf("target %q has no host", entry)
	}

	if name == "" {
		name = strings.TrimPrefix(u.Host, "www.")
	}
	id := slug(name)
	if id == "" {
		return target{}, fmt.Errorf("target %q has no usable name", entry)
	}

	return target{
		ID:   id,
		Name: name,
		URL:  u.String(),
		// url.URL.Scheme + Host, not a string cut: this is what every
		// postMessage targetOrigin and every event.origin check compares
		// against, and hand-parsing it is how a trailing slash or a default
		// port ends up silencing a frame that is behaving perfectly.
		Origin: u.Scheme + "://" + u.Host,
	}, nil
}

// slug reduces a display name to a message key: lowercase, ASCII alphanumerics
// and dashes, no leading or trailing dash.
//
// Deliberately lossy for non-ASCII: an operator may name an app in Arabic and
// the switcher will show that name, but the id it routes on stays a URL-safe
// ASCII token because it also lands in ?app= and in the filed issue. A name
// with no ASCII at all yields an empty id, which parseEntry rejects with a
// message asking for an explicit name — better than minting "app-2", which
// would be stable only until somebody reorders the list.
func slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			// One dash per run of separators, and never a leading one.
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}
