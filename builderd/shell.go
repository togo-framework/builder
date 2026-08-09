package main

import (
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/togo-framework/togo"
)

// The shell: your product, framed, with the builder living outside it.
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
//	shell → frame   builder:hello        {shellOrigin}   targetOrigin = framed origin
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
// The shell page carries TWO parties: this inline script (the relay) and the
// SDK panel mounted on it with framedHost:true. They share the same window, so
// the relay speaks the SAME types to the panel via same-window postMessage:
// the panel posts request types to its own window; the relay forwards them
// into the frame; the frame's answers are re-posted onto the shell window for
// the panel to consume. Requests flow only panel→frame and responses only
// frame→panel — the sets are disjoint, so a re-posted response can never be
// mistaken for a request and echo back into the frame.
//
// X-FRAME-OPTIONS
//
// Plenty of applications refuse to be framed, and they are right to. The shell
// cannot detect that from JavaScript — a blocked frame looks identical to a
// slow one — so it says so up front rather than leaving an operator staring at
// a blank rectangle wondering whose fault it is.

const defaultTarget = "http://localhost:3000"

// serveShell mounts the shell at /shell.
//
// Not at /, deliberately. The daemon's own dashboard lives there and is what
// an operator wants when the product is the thing that is broken. The shell is
// for working ON the product while it runs.
func serveShell(k *togo.Kernel) {
	target := strings.TrimSpace(os.Getenv("BUILDER_TARGET"))
	if target == "" {
		target = defaultTarget
	}
	if u, err := url.Parse(target); err != nil || u.Host == "" {
		fmt.Printf("  ! BUILDER_TARGET is not a URL: %q — the shell will not be served\n", target)
		return
	}

	k.Router.Get("/shell", func(w http.ResponseWriter, r *http.Request) {
		// The target is overridable per request, so one daemon can front
		// several environments without a restart — and it is also how the
		// shell RESTORES the operator's place: the frame reports every inner
		// navigation, the script mirrors it into ?url= with replaceState, and
		// a reload of the shell lands the frame back on that page because the
		// override IS the restore. Parsed rather than interpolated: an
		// unchecked value here is an open redirect and, worse, a way to frame
		// somebody else's site under our origin.
		t := target
		if q := strings.TrimSpace(r.URL.Query().Get("url")); q != "" {
			if u, err := url.Parse(q); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" {
				t = u.String()
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// The shell must never be cached: it carries the target and the SDK
		// bootstrap, and a stale copy points at yesterday's environment.
		w.Header().Set("Cache-Control", "no-store")
		_ = shellTmpl.Execute(w, map[string]any{
			"Target": t,
			"Origin": "", // same-origin: the SDK is served by this daemon
		})
	})

	fmt.Printf("  shell     http://localhost%s/shell  → framing %s\n", k.Config.Addr, target)
}

// html/template, not string concatenation: Target reaches an attribute and a
// JavaScript string, and the contextual escaping is what stops a crafted ?url
// from breaking out of either.
var shellTmpl = template.Must(template.New("shell").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Target}} — builder</title>
<style>
  :root { color-scheme: dark light; }
  html, body { margin: 0; height: 100%; background: #0b0d10; }
  /* The frame is the whole page. Any chrome around it would be the builder
     stealing room from the product, which is the wrong way round: the product
     is what you are working on, the builder is what you reach for. */
  #f { border: 0; width: 100%; height: 100%; display: block; background: #0b0d10; }
  #s {
    position: fixed; inset: 0; display: none; place-items: center;
    font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; color: #9aa4b2;
    background: #0b0d10; padding: 2rem; text-align: center;
  }
  #s.on { display: grid; }
  #s code { color: #e5e9f0; background: #1a1f27; padding: .15rem .4rem; border-radius: 4px; }
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
  #n code { color: #e5e9f0; background: #1a1f27; padding: .1rem .3rem; border-radius: 4px; }
  #nx {
    all: unset; cursor: pointer; color: #e5e9f0; font-size: 14px;
    line-height: 1; padding: .2rem; align-self: flex-start;
  }
</style>
</head>
<body>
<iframe id="f" src="{{.Target}}" title="The product"
        allow="clipboard-read; clipboard-write; fullscreen"></iframe>

<div id="s">
  <div>
    <b>The product is not answering</b>
    <code>{{.Target}}</code> did not load — it may be restarting, mid-build, or refusing to be framed.<br>
    The builder is unaffected: the panel below still works, and the board is at <code>/issues</code>.
  </div>
</div>

<div id="n" hidden>
  <span>No builder SDK detected in the product, so element pinning, screenshots
  and URL sync are off. They need the SDK's <code>&lt;script&gt;</code> tag
  loaded inside the product itself. Filing issues still works.</span>
  <button id="nx" aria-label="Dismiss">&times;</button>
</div>

<script src="/sdk/builder-sdk.js"></script>
<script>
  // apiBase empty: the SDK is served by this daemon and talks to it
  // same-origin, so no CORS is involved and the session cookie applies.
  // framedHost: the product's DOM is on another origin, so the panel must not
  // read it directly — pin and screenshot either travel over the bridge below
  // (when the product has the SDK loaded and it answers builder:ready) or stay
  // disabled with an explanation (when it does not).
  BuilderIssues.mount({ framedHost: true });

  var f = document.getElementById('f'), s = document.getElementById('s');
  var n = document.getElementById('n');
  var target = {{.Target}};
  var up = null;

  // ======================= the bridge relay =======================
  //
  // The counterpart lives in sdk/src/bridge.ts, inside the product's frame.
  // The message types below ARE the contract — change one half and you must
  // change the other. Every message is {v:1, type, ...}; every postMessage
  // names an explicit targetOrigin; every inbound message is checked against
  // BOTH event.origin and event.source. Never '*': a wildcard would leak the
  // product's console lines and screenshots to any page that frames it.

  // The one origin the frame is allowed to be. Derived from the parsed target,
  // never from a message: a frame that navigates itself to another origin
  // simply stops being heard.
  var frameOrigin = null;
  try { frameOrigin = new URL(target).origin; } catch (e) { frameOrigin = null; }

  var sdkReady = false;      // a builder:ready arrived for the CURRENT document
  var lastUrl = null;        // last inner URL the frame reported
  var readyTimer = null;     // arms the no-SDK notice
  var noticeDismissed = false;

  // Requests flow shell → frame only; responses flow frame → shell only.
  // Disjoint by construction, so re-posting a response onto this window for
  // the panel can never loop back into the frame as a request.
  var REQ = { 'builder:pin:start': 1, 'builder:pin:cancel': 1,
              'builder:shot': 1, 'builder:context': 1 };
  var RES = { 'builder:ready': 1, 'builder:url': 1, 'builder:pin:done': 1,
              'builder:shot:done': 1, 'builder:context:done': 1 };

  // The handshake. The hello carries our origin so the frame can pin its
  // replies to exactly this shell; the explicit targetOrigin means a frame
  // that is not on the expected origin never even receives it.
  function hello() {
    if (!frameOrigin || !f.contentWindow) return;
    f.contentWindow.postMessage(
      { v: 1, type: 'builder:hello', shellOrigin: location.origin },
      frameOrigin
    );
  }

  // No builder:ready within a few seconds of a frame load means the product
  // has no SDK. Say so — a disabled control with no explanation reads as a
  // broken one — but not while the product is DOWN, when the outage overlay
  // already owns the story, and never again once dismissed.
  function armReadyTimer() {
    clearTimeout(readyTimer);
    readyTimer = setTimeout(function () {
      if (!sdkReady && up !== false && !noticeDismissed) n.hidden = false;
    }, 4000);
  }

  // Mirror the frame's location into the shell's own address bar, so the URL
  // an operator copies is the page the bug is on, and a reload restores it
  // (the server reads ?url= and frames it — see serveShell). replaceState,
  // not pushState: every click inside the product would otherwise stack an
  // entry on the OUTER history and break the back button.
  function syncUrl(d) {
    if (typeof d.url !== 'string') return;
    var u;
    try { u = new URL(d.url); } catch (e) { return; }
    // Only the framed origin's own URLs reach the address bar. The origin
    // check on arrival already guarantees this for an honest SDK; this guard
    // is for a compromised one, which must not steer our ?url= elsewhere.
    if (u.origin !== frameOrigin) return;
    lastUrl = u.href;
    history.replaceState(null, '', location.pathname + '?url=' + encodeURIComponent(u.href));
    if (typeof d.title === 'string' && d.title) document.title = d.title + ' — builder';
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!frameOrigin || !d || d.v !== 1 || typeof d.type !== 'string') return;

    // Leg 1 — the frame speaking. Both checks, always: event.origin proves
    // WHERE the document lives, event.source proves it is OUR frame and not
    // some other window on the same origin (a popup, a nested iframe).
    if (e.source === f.contentWindow && e.origin === frameOrigin && RES[d.type] === 1) {
      if (d.type === 'builder:ready') {
        sdkReady = true;
        clearTimeout(readyTimer);
        n.hidden = true;
        syncUrl(d);
      } else if (d.type === 'builder:url') {
        syncUrl(d);
      }
      // Re-post every frame answer onto this window for the SDK panel —
      // ready and url included, so the panel can light up its bridge
      // controls and show the page the report will attach to. Explicit
      // targetOrigin: this stays on our own origin.
      window.postMessage(d, location.origin);
      return;
    }

    // Leg 2 — the SDK panel on THIS page asking. Same-window postMessage
    // arrives with source === window and our own origin; only the request
    // types are forwarded, and only once the frame has proven it can answer.
    if (e.source === window && e.origin === location.origin && REQ[d.type] === 1) {
      if (!sdkReady || !f.contentWindow) return;
      f.contentWindow.postMessage(d, frameOrigin);
    }
  });

  // Every frame load is a new document with a new SDK instance (or none):
  // the handshake starts over and readiness must be re-proven each time.
  f.addEventListener('load', function () {
    sdkReady = false;
    hello();
    armReadyTimer();
  });

  document.getElementById('nx').addEventListener('click', function () {
    noticeDismissed = true;
    n.hidden = true;
  });

  // Once at startup too: the load listener above covers the normal path, but
  // a hello to a frame with nobody listening is silently dropped, so an extra
  // one costs nothing and closes any ordering gap.
  hello();
  armReadyTimer();

  // ======================= liveness probe =======================

  // The load event cannot tell you the product is down.
  //
  // Chrome fires load for its OWN error page, so a refused connection looks
  // exactly like a successful one from out here — the frame reports loaded and
  // the operator gets a grey void with no explanation. Observed, not theorised:
  // it is what happened the first time this shell met a stopped product.
  //
  // So ask the network instead. no-cors gives an opaque response we cannot
  // read, which is fine: the only question is whether the request completed at
  // all. It resolves when the product answers and rejects when nothing is
  // listening, which is exactly the signal the frame refuses to give.
  function probe() {
    fetch(target, { mode: 'no-cors', cache: 'no-store' })
      .then(function () {
        show(true);
        // The SDK may load late — deferred, injected, or the product came up
        // slowly. Re-offer the handshake on each successful probe until it is
        // answered; to a frame with no SDK this is a dropped message.
        if (!sdkReady) hello();
      })
      .catch(function () { show(false); });
  }

  function show(alive) {
    if (alive === up) return;      // nothing changed; leave the frame alone
    var wasDown = up === false;
    up = alive;
    s.classList.toggle('on', !alive);
    // Reload only on the DOWN to UP edge. Reloading on every successful probe
    // would blow away whatever the operator was doing in the product every few
    // seconds, which is a worse bug than the one this fixes.
    //
    // Restore to the last URL the frame reported, not the original target:
    // the product restarting must not also teleport the operator back to the
    // page they started on.
    if (alive && wasDown) f.src = lastUrl || f.src;
  }

  probe();
  // A restart is the normal case, not an error: keep watching so the product
  // comes back by itself rather than making someone reload the shell.
  setInterval(probe, 3000);
</script>
</body>
</html>
`))
