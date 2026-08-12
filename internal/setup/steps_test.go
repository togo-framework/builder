package setup

import (
	"strings"
	"testing"
)

type fakeEnv map[string]string

func (f fakeEnv) Get(k string) string { return f[k] }

// The wizard must never echo a secret back. A field that repopulates the
// database password so the input "looks filled in" has put the credential into
// an HTTP response, the browser's memory, and very likely a log. `Set` answers
// the only question the UI has.
func TestSecretsAreNeverEchoed(t *testing.T) {
	const secret = "postgres://user:hunter2@db.internal:5432/app"
	env := fakeEnv{
		"DATABASE_URL":      secret,
		"BUILDER_VAULT_KEY": "0123456789012345678901234567890123456789",
		"ADDR":              ":9000",
	}
	steps := Steps(Capabilities, env)

	var checked int
	for _, st := range steps {
		for _, f := range st.Fields {
			if f.Secret {
				if f.Value != "" {
					t.Errorf("%s is a secret and its value was returned: %q", f.Env, f.Value)
				}
				if f.Env == "DATABASE_URL" {
					checked++
					if !f.Set {
						t.Errorf("DATABASE_URL is set but Set was false")
					}
				}
			}
			if f.Env == "ADDR" {
				checked++
				// Non-secrets ARE echoed, so an operator can see what the
				// running install actually has.
				if f.Value != ":9000" {
					t.Errorf("ADDR value = %q, want :9000", f.Value)
				}
			}
		}
	}
	if checked != 2 {
		t.Fatalf("expected to check DATABASE_URL and ADDR, checked %d", checked)
	}
	// Belt and braces: the secret must not appear anywhere in the payload.
	for _, st := range steps {
		for _, f := range st.Fields {
			if strings.Contains(f.Value, "hunter2") {
				t.Fatalf("the secret leaked through %s", f.Env)
			}
		}
	}
}

// An unlabelled host is treated as production. It is far more likely to be a
// server nobody labelled than a laptop, and the failure directions are not
// symmetric: guessing "local" wrongly hands out a shell.
func TestUnlabelledHostIsNotLocal(t *testing.T) {
	for _, tc := range []struct {
		name string
		env  fakeEnv
		want bool
	}{
		{"nothing set", fakeEnv{}, false},
		{"production", fakeEnv{"APP_ENV": "production"}, false},
		{"development", fakeEnv{"APP_ENV": "development"}, true},
		{"local", fakeEnv{"APP_ENV": "local"}, true},
		{"alias ENV", fakeEnv{"ENV": "dev"}, true},
		{"alias TOGO_ENV", fakeEnv{"TOGO_ENV": "test"}, true},
		{"mixed case", fakeEnv{"APP_ENV": "Development"}, true},
		{"anything unrecognised is not local", fakeEnv{"APP_ENV": "staging"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsLocalHost(tc.env); got != tc.want {
				t.Errorf("IsLocalHost = %v, want %v", got, tc.want)
			}
		})
	}
}

// Every dangerous capability must reach the UI carrying the flag that makes the
// wizard demand an acknowledgement. This is the control that replaces "set
// APP_ENV=development to unlock it" — if the flag does not survive to the
// client, the guidance quietly reverts to lying about the environment.
func TestDangerousFieldsCarryTheProdAckFlag(t *testing.T) {
	steps := Steps(Capabilities, fakeEnv{})
	var seen int
	for _, st := range steps {
		for _, f := range st.Fields {
			if f.Danger != Dangerous {
				continue
			}
			seen++
			if f.Kind == KindToggle && !f.RequiresProdAck {
				t.Errorf("%s is a dangerous toggle but RequiresProdAck did not reach the UI", f.Env)
			}
			if f.Set {
				t.Errorf("%s reported set from an empty environment", f.Env)
			}
		}
	}
	if seen == 0 {
		t.Fatal("no dangerous capabilities reached the UI — the danger step would render empty")
	}
}

// The generated steps must cover every offered capability exactly once. A
// capability declared into a group with no step would be invisible, which is
// the failure this whole registry exists to prevent.
func TestEveryOfferedCapabilityGetsAStep(t *testing.T) {
	inSteps := map[string]int{}
	for _, st := range Steps(Capabilities, fakeEnv{}) {
		for _, f := range st.Fields {
			inSteps[f.Env]++
		}
	}
	for _, c := range Capabilities {
		if c.Deprecated != "" {
			if inSteps[c.Env] != 0 {
				t.Errorf("%s is deprecated but is still offered in the wizard", c.Env)
			}
			continue
		}
		if inSteps[c.Env] != 1 {
			t.Errorf("%s appears in %d steps, want exactly 1 (is its Group in GroupOrder?)", c.Env, inSteps[c.Env])
		}
	}
}
