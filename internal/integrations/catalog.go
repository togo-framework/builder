package integrations

import "encoding/json"

// The rest of the catalogue: messaging, databases, readers, analytics.
//
// Everything here is declaration. No integration in this file contains logic —
// the collecting is internal/sources, the sending is internal/actors, and this
// says which is which, what the operator has to fill in, and where it appears.
//
// The one thing worth reading carefully is the Collects/Acts pair, because it is
// the honest answer to "what can this thing do to my data?" and the gallery
// shows it verbatim. A reader with Acts:false is making a promise.

func init() {
	// ─────────────────────── messaging & APIs ───────────────────────
	//
	// All four are full BOTS, not one-way hooks: each has its own identity in
	// the workspace, reads what is said to it, and answers. That distinction is
	// why Discord takes a bot token rather than an incoming webhook — a webhook
	// can only shout into a channel. It cannot read a message, cannot be
	// mentioned, cannot answer a question, and has no identity beyond whatever
	// name the poster chose. A bot is a participant; a webhook is a megaphone.
	//
	// The credential is ours to hold in every case, so all four are behind
	// SF-001 for the runtime read.

	Register(Integration{
		Slug:       "slack",
		Title:      Text{EN: "Slack", AR: "سلاك"},
		Summary:    Text{EN: "Read channel history into the brain, and post messages back.", AR: "قراءة سجل القنوات إلى الذاكرة وإرسال الرسائل."},
		Category:   CatAPI,
		Auth:       AuthToken,
		Icon:       "MessageSquare",
		Color:      "#4a154b",
		Collects:   true,
		Acts:       true,
		SourceKind: "slack",
		ActorKind:  "slack",
		DocsURL:    "https://api.slack.com/authentication/token-types",
		Inputs: json.RawMessage(`{
  "type":"object","required":["tokenSecret","channelID"],"additionalProperties":false,
  "properties":{
    "tokenSecret":{"type":"string","title":"Bot token secret","format":"secret-name",
                   "description":"The NAME of a vault secret holding xoxb-…, never the token itself."},
    "channelID":{"type":"string","title":"Channel id","pattern":"^[CGD][A-Z0-9]+$",
                 "description":"e.g. C0123456789 — from the channel's details, not its name."},
    "maxMessages":{"type":"integer","minimum":1,"maximum":1000,"default":200,"title":"Messages per run"},
    "apiBase":{"type":"string","format":"uri","title":"API base","description":"Only for a Slack-compatible gateway."}
  }}`),
	})

	Register(Integration{
		Slug:       "discord",
		Title:      Text{EN: "Discord", AR: "ديسكورد"},
		Summary:    Text{EN: "A bot in your server: reads channels, answers, and posts.", AR: "بوت في سيرفرك: يقرأ القنوات ويرد وينشر."},
		Category:   CatAPI,
		Auth:       AuthToken,
		Icon:       "MessageSquare",
		Color:      "#5865f2",
		Collects:   true,
		Acts:       true,
		SourceKind: "discord",
		ActorKind:  "discord",
		DocsURL:    "https://discord.com/developers/docs/getting-started",
		// Fields match internal/sources/discord.go. The publicKey and fallback
		// webhook that used to be here belong to an inbound-interactions
		// endpoint that does not exist, so the form was asking for two
		// credentials nothing would ever read.
		Inputs: json.RawMessage(`{
  "type":"object","required":["botTokenSecret","channelId"],"additionalProperties":false,
  "properties":{
    "botTokenSecret":{"type":"string","title":"Bot token secret","format":"secret-name",
                      "description":"The NAME of a vault secret holding the bot token. The bot needs the MESSAGE CONTENT privileged intent, or Discord returns every message with empty text and no error."},
    "channelId":{"type":"string","title":"Channel id",
                 "description":"Enable Developer Mode in Discord, then right-click the channel and Copy ID."},
    "guildId":{"type":"string","title":"Server (guild) id","description":"Optional — for reference."},
    "applicationId":{"type":"string","title":"Application id","description":"Optional — for reference."},
    "maxMessages":{"type":"integer","title":"Messages per run","default":200,"minimum":1,"maximum":1000}
  }}`),
	})

	Register(Integration{
		Slug:       "telegram",
		Title:      Text{EN: "Telegram", AR: "تيليجرام"},
		Summary:    Text{EN: "A bot that reads a chat and replies in it.", AR: "بوت يقرأ المحادثة ويرد فيها."},
		Category:   CatAPI,
		Auth:       AuthToken,
		Icon:       "Send",
		Color:      "#26a5e4",
		Collects:   true,
		Acts:       true,
		SourceKind: "telegram",
		ActorKind:  "telegram",
		DocsURL:    "https://core.telegram.org/bots#how-do-i-create-a-bot",
		// Fields match internal/sources/telegram.go. The webhook secret is gone
		// because this collector POLLS — a webhook needs this installation to be
		// reachable on a public HTTPS name, which a builder on a laptop is not.
		Inputs: json.RawMessage(`{
  "type":"object","required":["tokenSecret","chatId"],"additionalProperties":false,
  "properties":{
    "tokenSecret":{"type":"string","title":"Bot token secret","format":"secret-name",
                   "description":"The NAME of a vault secret holding the @BotFather token. In a GROUP, turn privacy mode OFF in @BotFather or the bot only sees messages that mention it."},
    "chatId":{"type":"string","title":"Chat id",
              "description":"Negative for groups, e.g. -100123456789. The bot sees nothing said before it joined — Telegram has no history API for bots."},
    "maxMessages":{"type":"integer","title":"Messages per run","default":100,"minimum":1,"maximum":1000}
  }}`),
	})

	Register(Integration{
		Slug:     "whatsapp",
		Title:    Text{EN: "WhatsApp", AR: "واتساب"},
		Summary:  Text{EN: "Read conversations into the brain and reply, through an Evolution API bridge you host.", AR: "قراءة المحادثات إلى الذاكرة والرد، عبر جسر Evolution API تستضيفه بنفسك."},
		Category: CatAPI,
		Auth:     AuthToken,
		Icon:     "MessageSquare",
		Color:    "#25d366",
		Collects: true,
		Acts:     true,
		// This talks to an EVOLUTION API bridge, not Meta's Cloud API — which
		// is what internal/sources/whatsapp.go actually implements, and the
		// distinction is not cosmetic. An earlier version of this entry
		// described the Cloud API and asked for Cloud API fields; an operator
		// following it would have configured credentials the runner never
		// reads.
		//
		// Why a bridge at all: WhatsApp has no official self-serve API. Meta's
		// Cloud API needs a Business account, a verified number and template
		// pre-approval before a single message moves. Evolution is a
		// self-hosted bridge that speaks to WhatsApp Web, so an operator can
		// connect the number they already have.
		//
		// The trade is worth stating plainly: it is unofficial, it can break
		// when WhatsApp changes, and the number carries whatever risk WhatsApp
		// assigns to automation. That is the operator's call to make, so the
		// bridge URL is a field they fill rather than something assumed.
		ActorKind:  "whatsapp",
		SourceKind: "whatsapp",
		DocsURL:    "https://doc.evolution-api.com",
		Inputs: json.RawMessage(`{
  "type":"object","required":["baseURL","instance","apiKeySecret"],"additionalProperties":false,
  "properties":{
    "baseURL":{"type":"string","format":"uri","title":"Bridge URL",
               "description":"Your Evolution API instance. WhatsApp has no official self-serve API, so this talks to a bridge you host."},
    "instance":{"type":"string","title":"Instance name","description":"The session name inside the bridge."},
    "apiKeySecret":{"type":"string","title":"API key secret","format":"secret-name"},
    "chatID":{"type":"string","title":"Chat id","description":"e.g. 201234567890@s.whatsapp.net. Empty reads every chat."},
    "maxMessages":{"type":"integer","minimum":1,"maximum":1000,"default":200,"title":"Messages per run"}
  }}`),
	})

	// ─────────────────────────── databases ───────────────────────────
	//
	// One integration per engine rather than one "SQL" with a driver dropdown:
	// the DSN format, the default port and the placeholder differ per engine,
	// and a single form that is right for none of them is how people end up
	// pasting a Postgres URL into a MySQL field.

	Register(Integration{
		Slug:       "postgres",
		Title:      Text{EN: "PostgreSQL", AR: "PostgreSQL"},
		Summary:    Text{EN: "Run a read-only query on a schedule and keep the result.", AR: "تشغيل استعلام للقراءة دوريًا وحفظ النتيجة."},
		Category:   CatDatabase,
		Auth:       AuthDSN,
		Icon:       "Layers",
		Color:      "#336791",
		Collects:   true,
		SourceKind: "sql",
		Inputs:     sqlInputs("postgres://user:pass@host:5432/dbname?sslmode=require"),
	})

	Register(Integration{
		Slug:       "mysql",
		Title:      Text{EN: "MySQL / MariaDB", AR: "MySQL / MariaDB"},
		Summary:    Text{EN: "Run a read-only query on a schedule and keep the result.", AR: "تشغيل استعلام للقراءة دوريًا وحفظ النتيجة."},
		Category:   CatDatabase,
		Auth:       AuthDSN,
		Icon:       "Layers",
		Color:      "#00758f",
		Collects:   true,
		SourceKind: "sql",
		Beta:       true,
		Inputs:     sqlInputs("user:pass@tcp(host:3306)/dbname?parseTime=true"),
	})

	Register(Integration{
		Slug:       "sqlite",
		Title:      Text{EN: "SQLite", AR: "SQLite"},
		Summary:    Text{EN: "Read a local database file on a schedule.", AR: "قراءة ملف قاعدة بيانات محلي دوريًا."},
		Category:   CatDatabase,
		Auth:       AuthDSN,
		Icon:       "Layers",
		Color:      "#003b57",
		Collects:   true,
		SourceKind: "sql",
		Beta:       true,
		Inputs:     sqlInputs("file:/absolute/path/to.db?mode=ro"),
	})

	// ──────────────────────────── readers ────────────────────────────
	//
	// Every one of these is Acts:false, and TestReadersCannotAct enforces it.
	// The category exists to make "this can only read" visible rather than
	// inferred from an empty actions list.

	Register(Integration{
		Slug:       "rss",
		Title:      Text{EN: "RSS / Atom", AR: "RSS / Atom"},
		Summary:    Text{EN: "Follow a feed and keep every entry.", AR: "متابعة خلاصة وحفظ كل مُدخل."},
		Category:   CatReader,
		Auth:       AuthNone,
		Icon:       "RefreshCw",
		Color:      "#f26522",
		Collects:   true,
		SourceKind: "rss",
		Inputs: json.RawMessage(`{
  "type":"object","required":["feedURL"],"additionalProperties":false,
  "properties":{
    "feedURL":{"type":"string","format":"uri","title":"Feed URL"},
    "maxEntries":{"type":"integer","minimum":1,"maximum":500,"default":50,"title":"Entries per run"},
    "fetchFull":{"type":"boolean","default":false,"title":"Fetch the full article",
                 "description":"Most feeds carry a summary only. This follows each link for the whole text — slower, and more of what you actually wanted."}
  }}`),
	})

	// A REAL BROWSER, not an HTTP fetcher.
	//
	// A plain fetch returns the HTML the server sent, which on most modern
	// sites is an empty shell plus a script tag — the content arrives later,
	// from JavaScript, and a fetcher never sees it. Playwright runs the page.
	//
	// The rebrowser patches matter separately: a stock Playwright build is
	// trivially detectable (the CDP `Runtime.Enable` leak, and a long tail of
	// automation fingerprints), so bot-detection serves it a challenge page
	// instead of the article. The crawl then "succeeds" and stores a CAPTCHA,
	// which is the worst failure mode available — plausible-looking rubbish in
	// the brain that nobody notices until an answer cites it.
	Register(Integration{
		Slug:       "crawl",
		Title:      Text{EN: "Web crawler", AR: "زاحف الويب"},
		Summary:    Text{EN: "Runs a real browser, so JavaScript pages are read as a person sees them.", AR: "يشغّل متصفحًا حقيقيًا، فتُقرأ صفحات جافاسكربت كما يراها الإنسان."},
		Category:   CatReader,
		Auth:       AuthNone,
		Icon:       "Globe",
		Color:      "#0ea5e9",
		Collects:   true,
		SourceKind: "crawl",
		DocsURL:    "https://github.com/rebrowser/rebrowser-patches",
		Inputs: json.RawMessage(`{
  "type":"object","required":["startURL"],"additionalProperties":false,
  "properties":{
    "startURL":{"type":"string","format":"uri","title":"Start URL"},
    "maxDepth":{"type":"integer","minimum":0,"maximum":10,"default":2,"title":"Link depth"},
    "maxPages":{"type":"integer","minimum":1,"maximum":2000,"default":100,"title":"Page limit"},
    "sameOriginOnly":{"type":"boolean","default":true,"title":"Stay on this origin",
                      "description":"Off means the crawler may follow links anywhere. Leave it on unless you mean it."},
    "selector":{"type":"string","title":"Content selector",
                "description":"A CSS selector for the part worth keeping, e.g. article. Empty takes the whole page, navigation included."},
    "userAgent":{"type":"string","title":"User agent"}
  }}`),
	})

	Register(Integration{
		Slug:     "firecrawl",
		Title:    Text{EN: "Firecrawl", AR: "Firecrawl"},
		Summary:  Text{EN: "Render JavaScript pages to clean markdown. Hosted or self-hosted.", AR: "تحويل صفحات جافاسكربت إلى ماركداون نظيف. مستضاف أو ذاتي."},
		Category: CatReader,
		Auth:     AuthToken,
		Icon:     "BookOpen",
		Color:    "#fa5d19",
		Collects: true,
		// Deliberately its own source kind rather than a crawl variant: the
		// whole reason to use it is that it executes JavaScript, so the pages
		// it returns are ones the plain crawler cannot see.
		SourceKind: "firecrawl",
		DocsURL:    "https://docs.firecrawl.dev/",
		Beta:       true,
		Inputs: json.RawMessage(`{
  "type":"object","required":["startUrl"],"additionalProperties":false,
  "properties":{
    "baseUrl":{"type":"string","format":"uri","title":"Firecrawl base URL",
               "default":"https://api.firecrawl.dev",
               "description":"Point this at your own instance to self-host. It is open source."},
    "apiKeySecret":{"type":"string","title":"API key secret","format":"secret-name",
                    "description":"Not needed by a self-hosted instance that requires no auth."},
    "startUrl":{"type":"string","format":"uri","title":"Start URL"},
    "mode":{"type":"string","enum":["scrape","crawl"],"default":"scrape","title":"Mode",
            "description":"scrape reads one page; crawl follows links."}
  }}`),
	})

	Register(Integration{
		Slug:       "searxng",
		Title:      Text{EN: "SearXNG", AR: "SearXNG"},
		Summary:    Text{EN: "Run a saved search against your own metasearch instance.", AR: "تشغيل بحث محفوظ على نسخة البحث الخاصة بك."},
		Category:   CatReader,
		Auth:       AuthNone,
		Icon:       "Search",
		Color:      "#3050ff",
		Collects:   true,
		SourceKind: "searxng",
		DocsURL:    "https://docs.searxng.org/",
		Beta:       true,
		Inputs: json.RawMessage(`{
  "type":"object","required":["baseUrl","query"],"additionalProperties":false,
  "properties":{
    "baseUrl":{"type":"string","format":"uri","title":"Instance URL",
               "description":"Your own SearXNG. A public instance will rate-limit a scheduled search."},
    "query":{"type":"string","minLength":1,"title":"Search query"},
    "categories":{"type":"string","title":"Categories","default":"general"},
    "maxResults":{"type":"integer","minimum":1,"maximum":100,"default":20}
  }}`),
	})

	// ────────────────────── analytics & indexing ──────────────────────

	Register(Integration{
		Slug:       "google-search-console",
		Title:      Text{EN: "Search Console", AR: "أدوات مشرفي المواقع"},
		Summary:    Text{EN: "Collect impressions, clicks and the queries people used to find you.", AR: "جمع الظهور والنقرات وكلمات البحث."},
		Category:   CatAnalytics,
		Auth:       AuthOAuth,
		Icon:       "BarChart3",
		Color:      "#4285f4",
		Collects:   true,
		SourceKind: "gsc",
		DocsURL:    "https://developers.google.com/webmaster-tools",
		// Fields match internal/sources/ga4.go's gscConfig. The verification
		// token that used to be here is not a runner input at all — it is a
		// thing you publish on your own site, once, before Search Console will
		// talk to you. Asking for it on this form implied we would use it.
		Inputs: json.RawMessage(`{
  "type":"object","required":["siteUrl"],"additionalProperties":false,
  "properties":{
    "siteUrl":{"type":"string","title":"Property",
               "description":"Exactly as Search Console shows it: \"sc-domain:example.com\" for a domain property, or \"https://example.com/\" WITH the trailing slash for a URL-prefix one. A mismatch here reads as \"no such property\"."},
    "days":{"type":"integer","title":"Days per report","default":7,"minimum":1,"maximum":365},
    "topRows":{"type":"integer","title":"Top queries to include","default":25,"minimum":1,"maximum":250}
  }}`),
	})

	Register(Integration{
		Slug:       "google-analytics",
		Title:      Text{EN: "Google Analytics", AR: "تحليلات جوجل"},
		Summary:    Text{EN: "Measurement id for the site, and reporting into the brain.", AR: "معرّف القياس للموقع وجلب التقارير."},
		Category:   CatAnalytics,
		Auth:       AuthOAuth,
		Icon:       "BarChart3",
		Color:      "#e37400",
		Collects:   true,
		SourceKind: "ga4",
		DocsURL:    "https://developers.google.com/analytics/devguides/reporting/data/v1",
		// Fields match internal/sources/ga4.go exactly. The earlier version of
		// this schema asked for a measurement id and a Tag Manager container —
		// neither of which the reporting API uses — so the form collected two
		// values that went nowhere and omitted the one that mattered.
		Inputs: json.RawMessage(`{
  "type":"object","required":["propertyId"],"additionalProperties":false,
  "properties":{
    "propertyId":{"type":"string","title":"Property id",
                  "description":"The NUMERIC id from Admin → Property Settings — not the G-XXXXXXX measurement id, which is a different thing and will not work here."},
    "days":{"type":"integer","title":"Days per report","default":7,"minimum":1,"maximum":365},
    "topRows":{"type":"integer","title":"Top pages to include","default":25,"minimum":1,"maximum":250}
  }}`),
	})

	Register(Integration{
		Slug:     "indexnow",
		Title:    Text{EN: "IndexNow", AR: "IndexNow"},
		Summary:  Text{EN: "Tell Bing and Yandex the moment a page changes.", AR: "إبلاغ محركات البحث فور تغيّر صفحة."},
		Category: CatAnalytics,
		Auth:     AuthToken,
		Icon:     "Send",
		Color:    "#0078d4",
		// The one analytics entry that SENDS: it submits URLs rather than
		// reading anything back.
		Acts:      true,
		ActorKind: "webhook",
		DocsURL:   "https://www.indexnow.org/documentation",
		Inputs: json.RawMessage(`{
  "type":"object","required":["host","keySecret"],"additionalProperties":false,
  "properties":{
    "host":{"type":"string","title":"Host","description":"example.com — the site whose URLs you submit."},
    "keySecret":{"type":"string","title":"API key secret","format":"secret-name",
                 "description":"The key must also be reachable at https://host/<key>.txt, which is how they verify you own it."}
  }}`),
	})
}

// sqlInputs is the shared shape for every database engine, with the example DSN
// swapped per engine.
//
// The query is the interesting field: it is stored, run on a schedule, and its
// result is retained. The description says read-only because nothing enforces
// it here — the enforcement is the database user's own grants, which is the
// right place for it and worth saying out loud on the form.
func sqlInputs(exampleDSN string) json.RawMessage {
	return json.RawMessage(`{
  "type":"object","required":["dsnSecret","sql"],"additionalProperties":false,
  "properties":{
    "dsnSecret":{"type":"string","title":"Connection string secret","format":"secret-name",
                 "description":"The NAME of a vault secret holding ` + exampleDSN + `"},
    "sql":{"type":"string","minLength":1,"title":"Query",
           "description":"Run on every refresh. Give the database user SELECT and nothing else — this is not enforced here."},
    "maxRows":{"type":"integer","minimum":1,"maximum":10000,"default":500,"title":"Row limit"},
    "timeoutMs":{"type":"integer","minimum":100,"maximum":60000,"default":10000,"title":"Query timeout (ms)"},
    "runAs":{"type":"string","title":"Run as agent",
             "description":"Which agent identity reads the secret. See SF-001."}
  }}`)
}
