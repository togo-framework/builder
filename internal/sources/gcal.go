package sources

// The "gcal" source kind: Google Calendar events, and — with meetingsOnly —
// Google Meet.
//
// # One runner, two integrations
//
// A Meet conference is not a separate API. It is `conferenceData` on a calendar
// event. So "Google Meet" in the catalogue is this collector with
// `meetingsOnly: true`, and the alternative — a second connector that calls the
// same endpoint and drops the events without a link — would be a copy that
// drifts the first time event parsing changes.
//
// # Why it looks both back and forward
//
// A calendar is usually thought of as the future, but the questions asked of
// one are mostly about the past: "what did we agree in Monday's call", "who was
// in that review". Collecting only upcoming events answers none of them, so the
// window is `daysBehind` … `daysAhead` and both are configurable.
//
// # Recurring events
//
// singleEvents=true expands a recurrence into its instances, so a weekly
// standup becomes one memory per occurrence rather than one rule nobody can
// read. Each instance has its own id, which keeps the Ref stable per occurrence
// — without it, every week's standup would overwrite the last.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	KindGCal = "gcal"
	// Meet is the same collector with meetingsOnly, but it needs its OWN kind.
	//
	// Sharing "gcal" between the two integrations made every calendar
	// connection appear on the Meet card and vice versa — the gallery groups a
	// card's connections by kind, so one kind means one shared list. An
	// operator who configured "Team calendar" under Calendar saw it listed
	// under Meet as though they had set up a meetings feed they never asked
	// for.
	KindGMeet = "gmeet"
)

func init() {
	Register(KindGCal, newGCal)
	Register(KindGMeet, newGMeet)
}

// newGMeet is newGCal with meetingsOnly forced on.
//
// Forced rather than defaulted: an operator who explicitly turns it off on the
// Meet card is asking for every calendar event, which is the Calendar
// integration — and having two cards that do the same thing depending on a
// checkbox is worse than one that means what its name says.
func newGMeet(cfg json.RawMessage, sec Secrets) (Source, error) {
	src, err := newGCal(cfg, sec)
	if err != nil {
		return nil, err
	}
	g := src.(*gcalSource)
	g.cfg.MeetingsOnly = true
	g.meet = true
	return g, nil
}

const (
	gcalDefaultMax    = 250
	gcalHardMax       = 2500
	gcalDefaultAhead  = 30
	gcalDefaultBehind = 7
	gcalAPI           = "https://www.googleapis.com/calendar/v3"
)

type gcalConfig struct {
	CalendarID   string `json:"calendarId"`
	DaysAhead    int    `json:"daysAhead"`
	DaysBehind   int    `json:"daysBehind"`
	MaxEvents    int    `json:"maxEvents"`
	MeetingsOnly bool   `json:"meetingsOnly"`
}

type gcalSource struct {
	cfg gcalConfig
	// meet distinguishes the two kinds so Kind() reports the one that was
	// registered — the scheduler matches a row's kind against it.
	meet bool
	http *http.Client
}

func newGCal(cfg json.RawMessage, _ Secrets) (Source, error) {
	var c gcalConfig
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("google calendar source config: %w", err)
		}
	}
	if strings.TrimSpace(c.CalendarID) == "" {
		// The account's own calendar. Requiring the operator to find their
		// calendar id — which looks like an email address but is not always
		// theirs — for the overwhelmingly common case would be a bad default.
		c.CalendarID = "primary"
	}
	if c.DaysAhead <= 0 {
		c.DaysAhead = gcalDefaultAhead
	}
	if c.DaysBehind < 0 {
		c.DaysBehind = gcalDefaultBehind
	}
	if c.MaxEvents <= 0 {
		c.MaxEvents = gcalDefaultMax
	}
	if c.MaxEvents > gcalHardMax {
		c.MaxEvents = gcalHardMax
	}
	return &gcalSource{cfg: c, http: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (g *gcalSource) Kind() string {
	if g.meet {
		return KindGMeet
	}
	return KindGCal
}
func (g *gcalSource) Name() string { return g.cfg.CalendarID }

func (g *gcalSource) Fetch(ctx context.Context, _ string) (Batch, error) {
	// The integration slug decides which token row is read, and both Calendar
	// and Meet ride the same Google grant — so either name resolves to the same
	// provider. Using the calendar's is honest about which API is called.
	tok, err := accessToken(ctx, "google-calendar")
	if err != nil {
		return Batch{}, err
	}

	now := time.Now()
	q := url.Values{}
	q.Set("timeMin", now.AddDate(0, 0, -g.cfg.DaysBehind).Format(time.RFC3339))
	q.Set("timeMax", now.AddDate(0, 0, g.cfg.DaysAhead).Format(time.RFC3339))
	// Expand recurrences into instances — see the file comment.
	q.Set("singleEvents", "true")
	q.Set("orderBy", "startTime")
	q.Set("maxResults", fmt.Sprintf("%d", min(g.cfg.MaxEvents, 2500)))

	var out struct {
		Items []gcalEvent `json:"items"`
	}
	u := fmt.Sprintf("%s/calendars/%s/events?%s", gcalAPI, url.PathEscape(g.cfg.CalendarID), q.Encode())
	if err := g.call(ctx, tok, u, &out); err != nil {
		return Batch{}, err
	}

	// No cursor. The window moves with the clock and events are EDITED — a time
	// changes, an attendee is added, a meeting is cancelled — so re-reading the
	// whole window every run is what keeps the stored copy true. The Ref is the
	// event id, so a re-read updates its memory rather than duplicating it.
	var b Batch
	for _, e := range out.Items {
		if e.Status == "cancelled" {
			// Report it rather than drop it: the memory for this event should
			// go, and the caller owns invalidation.
			b.Removed = append(b.Removed, g.refPrefix()+e.ID)
			continue
		}
		link := e.meetLink()
		if g.cfg.MeetingsOnly && link == "" {
			continue
		}
		b.Docs = append(b.Docs, Doc{
			Ref:        g.refPrefix() + e.ID,
			Title:      e.summaryOr("(untitled event)"),
			Text:       e.text(link),
			Importance: e.importance(),
		})
		if len(b.Docs) >= g.cfg.MaxEvents {
			break
		}
	}
	return b, nil
}

type gcalEvent struct {
	ID          string   `json:"id"`
	Status      string   `json:"status"`
	Summary     string   `json:"summary"`
	Description string   `json:"description"`
	Location    string   `json:"location"`
	HTMLLink    string   `json:"htmlLink"`
	HangoutLink string   `json:"hangoutLink"`
	Start       gcalWhen `json:"start"`
	End         gcalWhen `json:"end"`
	Organizer   struct {
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
	} `json:"organizer"`
	Attendees []struct {
		Email          string `json:"email"`
		DisplayName    string `json:"displayName"`
		ResponseStatus string `json:"responseStatus"`
	} `json:"attendees"`
	ConferenceData struct {
		EntryPoints []struct {
			EntryPointType string `json:"entryPointType"`
			URI            string `json:"uri"`
		} `json:"entryPoints"`
	} `json:"conferenceData"`
}

// gcalWhen is a start or end. Google sends `dateTime` for a timed event and
// `date` for an all-day one, never both, and code that reads only dateTime
// silently drops every all-day event.
type gcalWhen struct {
	DateTime string `json:"dateTime"`
	Date     string `json:"date"`
}

func (w gcalWhen) String() string {
	if w.DateTime != "" {
		if t, err := time.Parse(time.RFC3339, w.DateTime); err == nil {
			return t.Format("Mon 2 Jan 2006, 15:04 MST")
		}
		return w.DateTime
	}
	if w.Date != "" {
		return w.Date + " (all day)"
	}
	return "unscheduled"
}

func (e gcalEvent) summaryOr(fallback string) string {
	if strings.TrimSpace(e.Summary) == "" {
		return fallback
	}
	return e.Summary
}

// meetLink returns the conference URL, if this event has one.
func (e gcalEvent) meetLink() string {
	// hangoutLink is the legacy field and is still populated for Meet events;
	// conferenceData is the current one. Checking both means an event created
	// by an older client is not treated as having no meeting.
	if e.HangoutLink != "" {
		return e.HangoutLink
	}
	for _, ep := range e.ConferenceData.EntryPoints {
		if ep.EntryPointType == "video" && ep.URI != "" {
			return ep.URI
		}
	}
	return ""
}

func (e gcalEvent) text(link string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "%s\n\nWhen: %s → %s", e.summaryOr("(untitled event)"), e.Start, e.End)
	if org := strings.TrimSpace(e.Organizer.DisplayName + " " + e.Organizer.Email); org != "" {
		fmt.Fprintf(&sb, "\nOrganizer: %s", org)
	}
	if e.Location != "" {
		fmt.Fprintf(&sb, "\nLocation: %s", e.Location)
	}
	if link != "" {
		fmt.Fprintf(&sb, "\nMeet: %s", link)
	}
	if len(e.Attendees) > 0 {
		names := make([]string, 0, len(e.Attendees))
		for _, a := range e.Attendees {
			n := a.DisplayName
			if n == "" {
				n = a.Email
			}
			// The response is the useful part: "who is actually coming" is a
			// different question from "who was invited".
			names = append(names, fmt.Sprintf("%s (%s)", n, a.ResponseStatus))
		}
		fmt.Fprintf(&sb, "\nAttendees: %s", strings.Join(names, ", "))
	}
	if d := strings.TrimSpace(e.Description); d != "" {
		// Descriptions are frequently HTML from a calendar client.
		fmt.Fprintf(&sb, "\n\n%s", rssHTMLToText(d))
	}
	return sb.String()
}

// importance ranks a real meeting above a solo block.
//
// An event with several attendees and a conference link is something that was
// coordinated; a one-person "focus time" block is not, and treating them alike
// buries the first under the second in recall.
func (e gcalEvent) importance() float64 {
	switch {
	case len(e.Attendees) > 1 && e.meetLink() != "":
		return 0.8
	case len(e.Attendees) > 1:
		return 0.7
	default:
		return 0.4
	}
}

// refPrefix keeps the two kinds' memories apart.
//
// Without it a meeting collected by both the Calendar and the Meet connection
// shares one Ref, so each run overwrites the other's copy and the two
// connections quietly fight over a single memory.
func (g *gcalSource) refPrefix() string {
	if g.meet {
		return "gmeet:"
	}
	return "gcal:"
}

func (g *gcalSource) call(ctx context.Context, tok, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := g.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return fmt.Errorf("Google Calendar refused the request (%d) — the authorization may have been revoked, or it lacks the calendar.readonly scope", res.StatusCode)
	}
	if res.StatusCode == http.StatusNotFound {
		// The single most likely misconfiguration, named precisely.
		return fmt.Errorf("no calendar %q — use \"primary\" for your own, or the calendar's id from its settings page", g.cfg.CalendarID)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("calendar api returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}
