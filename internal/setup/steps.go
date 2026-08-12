package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
)

// The capability steps of the wizard, derived from the registry.
//
// Derived, not written. The five hand-declared steps (welcome, preflight, plan,
// fleet, done) configured nothing, and every capability the product has lived
// outside the wizard entirely. Generating the middle steps from `Group` means
// adding a capability adds its step — which is the operator's rule, expressed
// as code rather than as a note in a README nobody re-reads.

// osEnv reads the process environment.
type osEnv struct{}

func (osEnv) Get(name string) string { return os.Getenv(name) }

// FieldState is one capability as the wizard renders it.
//
// Note what is NOT here: the value of a secret. A wizard that echoes back the
// database password so the field looks populated has put the credential in an
// HTTP response, a browser's memory, and probably a log. `Set` answers the only
// question the UI actually needs.
type FieldState struct {
	Env         string    `json:"env"`
	Title       Loc       `json:"title"`
	Help        Loc       `json:"help"`
	Kind        Kind      `json:"kind"`
	Choices     []ChoiceJ `json:"choices,omitempty"`
	Default     string    `json:"default,omitempty"`
	Placeholder string    `json:"placeholder,omitempty"`
	Danger      Danger    `json:"danger"`
	Secret      bool      `json:"secret,omitempty"`

	// RequiresProdAck tells the UI to demand a typed acknowledgement before
	// this can be enabled on a host that is not local.
	RequiresProdAck bool `json:"requiresProdAck,omitempty"`

	// Set reports whether a value is present, never what it is.
	Set bool `json:"set"`

	// Value is echoed ONLY for non-secret capabilities, so the operator can see
	// what the current install is actually running with.
	Value string `json:"value,omitempty"`

	Unlocks []Loc `json:"unlocks,omitempty"`
}

// Loc is the wire form of a Localized string.
type Loc struct {
	EN string `json:"en"`
	AR string `json:"ar"`
}

// ChoiceJ is the wire form of a Choice.
type ChoiceJ struct {
	Value string `json:"value"`
	Label Loc    `json:"label"`
}

// StepState is one generated wizard step.
type StepState struct {
	ID     Group        `json:"id"`
	Title  Loc          `json:"title"`
	Blurb  Loc          `json:"blurb"`
	Danger bool         `json:"danger,omitempty"`
	Fields []FieldState `json:"fields"`
}

var groupTitle = map[Group]Loc{
	GroupCore:        {EN: "Core", AR: "الأساسيات"},
	GroupAgents:      {EN: "Agents", AR: "الوكلاء"},
	GroupBrain:       {EN: "Memory", AR: "الذاكرة"},
	GroupConnections: {EN: "Connections", AR: "الاتصالات"},
	GroupSDK:         {EN: "Widget", AR: "الأداة"},
	GroupDanger:      {EN: "Powerful switches", AR: "مفاتيح خطرة"},
}

var groupBlurb = map[Group]Loc{
	GroupCore: {
		EN: "What the builder needs to start at all.",
		AR: "ما يحتاجه الباني للإقلاع أصلاً.",
	},
	GroupAgents: {
		EN: "Whether agents run, where they execute, and what they may spend.",
		AR: "هل تعمل الوكلاء، وأين تُنفَّذ، وكم يُسمح لها أن تنفق.",
	},
	GroupBrain: {
		EN: "Semantic recall. Unset, the brain matches keywords rather than meaning — usable, but noticeably worse.",
		AR: "الاسترجاع الدلالي. بدونه تطابق الذاكرة الكلمات لا المعاني — صالح للعمل لكنه أضعف بوضوح.",
	},
	GroupConnections: {
		EN: "Where files, apps and skills live on disk.",
		AR: "أين تُخزَّن الملفات والتطبيقات والمهارات على القرص.",
	},
	GroupSDK: {
		EN: "How the feedback widget looks, and which sites may post to it.",
		AR: "شكل أداة الملاحظات، والمواقع المسموح لها بالإرسال إليها.",
	},
	GroupDanger: {
		EN: "Each of these hands out real capability over this host. They are off unless you turn them on, and off a local machine each needs an explicit acknowledgement. None of them should be set because a guide told you to unlock something else.",
		AR: "كل مفتاح هنا يمنح صلاحية حقيقية على هذا الخادم. جميعها مغلقة ما لم تفتحها، وخارج الجهاز المحلي يحتاج كل منها إقراراً صريحاً. ولا ينبغي ضبط أيٍّ منها لأن دليلاً ما طلب فتح شيء آخر.",
	},
}

func loc(l Localized) Loc { return Loc{EN: l.EN, AR: l.AR} }

// Steps renders the capability steps for the wizard.
func Steps(r Registry, env Env) []StepState {
	var out []StepState
	for _, g := range GroupOrder {
		caps := r.InGroup(g)
		if len(caps) == 0 {
			continue
		}
		st := StepState{
			ID:     g,
			Title:  groupTitle[g],
			Blurb:  groupBlurb[g],
			Danger: g == GroupDanger,
		}
		for _, c := range caps {
			v := strings.TrimSpace(env.Get(c.Env))
			for _, a := range c.Aliases {
				if v == "" {
					v = strings.TrimSpace(env.Get(a))
				}
			}
			f := FieldState{
				Env: c.Env, Title: loc(c.Title), Help: loc(c.Help),
				Kind: c.Kind, Default: c.Default, Placeholder: c.Placeholder,
				Danger: c.Danger, Secret: c.Kind == KindSecret,
				RequiresProdAck: c.RequiresProdAck,
				Set:             v != "",
			}
			if c.Kind != KindSecret {
				f.Value = v
			}
			for _, ch := range c.Choices {
				f.Choices = append(f.Choices, ChoiceJ{Value: ch.Value, Label: loc(ch.Label)})
			}
			for _, u := range c.Unlocks {
				f.Unlocks = append(f.Unlocks, loc(u))
			}
			st.Fields = append(st.Fields, f)
		}
		out = append(out, st)
	}
	return out
}

// IsLocalHost reports whether this install looks like a development machine.
//
// Used only to decide whether a dangerous capability needs the typed
// acknowledgement. It reads APP_ENV and its aliases — the same signal the
// terminal guard uses — so the two cannot disagree about what "local" means.
func IsLocalHost(env Env) bool {
	for _, n := range []string{"APP_ENV", "ENV", "TOGO_ENV"} {
		switch strings.ToLower(strings.TrimSpace(env.Get(n))) {
		case "local", "development", "dev", "test":
			return true
		case "":
			continue
		default:
			return false
		}
	}
	// Nothing set at all: treat as production. An unlabelled host is far more
	// likely to be a server somebody forgot to label than a laptop.
	return false
}

// handleCapabilities renders the generated steps.
func (s *Service) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	env := osEnv{}
	writeJSON(w, http.StatusOK, map[string]any{
		"steps":   Steps(Capabilities, env),
		"isLocal": IsLocalHost(env),
	})
}

// handleCapabilityProbe runs the probes for one step and reports what each
// actually found.
func (s *Service) handleCapabilityProbe(w http.ResponseWriter, r *http.Request) {
	group := Group(strings.TrimSpace(r.URL.Query().Get("group")))
	env := osEnv{}
	type row struct {
		Env    string `json:"env"`
		OK     bool   `json:"ok"`
		Detail string `json:"detail"`
		Fatal  bool   `json:"fatal,omitempty"`
	}
	var rows []row
	for _, c := range Capabilities {
		if group != "" && c.Group != group {
			continue
		}
		if c.Probe == nil {
			continue
		}
		res := c.Probe(r.Context(), env)
		rows = append(rows, row{Env: c.Env, OK: res.OK, Detail: res.Detail, Fatal: res.Fatal})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Env < rows[j].Env })
	writeJSON(w, http.StatusOK, map[string]any{"results": rows})
}

// handleEnvFragment returns the .env lines for values the operator chose.
//
// The wizard does NOT write .env itself, and that is deliberate. Configuration
// has one source of truth per install — a file, a secret store, an IaC map —
// and a process that edits its own environment file behind the operator's back
// makes a fourth. It also cannot work: the running process has already read its
// environment, so anything written now takes effect at a restart the operator
// has to perform anyway.
//
// So: return exactly the lines to add, in the operator's own file, and let them
// apply it. Secrets are returned to the caller that just typed them and are
// never logged.
func (s *Service) handleEnvFragment(w http.ResponseWriter, r *http.Request) {
	var in map[string]string
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bad body"})
		return
	}
	var (
		lines    []string
		unknown  []string
		declared = Capabilities.Names()
	)
	keys := make([]string, 0, len(in))
	for k := range in {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if !declared[k] {
			unknown = append(unknown, k)
			continue
		}
		v := in[k]
		if strings.TrimSpace(v) == "" {
			continue
		}
		// Quote anything that would not survive a shell-sourced .env.
		if strings.ContainsAny(v, " \t\"'$#") {
			v = `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
		}
		lines = append(lines, fmt.Sprintf("%s=%s", k, v))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"fragment": strings.Join(lines, "\n"),
		"unknown":  unknown,
		"note": "Add these to your .env and restart. The builder reads its environment " +
			"at boot, so nothing here takes effect until then.",
	})
}

var _ = context.Background
