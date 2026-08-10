package issues

import "encoding/json"

// Browser context: the console/network/environment snapshot a bridge-mode SDK
// attaches to a feedback report. This file is the schema of record for the
// `browser_context` jsonb column (migration 0015) — everything stored there
// went through sanitizeContext first.
//
// The limits mirror the SDK's ring buffers so the browser refuses early and
// the server refuses authoritatively — the same split the attachment ceilings
// use. A well-behaved SDK never trips these; they exist because the ingress is
// public and a payload is a claim, not a fact.
const (
	// maxContextBytes bounds the raw JSON off the wire. One chatty tab must
	// not write a megabyte of console into a row that is fetched whole on
	// every issue-page load.
	maxContextBytes = 256 << 10

	maxConsoleEntries = 200 // the SDK's console ring buffer size
	maxNetworkEntries = 100 // the SDK's network ring buffer size

	maxConsoleText = 4 << 10 // one log line; a dumped object is truncated, not stored
	maxContextURL  = 2048    // matches the page_url ceiling
	maxUserAgent   = 512

	maxAppID     = 64  // a config slug, not free text
	maxAppName   = 128 // what the operator called it
	maxAppOrigin = 512 // scheme://host:port, generously
)

// contextApp names the hosted app a report came from.
//
// A builder shell can frame several surfaces of one product at once —
// app.co, auth.app.co, dashboard.app.co — and a report that does not say which
// of them it is about sends somebody to read the wrong code. The shell stamps
// this from its own configured target list before the payload ever reaches the
// panel, so it is the shell's word and not the framed page's: a compromised
// product cannot file under its neighbour's name.
//
// Stored inside browser_context rather than as its own column: it is the same
// kind of fact as the viewport and the user agent — a description of where the
// report was taken — and it arrives on the same payload, through the same
// disclosure, bounded by the same limits. A column would have meant a
// migration and a second write path for a field that is already here.
type contextApp struct {
	ID     string `json:"id,omitempty"`
	Name   string `json:"name,omitempty"`
	Origin string `json:"origin,omitempty"`
}

type consoleEntry struct {
	Level string `json:"level"`
	Text  string `json:"text"`
	// Epoch milliseconds. Optional — an entry captured before the SDK patched
	// Date handling may lack it, and the page renders those without a time.
	TS int64 `json:"ts,omitempty"`
}

// networkEntry is method/url/status/duration ONLY. No bodies and no headers,
// by design: the typed re-marshal in sanitizeContext drops any extra field a
// client sends, so a request body cannot arrive here even from a hostile SDK.
type networkEntry struct {
	Method     string `json:"method"`
	URL        string `json:"url"`
	Status     int    `json:"status"`
	DurationMs int    `json:"durationMs"`
	TS         int64  `json:"ts,omitempty"`
}

type viewportInfo struct {
	W   int     `json:"w"`
	H   int     `json:"h"`
	DPR float64 `json:"dpr"`
}

type browserContext struct {
	Console   []consoleEntry `json:"console,omitempty"`
	Network   []networkEntry `json:"network,omitempty"`
	Viewport  *viewportInfo  `json:"viewport,omitempty"`
	UserAgent string         `json:"userAgent,omitempty"`
	Locale    string         `json:"locale,omitempty"`
	App       *contextApp    `json:"app,omitempty"`
}

var validConsoleLevel = map[string]bool{
	"log": true, "info": true, "warn": true, "error": true, "debug": true,
}

// sanitizeContext bounds and normalizes the context a report arrived with.
//
// Returns the cleaned JSON to store, or nil with a reason when the payload was
// dropped. Dropping the CONTEXT never drops the REPORT — same policy as an
// oversized screenshot: a bug report without its console is far better than
// one rejected outright because the page it came from was chatty. The reason
// string goes to the log so a systematically oversized SDK is visible.
//
// Note the redaction asymmetry: tokens are stripped in the SDK, before the
// data leaves the page, because that is the only place they are still local.
// This function does NOT try to redact after the fact — its job is bounds and
// shape. Unmarshalling into typed structs and re-marshalling is itself a
// filter: fields outside the schema (a smuggled request body, a header map)
// do not survive the round trip.
func sanitizeContext(raw json.RawMessage) ([]byte, string) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, ""
	}
	if len(raw) > maxContextBytes {
		return nil, "context exceeds the 256 KB limit"
	}

	var c browserContext
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, "context is not valid JSON"
	}

	// Keep the TAIL when over the cap: these are ring buffers, and the newest
	// entries are the ones nearest the moment the reporter hit "report".
	// Keeping the head would preserve page-load noise and discard the error.
	if len(c.Console) > maxConsoleEntries {
		c.Console = c.Console[len(c.Console)-maxConsoleEntries:]
	}
	if len(c.Network) > maxNetworkEntries {
		c.Network = c.Network[len(c.Network)-maxNetworkEntries:]
	}

	for i := range c.Console {
		if !validConsoleLevel[c.Console[i].Level] {
			c.Console[i].Level = "log"
		}
		c.Console[i].Text = truncate(c.Console[i].Text, maxConsoleText)
		if c.Console[i].TS < 0 {
			c.Console[i].TS = 0
		}
	}
	for i := range c.Network {
		c.Network[i].Method = truncate(c.Network[i].Method, 16)
		c.Network[i].URL = truncate(c.Network[i].URL, maxContextURL)
		if c.Network[i].Status < 0 || c.Network[i].Status > 999 {
			c.Network[i].Status = 0
		}
		if c.Network[i].DurationMs < 0 {
			c.Network[i].DurationMs = 0
		}
		if c.Network[i].TS < 0 {
			c.Network[i].TS = 0
		}
	}
	c.UserAgent = truncate(c.UserAgent, maxUserAgent)
	c.Locale = truncate(c.Locale, 35) // BCP-47's own maximum
	if c.Viewport != nil {
		if c.Viewport.W < 0 {
			c.Viewport.W = 0
		}
		if c.Viewport.H < 0 {
			c.Viewport.H = 0
		}
		if c.Viewport.DPR < 0 {
			c.Viewport.DPR = 0
		}
		if c.Viewport.W == 0 && c.Viewport.H == 0 {
			c.Viewport = nil
		}
	}

	if c.App != nil {
		c.App.ID = truncate(c.App.ID, maxAppID)
		c.App.Name = truncate(c.App.Name, maxAppName)
		c.App.Origin = truncate(c.App.Origin, maxAppOrigin)
		// An app with no id and no name names nothing. Dropped rather than
		// stored, so the issue page's test for "do we know where this came
		// from" stays a simple nil check.
		if c.App.ID == "" && c.App.Name == "" {
			c.App = nil
		}
	}

	// Nothing survived → store NULL, not "{}". The column's NULL is what lets
	// the issue page skip the section entirely; an empty object would render
	// an empty "Browser context" on a report that carried none.
	//
	// App counts as something surviving. A report filed from a hosted app whose
	// SDK never loaded — or one whose reporter opted out of the console and
	// network capture — carries the app and nothing else, and that row is the
	// whole point: it is the difference between "a bug somewhere in the
	// product" and "a bug in auth".
	if len(c.Console) == 0 && len(c.Network) == 0 && c.Viewport == nil &&
		c.UserAgent == "" && c.Locale == "" && c.App == nil {
		return nil, ""
	}

	out, err := json.Marshal(c)
	if err != nil {
		return nil, "context could not be re-encoded"
	}
	return out, ""
}
