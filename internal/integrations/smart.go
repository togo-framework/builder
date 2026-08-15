package integrations

// Smart connect: describe a connection in a sentence, get a working one.
//
//	POST /smart  {"prompt": "read my Go blog feed at https://go.dev/blog/feed.atom"}
//
// # The shape of this, and why it is not "let the agent do it"
//
// The obvious implementation gives a model shell access and asks it to wire the
// connection. This does not do that. The model produces a PLAN — which
// integration, what name, what configuration — as structured JSON, and THIS
// package executes it against the same validated path the form uses.
//
// The difference matters for three reasons:
//
//  1. The plan is validated against the integration's own schema and its
//     runner's constructor before anything is stored. A model that invents a
//     field gets a 422 the operator can read, not a row that fails at 3am.
//  2. There is no arbitrary execution. The worst a bad plan can do is create a
//     connection row, which is exactly what the form can already do.
//  3. It is reviewable. The plan is returned alongside the result, so an
//     operator can see what was understood before deciding to keep it.
//
// # The credential never reaches the model
//
// This is the part worth reading carefully.
//
// The operator's prompt contains the secret — that is the whole point of
// pasting it. Before the prompt goes anywhere near a model, secret-shaped
// substrings are found, REPLACED with placeholders, and stored in the vault
// under generated names. The model sees "use the secret named
// smart.slack.token" and never the token itself, so the credential does not
// enter a model context, a model provider's logs, or the run transcript.
//
// Rule 34 says an agent references a secret by name and never handles the
// value. Redacting before the call is how that rule is kept while still letting
// an operator paste a credential into a box, which is what they want to do.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// Planner runs one bounded model call and returns its text.
//
// An interface rather than a concrete session so this package does not depend
// on the runner, and so a test can plan without spending money.
type Planner interface {
	Plan(ctx context.Context, prompt string) (string, error)
}

var planner Planner

// SetPlanner installs the model client. Called once during boot.
func SetPlanner(p Planner) { planner = p }

// Creator makes a connection once the plan is validated.
//
// Satisfied by *sources.Store. Narrow on purpose: this package may create a
// connection and test it, and nothing else.
type Creator interface {
	CreateFromPlan(ctx context.Context, kind, name string, config json.RawMessage) (string, error)
	TestConnection(ctx context.Context, id string) error
}

var creator Creator

// SetCreator installs the connection creator. Called once during boot.
func SetCreator(c Creator) { creator = c }

// ─────────────────────────── secret redaction ───────────────────────────

// secretPatterns are the shapes worth pulling out of a prompt before it is sent
// to a model.
//
// Deliberately generous. A false positive costs a vault entry nobody uses; a
// false negative puts a live credential into a model provider's logs, where it
// cannot be recalled. The same asymmetry that governs egress redaction governs
// this.
var secretPatterns = []struct {
	name string
	re   *regexp.Regexp
}{
	{"slack-token", regexp.MustCompile(`xox[abposr]-[A-Za-z0-9-]{10,}`)},
	{"github-token", regexp.MustCompile(`gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}`)},
	{"google-key", regexp.MustCompile(`AIza[0-9A-Za-z\-_]{35}`)},
	{"stripe-key", regexp.MustCompile(`(?:sk|rk)_live_[A-Za-z0-9]{16,}`)},
	{"aws-key", regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
	{"discord-token", regexp.MustCompile(`[MNO][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}`)},
	{"telegram-token", regexp.MustCompile(`\d{8,10}:[A-Za-z0-9_-]{35}`)},
	{"jwt", regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`)},
	// A connection string with inline credentials. Captured whole: the password
	// is not separable from the DSN the runner needs.
	{"dsn", regexp.MustCompile(`(?:postgres|postgresql|mysql|mongodb|redis|amqp)://[^\s:@/]+:[^\s@]+@\S+`)},
	// A labelled assignment — "token: abc123", "api_key=…". Last, so the
	// specific shapes above win and get their better names.
	{"credential", regexp.MustCompile(`(?i)\b(?:secret|token|password|passwd|api[_-]?key|private[_-]?key)\b\s*[:=]\s*["']?([^\s"',]{12,})["']?`)},
}

type foundSecret struct {
	// Name is the vault key the config will reference.
	Name string `json:"name"`
	// Kind is the pattern that matched, so the operator can tell what was taken.
	Kind string `json:"kind"`
	// Hint is a few characters, never the value.
	Hint  string `json:"hint"`
	value string
}

// redact replaces secret-shaped substrings with their vault names.
func redact(prompt string) (string, []foundSecret) {
	var found []foundSecret
	out := prompt
	seen := map[string]string{}

	for _, p := range secretPatterns {
		out = p.re.ReplaceAllStringFunc(out, func(m string) string {
			// The labelled form captures the value in group 1; take that rather
			// than the whole "token: xyz" match, or the config ends up
			// referencing a name that includes the label.
			val := m
			if sub := p.re.FindStringSubmatch(m); len(sub) > 1 && sub[1] != "" {
				val = sub[1]
			}
			if name, ok := seen[val]; ok {
				return strings.Replace(m, val, name, 1)
			}
			name := fmt.Sprintf("smart.%s.%d", p.name, len(found)+1)
			seen[val] = name
			found = append(found, foundSecret{
				Name: name, Kind: p.name, Hint: hintOf(val), value: val,
			})
			return strings.Replace(m, val, name, 1)
		})
	}
	return out, found
}

// hintOf is the first and last two characters. Enough to recognise a key you
// pasted, useless to anyone who did not.
func hintOf(v string) string {
	if len(v) <= 6 {
		return strings.Repeat("•", len(v))
	}
	return v[:2] + "…" + v[len(v)-2:]
}

// ─────────────────────────────── the plan ───────────────────────────────

type plan struct {
	Integration string          `json:"integration"`
	Name        string          `json:"name"`
	Config      json.RawMessage `json:"config"`
	// Reasoning is shown to the operator, not acted on.
	Reasoning string `json:"reasoning"`
	// Missing lists what the model could not determine. A plan with anything
	// here is NOT executed — a connection built on a guessed field is worse
	// than a question.
	Missing []string `json:"missing"`
}

type smartReq struct {
	Prompt string `json:"prompt"`
	// DryRun stops after planning. The operator sees what would be created
	// without a row appearing.
	DryRun bool `json:"dryRun"`
}

type smartResp struct {
	Plan      *plan         `json:"plan,omitempty"`
	Secrets   []foundSecret `json:"secrets"`
	Created   string        `json:"createdId,omitempty"`
	Tested    bool          `json:"tested"`
	TestError string        `json:"testError,omitempty"`
	Message   Text          `json:"message"`
}

func (s *Service) SmartRoutes(r chi.Router) {
	r.Post("/smart", s.handleSmart)
}

func (s *Service) handleSmart(w http.ResponseWriter, r *http.Request) {
	if planner == nil {
		httpErr(w, http.StatusServiceUnavailable,
			"no model is configured, so a connection cannot be planned from a description")
		return
	}
	var in smartReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	in.Prompt = strings.TrimSpace(in.Prompt)
	if in.Prompt == "" {
		httpErr(w, http.StatusUnprocessableEntity, "describe the connection you want")
		return
	}

	// 1. Pull the credentials OUT before anything else touches the text.
	redacted, secrets := redact(in.Prompt)

	// 2. Store them, so the config can reference them by name.
	//
	// Done BEFORE planning rather than after: if storing fails, nothing has
	// been spent on a model call, and the operator gets the real reason.
	if len(secrets) > 0 {
		if credWriter == nil {
			httpErr(w, http.StatusServiceUnavailable,
				"that description contains a credential and the vault is unavailable to store it")
			return
		}
		for _, sec := range secrets {
			if err := credWriter.PutSystem(r.Context(), sec.Name, sec.value, "smart-connect"); err != nil {
				s.log.Error("store smart secret", "name", sec.Name, "err", err)
				httpErr(w, http.StatusInternalServerError, "could not store the credential")
				return
			}
		}
		// The NAMES, never the values. This line is the audit trail for a
		// credential that arrived through a chat box.
		s.log.Info("smart connect stored credentials", "count", len(secrets), "names", names(secrets))
	}

	// 3. Plan.
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	raw, err := planner.Plan(ctx, buildPlanPrompt(redacted, secrets))
	if err != nil {
		s.log.Error("smart plan", "err", err)
		httpErr(w, http.StatusBadGateway, "the model could not be reached")
		return
	}
	p, err := parsePlan(raw)
	if err != nil {
		httpErr(w, http.StatusUnprocessableEntity,
			"could not turn that into a connection — try naming the service and the URL or channel explicitly")
		return
	}

	resp := smartResp{Plan: p, Secrets: secrets}

	// 4. Refuse to execute an incomplete plan.
	if len(p.Missing) > 0 {
		resp.Message = Text{
			EN: "I need a bit more: " + strings.Join(p.Missing, ", "),
			AR: "أحتاج تفاصيل أكثر: " + strings.Join(p.Missing, "، "),
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	i, ok := Get(p.Integration)
	if !ok {
		httpErr(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("there is no %q integration", p.Integration))
		return
	}
	if i.Beta {
		resp.Message = Text{
			EN: fmt.Sprintf("%s is not finished yet — nothing collects through it.", i.Slug),
			AR: fmt.Sprintf("%s غير مكتمل بعد — لا شيء يجمع من خلاله.", i.Slug),
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if in.DryRun || creator == nil {
		resp.Message = Text{
			EN: "This is what I would create. Nothing has been saved.",
			AR: "هذا ما سأنشئه. لم يُحفظ شيء.",
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// 5. Create through the SAME validated path the form uses, so an invented
	//    field is refused here rather than discovered on the first run.
	kind := i.SourceKind
	if kind == "" {
		kind = i.ActorKind
	}
	id, err := creator.CreateFromPlan(r.Context(), kind, p.Name, p.Config)
	if err != nil {
		resp.Message = Text{
			EN: "That configuration was refused: " + err.Error(),
			AR: "رُفض هذا الإعداد: " + err.Error(),
		}
		writeJSON(w, http.StatusUnprocessableEntity, resp)
		return
	}
	resp.Created = id

	// 6. Test it. A connection that saves and has never fetched anything is a
	//    promise, and the whole point of this endpoint is to hand back something
	//    that demonstrably works.
	if err := creator.TestConnection(r.Context(), id); err != nil {
		resp.TestError = err.Error()
		resp.Message = Text{
			EN: "Created, but the first fetch failed: " + err.Error(),
			AR: "أُنشئ، لكن أول جلب فشل: " + err.Error(),
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}
	resp.Tested = true
	resp.Message = Text{
		EN: fmt.Sprintf("Connected %q and fetched from it successfully. It is off until you turn it on.", p.Name),
		AR: fmt.Sprintf("تم توصيل %q والجلب منه بنجاح. وهو متوقف حتى تشغّله.", p.Name),
	}
	writeJSON(w, http.StatusOK, resp)
}

func names(ss []foundSecret) string {
	out := make([]string, len(ss))
	for i, s := range ss {
		out[i] = s.Name
	}
	return strings.Join(out, ", ")
}

// buildPlanPrompt gives the model the catalogue and the redacted request.
//
// The schemas are included verbatim so the model writes a config against the
// real field names rather than plausible ones — the same drift that produced a
// form asking for `url` when the runner wanted `feedURL`.
func buildPlanPrompt(redacted string, secrets []foundSecret) string {
	var sb strings.Builder
	sb.WriteString(`You turn a description of a wanted connection into a plan. Reply with ONE JSON object and nothing else.

{"integration":"<slug>","name":"<short human name>","config":{...},"reasoning":"<one sentence>","missing":[]}

Rules:
- "integration" MUST be one of the slugs below.
- "config" MUST use exactly the property names in that integration's schema. Do not invent fields.
- Put anything you cannot determine from the description into "missing" as a plain-English question, and leave it out of config. Never guess a URL, an id, or a channel.
- "name" is what a person will see in a list. Make it specific: "Go Blog", not "rss".
`)

	if len(secrets) > 0 {
		sb.WriteString(`
Credentials in the description have already been stored. Reference them BY NAME in the config field that wants a secret name:
`)
		for _, s := range secrets {
			fmt.Fprintf(&sb, "  %s  (a %s)\n", s.Name, s.Kind)
		}
		sb.WriteString("Never write a credential value into the config.\n")
	}

	sb.WriteString("\nAvailable integrations:\n")
	list := All()
	sort.Slice(list, func(a, b int) bool { return list[a].Slug < list[b].Slug })
	for _, i := range list {
		if i.Beta || !i.Collects || i.SourceKind == "" {
			// Only offer what can actually be built right now. Letting the model
			// choose a Beta integration produces a plan that is refused after
			// the operator has already been told it was understood.
			continue
		}
		fmt.Fprintf(&sb, "\n- %s: %s\n  schema: %s\n", i.Slug, i.Summary.EN, string(i.Inputs))
	}

	sb.WriteString("\nThe request:\n")
	sb.WriteString(redacted)
	return sb.String()
}

// parsePlan pulls the JSON object out of the model's reply.
//
// Tolerant of a fenced block or surrounding prose, because a model told to
// return only JSON usually does and occasionally does not, and failing the
// whole request over a code fence would be a poor trade.
func parsePlan(raw string) (*plan, error) {
	s := strings.TrimSpace(raw)
	if i := strings.Index(s, "```"); i >= 0 {
		s = s[i+3:]
		if j := strings.IndexByte(s, '\n'); j >= 0 {
			s = s[j+1:]
		}
		if j := strings.Index(s, "```"); j >= 0 {
			s = s[:j]
		}
	}
	start, end := strings.IndexByte(s, '{'), strings.LastIndexByte(s, '}')
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object in the reply")
	}
	var p plan
	if err := json.Unmarshal([]byte(s[start:end+1]), &p); err != nil {
		return nil, err
	}
	p.Integration = strings.TrimSpace(p.Integration)
	p.Name = strings.TrimSpace(p.Name)
	if p.Integration == "" {
		return nil, fmt.Errorf("the plan names no integration")
	}
	if p.Name == "" {
		p.Name = p.Integration
	}
	if len(p.Config) == 0 {
		p.Config = json.RawMessage(`{}`)
	}
	return &p, nil
}
