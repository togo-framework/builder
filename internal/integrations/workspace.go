package integrations

// Google Workspace: Gmail, Calendar and Meet.
//
// All three ride the SINGLE Google OAuth app declared in oauth.go, so an
// operator authorises Google once and connects all of them — see the note on
// SaveToken in oauth_service.go for why the token is stored per provider rather
// than per integration.
//
// # Why Meet is a view of Calendar rather than its own API
//
// There is no Meet "list my meetings" endpoint. A Meet conference exists as
// `conferenceData` on a Google Calendar event, and the Meet REST API covers
// conference RECORDS — transcripts and recordings of past calls — under a
// separate scope most operators have not enabled. So Meet here reads calendar
// events that carry a conference, which is what "my meetings" means to the
// person asking.
//
// Declaring it as its own card rather than a checkbox on Calendar is deliberate:
// "what meetings do I have?" and "what is on my calendar?" are different
// questions, and an operator looking for the first should not have to know they
// are the same API.

import "encoding/json"

func init() {
	Register(Integration{
		Slug:     "gmail",
		Title:    Text{EN: "Gmail", AR: "جيميل"},
		Summary:  Text{EN: "Read messages from a label or search into the brain.", AR: "قراءة الرسائل من تصنيف أو بحث إلى الذاكرة."},
		Category: CatAPI,
		Auth:     AuthOAuth,
		Icon:     "Mail",
		Color:    "#ea4335",
		Collects: true,
		// Reads only, and the scope list enforces it: `gmail.send` is not
		// requested, so this cannot email from the operator's address even if
		// something later asked it to. Rule 41 makes outbound mail a human's
		// decision, and the cheapest way to honour that is to never hold the
		// capability.
		Acts:       false,
		SourceKind: "gmail",
		DocsURL:    "https://developers.google.com/gmail/api/guides/filtering",
		Inputs: json.RawMessage(`{
  "type":"object","required":["query"],"additionalProperties":false,
  "properties":{
    "query":{"type":"string","title":"Search","default":"is:important newer_than:7d",
             "description":"A Gmail search, exactly as you would type it in the search box. Narrow it — this reads every match."},
    "maxMessages":{"type":"integer","title":"Messages per run","default":50,"minimum":1,"maximum":500},
    "includeBody":{"type":"boolean","title":"Include the message body","default":true,
                   "description":"Off keeps subjects and senders only, which is enough to answer 'who asked about X' without storing the correspondence."}
  }
}`),
	})

	Register(Integration{
		Slug:       "google-calendar",
		Title:      Text{EN: "Google Calendar", AR: "تقويم جوجل"},
		Summary:    Text{EN: "Read events from a calendar so the fleet knows the schedule.", AR: "قراءة الأحداث من التقويم ليعرف الفريق الجدول."},
		Category:   CatAPI,
		Auth:       AuthOAuth,
		Icon:       "Calendar",
		Color:      "#4285f4",
		Collects:   true,
		Acts:       false,
		SourceKind: "gcal",
		DocsURL:    "https://developers.google.com/calendar/api/v3/reference/events/list",
		Inputs: json.RawMessage(`{
  "type":"object","additionalProperties":false,
  "properties":{
    "calendarId":{"type":"string","title":"Calendar","default":"primary",
                  "description":"\"primary\" is the account's own calendar. Otherwise the calendar's id, which looks like an email address."},
    "daysAhead":{"type":"integer","title":"Days ahead","default":30,"minimum":1,"maximum":365},
    "daysBehind":{"type":"integer","title":"Days behind","default":7,"minimum":0,"maximum":365,
                  "description":"Past events are worth keeping — \"what did we decide in Monday's call\" is a question about a meeting that already happened."},
    "maxEvents":{"type":"integer","title":"Events per run","default":250,"minimum":1,"maximum":2500}
  }
}`),
	})

	Register(Integration{
		Slug:     "google-meet",
		Title:    Text{EN: "Google Meet", AR: "جوجل ميت"},
		Summary:  Text{EN: "Read scheduled meetings — calendar events that have a Meet link.", AR: "قراءة الاجتماعات المجدولة — أحداث التقويم التي تحمل رابط ميت."},
		Category: CatAPI,
		Auth:     AuthOAuth,
		Icon:     "Video",
		Color:    "#00832d",
		Collects: true,
		Acts:     false,
		// The same COLLECTOR as the calendar, but its own kind — see
		// internal/sources/gcal.go. Sharing "gcal" made every calendar
		// connection appear on this card as well, because the gallery groups a
		// card's connections by kind.
		SourceKind: "gmeet",
		DocsURL:    "https://developers.google.com/calendar/api/guides/create-events#video",
		Inputs: json.RawMessage(`{
  "type":"object","additionalProperties":false,
  "properties":{
    "calendarId":{"type":"string","title":"Calendar","default":"primary"},
    "daysAhead":{"type":"integer","title":"Days ahead","default":30,"minimum":1,"maximum":365},
    "daysBehind":{"type":"integer","title":"Days behind","default":7,"minimum":0,"maximum":365},
    "maxEvents":{"type":"integer","title":"Events per run","default":250,"minimum":1,"maximum":2500},
    "meetingsOnly":{"type":"boolean","title":"Only events with a Meet link","default":true,
                    "description":"This is what makes it Meet rather than Calendar. Off collects every event."}
  }
}`),
	})
}
