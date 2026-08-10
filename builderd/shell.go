package main

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/togo-framework/togo"
)

// The shell: your products, framed, with the builder living outside them.
//
// THE INVERSION, AND WHY IT IS THE RIGHT WAY ROUND
//
// The obvious way to embed a feedback widget is a script tag in the product.
// That puts the widget inside the process it is meant to observe, and the
// widget dies with it: rebuild, restart, deploy, panic — the board is gone at
// the exact moment you wanted to file something.
//
// So turn it inside out. You open the BUILDER, and the builder renders your
// product in an iframe. The widget lives in the outer page, on the daemon's
// own origin, talking to the daemon's own database. Restart the product and
// the iframe blinks; the panel, the board, the agents, the brain and the chat
// never move. The product needs no script tag, no dependency, and no knowledge
// that any of this exists — which also means this works against a product in
// any language on any stack.
//
// SEVERAL PRODUCTS, NOT ONE
//
// A product is rarely one origin. app.co, auth.app.co and dashboard.app.co are
// one system to the people who build it and three separate documents to the
// browser, and a bug found while signing in belongs to the same board as a bug
// found on the dashboard. So the shell hosts a LIST (see targets.go): every
// configured app gets its own frame, all of them mounted at once, one of them
// in view, switchable without the panel moving or the report you are half-way
// through being lost.
//
// All frames are mounted eagerly rather than created on first switch. It costs
// N page loads at shell open — these are a handful of dev surfaces, not a tab
// farm — and it buys the thing the arrangement is for: every app's SDK is
// handshaken and its console ring buffer is filling from the start, so
// switching to the app that just misbehaved still has the evidence. A frame
// created on demand would begin capturing at the moment you went looking,
// which is exactly too late.
//
// Hidden frames use visibility, never display:none. A display:none iframe has
// no box: the app inside lays out at 0x0, every media query resolves to the
// smallest breakpoint, and revealing it shows a phone layout on a desktop
// shell until something forces a resize.
//
// WHAT THE FRAME WILL NOT GIVE UP, AND HOW IT IS VOLUNTEERED INSTEAD
//
// A cross-origin iframe is opaque. The shell cannot read the framed page's
// DOM, so on its own it gets no element pinning, black screenshots, a URL that
// never moves, and no console or network context. That is not a capture bug;
// it is origin isolation doing its job, and the only way through it is for the
// framed page to VOLUNTEER the data.
//
// So the SDK, when it IS loaded inside the product, gains a bridge mode: it
// notices it is framed by a builder shell, suppresses its own panel, and
// becomes a reporter to the parent. The shell owns the UI; the frame owns the
// DOM. Pin picks happen inside the frame where the elements are, screenshots
// are rasterised inside the frame where the pixels are, and the results cross
// the boundary as postMessage payloads. A product WITHOUT the SDK still frames
// fine — you get issue filing, the board, the fleet, the brain and the chat,
// and the shell says plainly that pinning and screenshots need the script tag
// rather than leaving dead controls.
//
// THE PROTOCOL — the frame half lives in sdk/src/bridge.ts and MUST agree
//
// Every message is {v:1, type, ...}. Every postMessage passes an explicit
// targetOrigin and every listener checks event.origin AND event.source.
// Never "*" in either direction: a wildcard here would hand a customer's
// console lines and screenshots to any page that frames them.
//
//	shell → frame   builder:hello        {shellOrigin}   targetOrigin = that frame's origin
//	frame → shell   builder:ready        {url, title}    reply to the hello's origin only
//	frame → shell   builder:url          {url, title}    on load / popstate / pushState
//	shell → frame   builder:pin:start
//	frame → shell   builder:pin:done     {anchor}        the SDK's existing PinAnchor shape
//	shell → frame   builder:pin:cancel
//	shell → frame   builder:shot
//	frame → shell   builder:shot:done    {dataUrl}       captured inside the frame
//	shell → frame   builder:context
//	frame → shell   builder:context:done {console[], network[], viewport, userAgent, locale}
//
// ROUTING WITH SEVERAL FRAMES — the part that is easy to get wrong
//
// Every frame posts to the SAME window (their common parent), so the shell
// receives N conversations interleaved on one listener. Disambiguation is
// keyed on event.source — the window object the browser says sent it — and
// NOT on event.origin, because two hosted apps may legitimately share an
// origin (localhost:3000/admin and localhost:3000/store), and then the origin
// tells them apart not at all. event.origin is still checked, on every single
// message, as the proof that the frame we identified is still where we put it:
// a frame that navigates itself off its configured origin stops being heard
// rather than being believed under a neighbour's name.
//
// Every answer the shell forwards to the panel is stamped with {app:{id,name,
// origin}} from the shell's OWN registry, overwriting anything the frame put
// there. That stamp is what makes app A's console impossible to file against
// app B: the panel never has to guess where a payload came from.
//
// Requests travel the other way with an `appId` naming the frame they are for,
// which the relay resolves against the same registry. Pin and screenshot are
// refused for anything but the frame in view — both are about what the
// operator is looking at, and a screenshot of a hidden frame would be a
// picture of a page nobody was on.
//
// The shell page carries TWO parties: this inline script (the relay) and the
// SDK panel mounted on it with framedHost:true. They share the same window, so
// the relay speaks the SAME types to the panel via same-window postMessage:
// the panel posts request types to its own window; the relay forwards them
// into the right frame; the frame's answers are re-posted onto the shell
// window for the panel to consume. Requests flow only panel→frame and
// responses only frame→panel — the sets are disjoint, so a re-posted response
// can never be mistaken for a request and echo back into a frame.
//
// X-FRAME-OPTIONS
//
// Plenty of applications refuse to be framed, and they are right to. The shell
// cannot detect that from JavaScript — a blocked frame looks identical to a
// slow one — so it says so up front rather than leaving an operator staring at
// a blank rectangle wondering whose fault it is.

// serveShell mounts the shell at /shell.
//
// Not at /, deliberately. The daemon's own dashboard lives there and is what
// an operator wants when the product is the thing that is broken. The shell is
// for working ON the products while they run.
func serveShell(k *togo.Kernel) {
	targets, err := parseTargets(os.Getenv("BUILDER_TARGETS"), os.Getenv("BUILDER_TARGET"))
	if err != nil {
		// Refused, not defaulted. A shell that silently frames localhost:3000
		// because BUILDER_TARGETS had a typo is worse than no shell: the
		// operator sees a working page and never learns their config was
		// ignored.
		fmt.Printf("  ! BUILDER_TARGETS: %v — the shell will not be served\n", err)
		return
	}

	k.Router.Get("/shell", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		apps := viewFor(targets, q.Get("app"), q.Get("url"))
		lang, dir := localeFor(q.Get("lang"))

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// The shell must never be cached: it carries the target list and the
		// SDK bootstrap, and a stale copy points at yesterday's environment.
		w.Header().Set("Cache-Control", "no-store")
		if err := shellTmpl.Execute(w, shellData{
			Apps:       apps,
			ActiveName: apps[pickActive(apps, q.Get("app"))].Name,
			// The switcher only exists when there is something to switch
			// between. With one target the page is what it has always been.
			Multi: len(apps) > 1,
			Lang:  lang,
			Dir:   dir,
			T:     shellCopy(lang),
		}); err != nil {
			// Headers are already out; there is nothing to say to the client.
			// Log it rather than discarding the error silently.
			slog.Debug("shell template write failed", "err", err)
		}
	})

	names := make([]string, 0, len(targets))
	for _, t := range targets {
		names = append(names, fmt.Sprintf("%s → %s", t.ID, t.URL))
	}
	fmt.Printf("  shell     http://localhost%s/shell  → framing %s\n",
		k.Config.Addr, strings.Join(names, ", "))
}

// viewFor builds ONE request's frame list from the configured targets.
//
// A copy, always. The parsed list is built once at startup and shared by every
// request, so the handler must not write to it — and the first version of this
// did, which produced two bugs that only appear on the SECOND visit and are
// therefore exactly the kind you ship:
//
//   - Active is never cleared, so after a visit with ?app=alpha and another
//     with ?app=auth BOTH entries were marked active, for everyone, until the
//     daemon restarted. Two frames rendered visible, stacked, and two switcher
//     buttons both read as pressed.
//   - One visitor's ?url= permanently rewrote the configured home URL, so the
//     next operator's shell — and the liveness probe — pointed at wherever the
//     last one happened to be.
//
// It is also a data race: net/http serves requests concurrently and this slice
// had no lock. `go test -race` on the concurrency test below catches it.
//
// target holds only strings and a bool, so the shallow copy IS a deep one.
//
// ?app= picks the frame in view and ?url= restores where that frame was.
// Together they are how the shell restores the operator's place: the frames
// report every inner navigation, the script mirrors the active one into
// ?app=&url= with replaceState, and a reload lands the same app on the same
// page.
//
// ?url= is confined to the named app's OWN origin. It used to accept any
// http(s) URL, which made the shell a way to frame somebody else's site under
// this origin — and now it would be worse than that: the relay validates a
// frame's messages against the origin configured for it, so a URL that could
// point anywhere would mean validating against an origin the caller chose.
func viewFor(configured []target, wantApp, wantURL string) []target {
	apps := make([]target, len(configured))
	copy(apps, configured)

	i := pickActive(apps, wantApp)
	if u := strings.TrimSpace(wantURL); u != "" {
		if restored, ok := restoreURL(apps[i].Origin, u); ok {
			apps[i].URL = restored
		}
	}
	apps[i].Active = true
	return apps
}

// pickActive resolves ?app= to an index, defaulting to the first target.
//
// An unknown id is ignored rather than refused: the list is configuration and
// it changes, so a bookmark naming an app that has since been renamed should
// open the shell on something rather than on an error page.
func pickActive(targets []target, want string) int {
	want = strings.TrimSpace(want)
	for i := range targets {
		if targets[i].ID == want {
			return i
		}
	}
	return 0
}

// restoreURL accepts ?url= only when it belongs to the app it is restoring.
func restoreURL(origin, raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", false
	}
	if u.Scheme+"://"+u.Host != origin {
		return "", false
	}
	return u.String(), true
}

// localeFor reads ?lang=, falling back to BUILDER_LOCALE and then English.
//
// A query parameter rather than Accept-Language: the operator's browser
// language is usually not the language they want their tooling in, and this is
// a page they bookmark.
func localeFor(want string) (lang, dir string) {
	if strings.TrimSpace(want) == "" {
		want = os.Getenv("BUILDER_LOCALE")
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(want)), "ar") {
		return "ar", "rtl"
	}
	return "en", "ltr"
}

type shellData struct {
	Apps       []target
	ActiveName string
	Multi      bool
	Lang       string
	Dir        string
	T          shellText
}

// shellText is the shell's own copy. The SDK panel has its own dictionary; this
// covers the page around it — the outage overlay, the no-SDK notice and the
// switcher.
type shellText struct {
	DownTitle  string
	DownBody   string
	DownTail   string
	NoSdkLead  string
	NoSdkTail  string
	Dismiss    string
	Apps       string
	Expand     string
	Collapse   string
	StatusUp   string
	StatusDown string
	Switch     string
}

func shellCopy(lang string) shellText {
	if lang == "ar" {
		return shellText{
			DownTitle:  "التطبيق لا يستجيب",
			DownBody:   "لم يتم تحميله — قد يكون قيد إعادة التشغيل أو البناء، أو يرفض العرض داخل إطار.",
			DownTail:   "البيلدر لم يتأثر: اللوحة لا تزال تعمل، ولوح المشكلات على",
			NoSdkLead:  "لم يتم العثور على حزمة البيلدر داخل هذا التطبيق، لذا تحديد العناصر ولقطات الشاشة ومزامنة الرابط معطّلة. تحتاج إلى وسم",
			NoSdkTail:  "الخاص بالحزمة داخل التطبيق نفسه. الإبلاغ عن المشكلات لا يزال يعمل.",
			Dismiss:    "إغلاق",
			Apps:       "التطبيقات المستضافة",
			Expand:     "عرض كل التطبيقات",
			Collapse:   "طيّ القائمة",
			StatusUp:   "يعمل",
			StatusDown: "لا يستجيب",
			Switch:     "التبديل إلى",
		}
	}
	return shellText{
		DownTitle:  "The app is not answering",
		DownBody:   "did not load — it may be restarting, mid-build, or refusing to be framed.",
		DownTail:   "The builder is unaffected: the panel still works, and the board is at",
		NoSdkLead:  "No builder SDK detected in this app, so element pinning, screenshots and URL sync are off. They need the SDK's",
		NoSdkTail:  "tag loaded inside the app itself. Filing issues still works.",
		Dismiss:    "Dismiss",
		Apps:       "Hosted apps",
		Expand:     "Show all apps",
		Collapse:   "Collapse",
		StatusUp:   "responding",
		StatusDown: "not responding",
		Switch:     "Switch to",
	}
}

// html/template, not string concatenation: every app's name, URL and origin
// reaches an attribute and several reach a JavaScript string, and the
// contextual escaping is what stops a crafted target from breaking out of
// either.
var shellTmpl = template.Must(template.New("shell").Parse(`<!doctype html>
<html lang="{{.Lang}}" dir="{{.Dir}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.ActiveName}} — builder</title>
<style>
  :root { color-scheme: dark light; }
  html, body { margin: 0; height: 100%; background: #0b0d10; }

  /* The frames are the whole page. Any chrome around them would be the builder
     stealing room from the product, which is the wrong way round: the product
     is what you are working on, the builder is what you reach for. The
     switcher below floats OVER them for the same reason. */
  #fr { position: fixed; inset: 0; }
  .frame {
    position: absolute; inset: 0; border: 0;
    width: 100%; height: 100%; display: block; background: #0b0d10;
  }
  /* visibility, never display:none — see the note at the top of shell.go. */
  .frame[data-active="false"] { visibility: hidden; pointer-events: none; }
  .frame[data-active="true"]  { z-index: 1; }

  /* ---- the app switcher ---- */
  #sw {
    position: fixed; inset-block-start: 12px; inset-inline-start: 12px;
    z-index: 2147482100; display: flex; align-items: center; gap: 2px;
    padding: 3px; max-width: calc(100% - 24px); overflow-x: auto;
    border-radius: 10px; border: 1px solid #232a33; background: #12161cf2;
    font: 12px/1 ui-sans-serif, system-ui, sans-serif; color: #9aa4b2;
    box-shadow: 0 4px 16px #00000059;
  }
  /* One hosted app means nothing to switch between, and the page is then
     exactly what it has always been. Driven by an attribute rather than a
     conditional "hidden" in the template: a template that emits an attribute
     NAME conditionally is the kind of markup html/template's contextual
     escaper has to guess about, and there is no reason to make it guess.
     (No backticks anywhere in this literal — it IS a Go raw string.) */
  #sw[data-multi="false"] { display: none; }
  .sw-ico { display: flex; padding-inline: 6px 2px; color: #6b7684; }
  .sw-app {
    all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 7px; white-space: nowrap;
    color: #9aa4b2; font: inherit;
  }
  .sw-app:hover { background: #1a1f27; color: #e5e9f0; }
  .sw-app:focus-visible { outline: 2px solid #6366f1; outline-offset: -2px; }
  /* The app in view is filled, not merely tinted: which product you are
     looking at has to be answerable at a glance, from across a desk. */
  .sw-app[aria-pressed="true"] { background: #2b3240; color: #f4f6fa; font-weight: 600; }
  .sw-dot { width: 6px; height: 6px; border-radius: 50%; background: #4b5563; flex: none; }
  .sw-dot[data-up="up"] { background: #10b981; }
  .sw-dot[data-up="down"] { background: #ef4444; }
  /* Collapsed: only the app in view. The switcher sits over the product's own
     header, so it must be possible to get it out of the way. */
  #sw[data-collapsed="true"] .sw-app[aria-pressed="false"] { display: none; }
  #swx {
    all: unset; cursor: pointer; display: flex; padding: 6px 4px;
    color: #6b7684; border-radius: 7px;
  }
  #swx:hover { background: #1a1f27; color: #e5e9f0; }
  #swx:focus-visible { outline: 2px solid #6366f1; outline-offset: -2px; }
  /* The chevron points toward the inline END when collapsed ("there is more
     this way") and back toward the inline START when expanded ("put it away").
     Written as four rules rather than one clever transform: the glyph is
     symmetric about its horizontal axis, so a rotate and a horizontal flip
     cancel each other out and the RTL arrow silently ends up pointing the
     wrong way. */
  #sw[data-collapsed="true"]  #swx svg { rotate: 0deg; }
  #sw[data-collapsed="false"] #swx svg { rotate: 180deg; }
  [dir="rtl"] #sw[data-collapsed="true"]  #swx svg { rotate: 180deg; }
  [dir="rtl"] #sw[data-collapsed="false"] #swx svg { rotate: 0deg; }

  #s {
    position: fixed; inset: 0; display: none; place-items: center; z-index: 2;
    font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; color: #9aa4b2;
    background: #0b0d10; padding: 2rem; text-align: center;
  }
  #s.on { display: grid; }
  #s code, #n code { color: #e5e9f0; background: #1a1f27; padding: .15rem .4rem; border-radius: 4px; }
  #s b { color: #e5e9f0; display: block; margin-bottom: .5rem; font-size: 15px; }

  /* The no-SDK notice. Bottom-start, opposite the SDK's FAB, small: it is a
     fact about capability, not an error, and it must not cover the product. */
  #n {
    position: fixed; inset-inline-start: 12px; inset-block-end: 12px;
    z-index: 2147482000; display: flex; align-items: center; gap: .6rem;
    max-width: 360px; font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
    color: #9aa4b2; background: #12161c; border: 1px solid #232a33;
    border-radius: 8px; padding: .55rem .75rem;
  }
  #n[hidden] { display: none; }
  #nx {
    all: unset; cursor: pointer; color: #e5e9f0; font-size: 14px;
    line-height: 1; padding: .2rem; align-self: flex-start;
  }
</style>
</head>
<body>

<div id="fr">
{{range .Apps}}
  <iframe class="frame"
          data-app="{{.ID}}" data-name="{{.Name}}" data-origin="{{.Origin}}"
          data-home="{{.URL}}" data-active="{{if .Active}}true{{else}}false{{end}}"
          src="{{.URL}}" title="{{.Name}}"
          allow="clipboard-read; clipboard-write; fullscreen"></iframe>
{{end}}
</div>

<nav id="sw" aria-label="{{.T.Apps}}" data-collapsed="false"
     data-multi="{{if .Multi}}true{{else}}false{{end}}">
  <span class="sw-ico"></span>
{{range .Apps}}
  <button type="button" class="sw-app" data-app="{{.ID}}"
          aria-pressed="{{if .Active}}true{{else}}false{{end}}">
    <span class="sw-dot" data-up="unknown"></span>
    <span class="sw-name">{{.Name}}</span>
  </button>
{{end}}
  <button type="button" id="swx" aria-expanded="true" aria-controls="sw"></button>
</nav>

<div id="s">
  <div>
    <b>{{.T.DownTitle}}</b>
    <code id="sd"></code> {{.T.DownBody}}<br>
    {{.T.DownTail}} <code>/issues</code>.
  </div>
</div>

<div id="n" hidden>
  <span>{{.T.NoSdkLead}} <code>&lt;script&gt;</code> {{.T.NoSdkTail}}</span>
  <button id="nx" aria-label="{{.T.Dismiss}}">&times;</button>
</div>

<script src="/sdk/builder-sdk.js"></script>
<script>
  // apiBase empty: the SDK is served by this daemon and talks to it
  // same-origin, so no CORS is involved and the session cookie applies.
  // framedHost: the products' DOMs are on other origins, so the panel must not
  // read them directly — pin and screenshot either travel over the bridge below
  // (when the app in view has the SDK loaded and it answers builder:ready) or
  // stay disabled with an explanation (when it does not).
  BuilderIssues.mount({ framedHost: true, locale: {{.Lang}} });

  var s = document.getElementById('s'), sd = document.getElementById('sd');
  var n = document.getElementById('n'), sw = document.getElementById('sw');
  var T = {
    up: {{.T.StatusUp}}, down: {{.T.StatusDown}}, sw: {{.T.Switch}},
    expand: {{.T.Expand}}, collapse: {{.T.Collapse}}
  };

  // ======================= the app registry =======================
  //
  // Built from the DOM the server rendered rather than from a JSON blob in a
  // script: html/template's attribute escaping is doing the work either way,
  // and this way there is exactly one place each app's name, origin and home
  // URL is written down.
  var apps = [];
  var active = null;

  Array.prototype.forEach.call(document.querySelectorAll('.frame'), function (el) {
    var btn = sw.querySelector('.sw-app[data-app="' + CSS.escape(el.dataset.app) + '"]');
    var a = {
      id: el.dataset.app,
      name: el.dataset.name,
      // The one origin this frame is allowed to be. From configuration, never
      // from a message: a frame that navigates itself to another origin simply
      // stops being heard.
      origin: el.dataset.origin,
      home: el.dataset.home,
      el: el,
      btn: btn,
      dot: btn ? btn.querySelector('.sw-dot') : null,
      ready: false,          // a builder:ready arrived for its CURRENT document
      lastUrl: null,         // last inner URL it reported
      timer: null,           // arms its no-SDK notice
      dismissed: false,      // its notice was dismissed — per app, not global
      up: null               // liveness, per app
    };
    apps.push(a);
    if (el.dataset.active === 'true') active = a;
  });
  if (!active && apps.length) active = apps[0];

  function byId(id) {
    for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i];
    return null;
  }
  // Routing key. NOT the origin: two hosted apps may share one (a path split
  // on the same host), and then the origin distinguishes them not at all. The
  // window IS the identity; the origin is checked separately as proof that the
  // window is still where we put it.
  function bySource(win) {
    for (var i = 0; i < apps.length; i++) if (apps[i].el.contentWindow === win) return apps[i];
    return null;
  }

  // ======================= the bridge relay =======================
  //
  // The counterpart lives in sdk/src/bridge.ts, inside each app's frame. The
  // message types below ARE the contract — change one half and you must change
  // the other. Every message is {v:1, type, ...}; every postMessage names an
  // explicit targetOrigin; every inbound message is checked against BOTH
  // event.origin and event.source. Never '*': a wildcard would leak an app's
  // console lines and screenshots to any page that frames it.

  // Requests flow shell → frame only; responses flow frame → shell only.
  // Disjoint by construction, so re-posting a response onto this window for
  // the panel can never loop back into a frame as a request.
  var REQ = { 'builder:pin:start': 1, 'builder:pin:cancel': 1,
              'builder:shot': 1, 'builder:context': 1 };
  var RES = { 'builder:ready': 1, 'builder:url': 1, 'builder:pin:done': 1,
              'builder:shot:done': 1, 'builder:context:done': 1 };
  // Requests that only make sense against the app in view. A pick armed in a
  // hidden frame can never be clicked, and a screenshot of one is a picture of
  // a page nobody is looking at — filed, later, as evidence of a bug on the
  // page they WERE looking at.
  var VIEW = { 'builder:pin:start': 1, 'builder:pin:cancel': 1, 'builder:shot': 1 };

  // The handshake. The hello carries our origin so the frame can pin its
  // replies to exactly this shell; the explicit targetOrigin means a frame
  // that is not on the expected origin never even receives it.
  function hello(a) {
    if (!a.el.contentWindow) return;
    a.el.contentWindow.postMessage(
      { v: 1, type: 'builder:hello', shellOrigin: location.origin },
      a.origin
    );
  }

  // No builder:ready within a few seconds of a frame load means that app has
  // no SDK. Say so — a disabled control with no explanation reads as a broken
  // one — but only for the app in VIEW, not while it is DOWN (the outage
  // overlay already owns that story), and never again once dismissed.
  function armReadyTimer(a) {
    clearTimeout(a.timer);
    a.timer = setTimeout(function () { paintNotice(); }, 4000);
  }

  function paintNotice() {
    n.hidden = !(active && !active.ready && active.up !== false && !active.dismissed);
  }

  // Mirror the active frame's location into the shell's own address bar, so
  // the URL an operator copies is the page the bug is on, and a reload
  // restores it (the server reads ?app= and ?url= — see serveShell).
  // replaceState, not pushState: every click inside a product would otherwise
  // stack an entry on the OUTER history and break the back button.
  function syncAddress() {
    if (!active) return;
    var q = '?app=' + encodeURIComponent(active.id);
    if (active.lastUrl) q += '&url=' + encodeURIComponent(active.lastUrl);
    history.replaceState(null, '', location.pathname + q);
  }

  function noteUrl(a, d) {
    if (typeof d.url !== 'string') return;
    var u;
    try { u = new URL(d.url); } catch (e) { return; }
    // Only THAT app's own URLs are recorded. The origin check on arrival
    // already guarantees this for an honest SDK; this guard is for a
    // compromised one, which must not steer our ?url= elsewhere.
    if (u.origin !== a.origin) return;
    a.lastUrl = u.href;
    if (a !== active) return;
    syncAddress();
    if (typeof d.title === 'string' && d.title) document.title = d.title + ' — builder';
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.v !== 1 || typeof d.type !== 'string') return;

    // Leg 1 — a frame speaking. Both checks, always: event.source proves WHICH
    // frame (and that it is a frame of ours rather than a popup), event.origin
    // proves that frame is still on the origin it was configured with.
    var a = bySource(e.source);
    if (a) {
      if (e.origin !== a.origin || RES[d.type] !== 1) return;

      if (d.type === 'builder:ready') {
        a.ready = true;
        clearTimeout(a.timer);
        noteUrl(a, d);
        paintNotice();
      } else if (d.type === 'builder:url') {
        noteUrl(a, d);
      }

      // Re-post every frame answer onto this window for the SDK panel — ready
      // and url included, so the panel can light up its bridge controls and
      // show the page the report will attach to.
      //
      // Stamped with OUR record of which app it was, overwriting whatever the
      // frame may have put in "app". This stamp is the whole reason a report
      // filed from auth cannot carry the dashboard's console: the panel never
      // has to infer the sender.
      var out = {};
      Object.keys(d).forEach(function (k) {
        // A hostile frame must not reach this page's Object prototype through
        // a key it chose.
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        out[k] = d[k];
      });
      out.app = { id: a.id, name: a.name, origin: a.origin };
      // Explicit targetOrigin: this stays on our own origin.
      window.postMessage(out, location.origin);
      return;
    }

    // Leg 2 — the SDK panel on THIS page asking. Same-window postMessage
    // arrives with source === window and our own origin; only request types
    // are forwarded, only to the frame the panel named, and only once that
    // frame has proven it can answer.
    if (e.source === window && e.origin === location.origin && REQ[d.type] === 1) {
      var t = typeof d.appId === 'string' ? byId(d.appId) : null;
      if (!t || !t.ready || !t.el.contentWindow) return;
      if (VIEW[d.type] === 1 && t !== active) return;
      // Rebuilt rather than forwarded: appId is shell-side routing metadata
      // and has no business crossing the origin boundary.
      t.el.contentWindow.postMessage({ v: 1, type: d.type }, t.origin);
    }
  });

  // Every frame load is a new document with a new SDK instance (or none): the
  // handshake starts over and readiness must be re-proven, per frame.
  apps.forEach(function (a) {
    a.el.addEventListener('load', function () {
      a.ready = false;
      hello(a);
      armReadyTimer(a);
      paintNotice();
    });
    // Once at startup too: the load listener covers the normal path, but a
    // hello to a frame with nobody listening is silently dropped, so an extra
    // one costs nothing and closes any ordering gap.
    hello(a);
    armReadyTimer(a);
  });

  document.getElementById('nx').addEventListener('click', function () {
    if (active) active.dismissed = true;
    n.hidden = true;
  });

  // ======================= switching =======================
  //
  // The panel does not move and the half-written report is not touched. Only
  // which frame is visible, and which app the panel is pointed at, change.
  function announce() {
    if (!active) return;
    window.postMessage({
      v: 1, type: 'builder:app:active',
      app: { id: active.id, name: active.name, origin: active.origin },
      ready: active.ready
    }, location.origin);
  }

  function activate(a) {
    if (!a || a === active) return;
    active = a;
    apps.forEach(function (x) {
      x.el.dataset.active = String(x === a);
      if (x.btn) x.btn.setAttribute('aria-pressed', String(x === a));
    });
    document.title = a.name + ' — builder';
    syncAddress();
    paintOutage();
    paintNotice();
    announce();
  }

  apps.forEach(function (a) {
    if (!a.btn) return;
    a.btn.title = T.sw + ' ' + a.name;
    a.btn.addEventListener('click', function () {
      // Clicking the app already in view collapses the switcher back out of
      // the way — the same control that reveals the list puts it away.
      if (a === active) { setCollapsed(sw.dataset.collapsed !== 'true'); return; }
      activate(a);
      setCollapsed(true);
    });
  });

  var swx = document.getElementById('swx');
  function setCollapsed(on) {
    sw.dataset.collapsed = String(on);
    swx.setAttribute('aria-expanded', String(!on));
    swx.setAttribute('aria-label', on ? T.expand : T.collapse);
    swx.title = on ? T.expand : T.collapse;
    try { localStorage.setItem('builder.shell.switcher', on ? '1' : '0'); } catch (err) { /* private browsing */ }
  }
  swx.addEventListener('click', function () { setCollapsed(sw.dataset.collapsed !== 'true'); });

  // Alt+1..9 switches without reaching for the mouse, and keeps working while
  // the switcher is collapsed. Alt rather than a bare digit: the frame has
  // focus most of the time and a product's own shortcuts must not be stolen.
  window.addEventListener('keydown', function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    var i = '123456789'.indexOf(e.key);
    if (i < 0 || i >= apps.length) return;
    e.preventDefault();
    activate(apps[i]);
  });

  if (BuilderIssues.icon) {
    document.querySelector('.sw-ico').appendChild(BuilderIssues.icon('layers', 14));
    swx.appendChild(BuilderIssues.icon('chevronRight', 14));
  }
  var storedCollapsed = false;
  try { storedCollapsed = localStorage.getItem('builder.shell.switcher') === '1'; } catch (err) { /* private browsing */ }
  setCollapsed(storedCollapsed);

  // ======================= liveness probe =======================

  // The load event cannot tell you an app is down.
  //
  // Chrome fires load for its OWN error page, so a refused connection looks
  // exactly like a successful one from out here — the frame reports loaded and
  // the operator gets a grey void with no explanation. Observed, not theorised:
  // it is what happened the first time this shell met a stopped product.
  //
  // So ask the network instead. no-cors gives an opaque response we cannot
  // read, which is fine: the only question is whether the request completed at
  // all. It resolves when the app answers and rejects when nothing is
  // listening, which is exactly the signal the frame refuses to give.
  //
  // Every hosted app is probed, not just the one in view: the switcher's dots
  // are the answer to "is auth even up?", which is a question you ask before
  // you switch, not after.
  function probe(a) {
    fetch(a.home, { mode: 'no-cors', cache: 'no-store' })
      .then(function () {
        show(a, true);
        // The SDK may load late — deferred, injected, or the app came up
        // slowly. Re-offer the handshake on each successful probe until it is
        // answered; to a frame with no SDK this is a dropped message.
        if (!a.ready) hello(a);
      })
      .catch(function () { show(a, false); });
  }

  function show(a, alive) {
    if (alive === a.up) return;      // nothing changed; leave the frame alone
    var wasDown = a.up === false;
    a.up = alive;
    if (a.dot) {
      a.dot.dataset.up = alive ? 'up' : 'down';
      a.dot.title = a.name + ' — ' + (alive ? T.up : T.down);
    }
    if (a === active) { paintOutage(); paintNotice(); }
    // Reload only on the DOWN to UP edge. Reloading on every successful probe
    // would blow away whatever the operator was doing in the app every few
    // seconds, which is a worse bug than the one this fixes.
    //
    // Restore to the last URL that app reported, not its home: an app
    // restarting must not also teleport the operator back to the page they
    // started on. The reload means a new document, so readiness is void until
    // the handshake completes again.
    if (alive && wasDown) {
      a.ready = false;
      a.el.src = a.lastUrl || a.home;
    }
  }

  function paintOutage() {
    var down = !!active && active.up === false;
    s.classList.toggle('on', down);
    if (active) sd.textContent = active.home;
  }

  apps.forEach(probe);
  paintOutage();
  announce();
  // A restart is the normal case, not an error: keep watching so an app comes
  // back by itself rather than making someone reload the shell.
  setInterval(function () { apps.forEach(probe); }, 3000);
</script>
</body>
</html>
`))
