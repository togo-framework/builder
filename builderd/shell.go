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
// WHAT IS GENUINELY LOST, AND IT IS NOT NOTHING
//
// A cross-origin iframe is opaque. The SDK cannot read the framed page's DOM,
// so element pinning and DOM capture do not work through the shell — those
// need the SDK loaded inside the product, and the script-tag embed remains the
// way to have them. Through the shell you get the URL and everything that does
// not require reaching into the page: filing an issue, the board, the fleet,
// the brain, the chat.
//
// Being precise about that is the point. A shell that silently degraded
// pinning would be worse than one that says so.
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
		// several environments without a restart. Parsed rather than
		// interpolated: an unchecked value here is an open redirect and,
		// worse, a way to frame somebody else's site under our origin.
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

<script src="/sdk/builder-sdk.js"></script>
<script>
  // apiBase empty: the SDK is served by this daemon and talks to it
  // same-origin, so no CORS is involved and the session cookie applies.
  // framedHost: pinning and screenshots read the DOM, and the product's DOM is
  // on another origin. Telling the SDK so is what stops it offering a
  // screenshot button that returns a black image.
  BuilderIssues.mount({ framedHost: true });

  var f = document.getElementById('f'), s = document.getElementById('s');
  var target = {{.Target}};
  var up = null;

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
      .then(function () { show(true); })
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
    if (alive && wasDown) f.src = f.src;
  }

  probe();
  // A restart is the normal case, not an error: keep watching so the product
  // comes back by itself rather than making someone reload the shell.
  setInterval(probe, 3000);
</script>
</body>
</html>
`))
