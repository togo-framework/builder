package integrations

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
)

// The catalogue is data, and the invariants it has to hold are the ones the UI
// renders from. A missing one shows up as a blank card rather than an error.
func TestEveryIntegrationIsRenderable(t *testing.T) {
	for _, i := range All() {
		if i.Slug == "" || i.Title.EN == "" || i.Title.AR == "" {
			t.Errorf("%q: needs a slug and a title in both locales", i.Slug)
		}
		if i.Summary.EN == "" || i.Summary.AR == "" {
			t.Errorf("%s: needs a summary in both locales — the gallery card is mostly summary", i.Slug)
		}
		if i.Icon == "" || i.Color == "" {
			t.Errorf("%s: needs an icon and a colour", i.Slug)
		}
		if !json.Valid(i.Inputs) {
			t.Errorf("%s: input schema is not valid JSON", i.Slug)
		}
		switch i.Category {
		case CatTerminal, CatAPI, CatDatabase, CatReader, CatAnalytics:
		default:
			t.Errorf("%s: unknown category %q", i.Slug, i.Category)
		}
	}
}

// AuthTerminal is a promise about behaviour: the Connect button opens a session
// and runs a command. An integration that claims it without one would render a
// button that does nothing.
func TestTerminalIntegrationsCarryTheirCommands(t *testing.T) {
	for _, i := range All() {
		if i.Auth != AuthTerminal {
			if i.Terminal != nil {
				t.Errorf("%s: has terminal commands but does not use AuthTerminal", i.Slug)
			}
			continue
		}
		if i.Terminal == nil {
			t.Fatalf("%s: AuthTerminal with no commands", i.Slug)
		}
		tm := i.Terminal
		if tm.Bin == "" {
			t.Errorf("%s: no binary to look for", i.Slug)
		}
		if len(tm.Login) == 0 {
			t.Errorf("%s: no login command", i.Slug)
		}
		if len(tm.Status) == 0 {
			t.Errorf("%s: no status command — 'connected?' would have to be remembered", i.Slug)
		}
		if tm.Install.EN == "" {
			t.Errorf("%s: no install hint; a missing binary would say nothing useful", i.Slug)
		}
		// The command must actually invoke the binary it claims to check for,
		// or LookPath guards one thing and the run does another.
		if tm.Login[0] != tm.Bin || tm.Status[0] != tm.Bin {
			t.Errorf("%s: login/status do not invoke %q", i.Slug, tm.Bin)
		}
	}
}

// A reader must not be able to act. This is the property the category exists to
// state, so it is asserted rather than assumed.
func TestReadersCannotAct(t *testing.T) {
	for _, i := range All() {
		if i.Category == CatReader && i.Acts {
			t.Errorf("%s is a reader but declares Acts", i.Slug)
		}
		if i.Acts && i.ActorKind == "" {
			t.Errorf("%s declares Acts but names no actor kind", i.Slug)
		}
		if i.Collects && i.SourceKind == "" {
			t.Errorf("%s declares Collects but names no source kind", i.Slug)
		}
	}
}

// Terminal integrations store no credential of ours, which is precisely why
// they are not blocked by SF-001. If one ever needs a vault secret, that
// reasoning stops holding and this test should be the thing that notices.
func TestTerminalIntegrationsNeedNoVaultSecret(t *testing.T) {
	for _, i := range All() {
		if i.Auth != AuthTerminal {
			continue
		}
		var props struct {
			Properties map[string]json.RawMessage `json:"properties"`
		}
		if err := json.Unmarshal(i.Inputs, &props); err != nil {
			t.Fatalf("%s: %v", i.Slug, err)
		}
		for name := range props.Properties {
			if strings.Contains(strings.ToLower(name), "secret") ||
				strings.Contains(strings.ToLower(name), "token") {
				t.Errorf("%s: input %q looks like a credential; terminal integrations let the CLI hold its own", i.Slug, name)
			}
		}
	}
}

// Probing must never hang or panic, whatever is installed on the machine.
func TestProbeAlwaysAnswers(t *testing.T) {
	for _, i := range All() {
		if i.Terminal == nil {
			continue
		}
		st := Probe(context.Background(), i)
		if st.Slug != i.Slug {
			t.Errorf("probe returned status for %q when asked about %q", st.Slug, i.Slug)
		}
		switch st.State {
		case StateConnected, StateDisconnected, StateMissing, StateUnknown:
		default:
			t.Errorf("%s: probe returned an unrenderable state %q", i.Slug, st.State)
		}
		// Whatever the state, the detail must be one bounded line — it goes in
		// a badge.
		if strings.ContainsAny(st.Detail, "\r\n") {
			t.Errorf("%s: detail spans lines: %q", i.Slug, st.Detail)
		}
		if len(st.Detail) > 160 {
			t.Errorf("%s: detail is %d chars", i.Slug, len(st.Detail))
		}
	}
}

// A binary that is genuinely absent must report Missing with an install hint,
// not Disconnected. Sign-in advice for something uninstalled wastes an
// afternoon.
func TestAnAbsentBinaryReportsMissing(t *testing.T) {
	st := Probe(context.Background(), Integration{
		Slug: "nope",
		Terminal: &Terminal{
			Bin:     "definitely-not-a-real-binary-xyzzy",
			Install: Text{EN: "install it", AR: "ثبّته"},
			Login:   []string{"definitely-not-a-real-binary-xyzzy", "login"},
			Status:  []string{"definitely-not-a-real-binary-xyzzy", "status"},
		},
	})
	if st.State != StateMissing {
		t.Fatalf("state was %q, want missing", st.State)
	}
	if st.Install.EN == "" {
		t.Fatal("a missing binary must carry its install hint")
	}
}

// Against whatever is actually on this machine. Not an assertion about the
// result — that depends on the developer's laptop — but the probe must agree
// with reality: if LookPath finds it, we must not say Missing.
func TestProbeAgreesWithThisMachine(t *testing.T) {
	for _, i := range All() {
		if i.Terminal == nil {
			continue
		}
		_, lookErr := exec.LookPath(i.Terminal.Bin)
		st := Probe(context.Background(), i)
		installed := lookErr == nil
		if installed && st.State == StateMissing {
			t.Errorf("%s: %s is on PATH but the probe said missing", i.Slug, i.Terminal.Bin)
		}
		if !installed && st.State != StateMissing {
			t.Errorf("%s: %s is not on PATH but the probe said %q", i.Slug, i.Terminal.Bin, st.State)
		}
		t.Logf("%-12s %-13s %s", i.Slug, st.State, st.Detail)
	}
}
