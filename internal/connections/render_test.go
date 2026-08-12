package connections

import (
	"strings"
	"testing"
)

// The template language is deliberately tiny: dotted paths and nothing else.
// The endpoint is public and the template is operator-supplied, so anything
// richer would be an expression evaluator reachable from the internet.
func TestRender(t *testing.T) {
	body := []byte(`{
		"deploy": {"status": "failed", "build": 4123, "ok": false, "ratio": 0.25},
		"repo": {"name": "builder"},
		"commits": [{"sha": "abc"}, {"sha": "def"}],
		"nothing": null
	}`)

	for _, tc := range []struct {
		name, tmpl, want string
	}{
		{"plain text passes through", "a deploy finished", "a deploy finished"},
		{"a dotted path", "status: {{ deploy.status }}", "status: failed"},
		{"several paths", "{{ repo.name }} build {{ deploy.build }}", "builder build 4123"},
		// "build 4123" reads better in a recalled memory than "build 4123.0".
		{"whole numbers lose the .0", "{{ deploy.build }}", "4123"},
		{"real fractions survive", "{{ deploy.ratio }}", "0.25"},
		{"booleans render", "{{ deploy.ok }}", "false"},
		{"array index", "{{ commits.0.sha }}", "abc"},
		{"no spaces needed", "{{repo.name}}", "builder"},
		// A payload that omits an optional field is normal; one missing key
		// must not discard the whole delivery.
		{"a missing key renders empty", "x{{ deploy.nope }}y", "xy"},
		{"a null renders empty", "x{{ nothing }}y", "xy"},
		{"walking into a scalar renders empty", "x{{ deploy.status.deeper }}y", "xy"},
		{"an out-of-range index renders empty", "x{{ commits.9.sha }}y", "xy"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := render(tc.tmpl, body)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRenderRefusals(t *testing.T) {
	body := []byte(`{"a": 1}`)
	for _, tc := range []struct {
		name, tmpl, wantErr string
		body                []byte
	}{
		{name: "an empty template", tmpl: "  ", wantErr: "no template", body: body},
		// Emitting the rest verbatim would put "{{ deploy.stat" into project
		// memory, where it reads as corrupted data rather than a template bug.
		{name: "an unterminated placeholder", tmpl: "x {{ a.b", wantErr: "unterminated", body: body},
		// An empty render means every path missed. Retaining an empty memory
		// would be a silent no-op that looks like success.
		{name: "everything missed", tmpl: "{{ nope }}", wantErr: "rendered empty", body: body},
		{name: "non-JSON body a template reads from", tmpl: "{{ a }}", wantErr: "not JSON",
			body: []byte("plain text")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := render(tc.tmpl, tc.body)
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("got %v, want an error containing %q", err, tc.wantErr)
			}
		})
	}
}

// A fixed line is a legitimate mapping for a sender that posts form data or
// anything else non-JSON, so it must not be rejected for the body's sake.
func TestRenderAcceptsNonJSONWhenTheTemplateDoesNotReadIt(t *testing.T) {
	got, err := render("a deploy finished", []byte("not json at all"))
	if err != nil {
		t.Fatal(err)
	}
	if got != "a deploy finished" {
		t.Errorf("got %q", got)
	}
}

// Header names are logged; values never are. This pins the encoder that writes
// them, since a broken array literal would be noticed as missing debug data
// long before anyone checked it was not also writing values.
func TestPgTextArray(t *testing.T) {
	for _, tc := range []struct {
		in   []string
		want string
	}{
		{nil, "{}"},
		{[]string{}, "{}"},
		{[]string{"Content-Type"}, `{"Content-Type"}`},
		{[]string{"A", "B"}, `{"A","B"}`},
		{[]string{`we"ird`}, `{"we\"ird"}`},
		{[]string{`back\slash`}, `{"back\\slash"}`},
	} {
		if got := pgTextArray(tc.in); got != tc.want {
			t.Errorf("pgTextArray(%v) = %s, want %s", tc.in, got, tc.want)
		}
	}
}
