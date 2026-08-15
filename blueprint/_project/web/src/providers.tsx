import { ReactNode, useEffect } from "react";
import { ThemeProvider, LanguageProvider, themes, useT } from "@togo-framework/ui";

// ThemeProvider applies the ToGO brand tokens + multi-theme switching (data-theme on
// <html>, persisted to localStorage). The full `themes` list enables the ThemePicker
// to cycle through all presets (dark, light, purple, rose, emerald, and light variants).
// LanguageProvider supplies EN/AR i18n + RTL.
/**
 * The language this session should start in.
 *
 * `?lang=` first, because that is how a FeedbackOS app window tells a framed
 * screen which language the surrounding product is in — without it the window
 * title was Arabic, the page around it was Arabic, and the screen inside came
 * up in English. Then the stored choice, then the document, then English.
 *
 * A stored choice still wins for a normal visit; the param only leads when one
 * is actually present, which is only ever true inside a frame.
 */
const LANG_KEY = "sentra:lang";

function initialLanguage(): "en" | "ar" {
  if (typeof window === "undefined") return "en";
  const q = new URLSearchParams(window.location.search).get("lang");

  if (q === "ar" || q === "en") {
    // Written to storage, not just returned.
    //
    // `initialLanguage` is a PROP, and the kit's LanguageProvider prefers its
    // own stored value over it — so returning "ar" here did nothing once the
    // operator had ever picked a language inside the dashboard. The symptom was
    // exact and confusing: a FeedbackOS window whose title bar and host page
    // were Arabic, containing a screen in English, with no way to fix it from
    // the outside.
    //
    // Seeding the kit's own key before it mounts is what makes the param
    // actually lead. It is a write rather than a read because the provider's
    // precedence is not ours to change from here.
    try {
      localStorage.setItem(LANG_KEY, q);
    } catch {
      // Private mode: the prop below is still the fallback, which is right for
      // a session that cannot persist anything anyway.
    }
    applyDir(q);
    return q;
  }

  try {
    // The kit's own key, so a choice made inside the dashboard is read back.
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "ar" || stored === "en") {
      applyDir(stored);
      return stored;
    }
  } catch {
    // Private mode. Fall through to the document.
  }
  const fromDoc = document.documentElement.lang.startsWith("ar") ? "ar" : "en";
  applyDir(fromDoc);
  return fromDoc;
}

/**
 * Set `lang` and `dir` on <html> before first paint.
 *
 * `dir` is the one that matters and the one that was missing: the page rendered
 * Arabic text in a left-to-right layout, which is not a cosmetic problem — it
 * puts the sentence in the wrong place, mirrors nothing, and makes every
 * logical CSS property in the app resolve the wrong way. Rule 15 exists for
 * this failure specifically, and it is silent in the direction nobody on the
 * team reads.
 *
 * Done here rather than in an effect so the first frame is already correct;
 * flipping direction after paint is a visible jump.
 */
function applyDir(lang: "en" | "ar") {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = lang === "ar" ? "rtl" : "ltr";
}

/**
 * Keep <html dir> agreeing with the language actually being rendered.
 *
 * The kit sets `dir` from its own state, and that state is resolved before this
 * app's `initialLanguage()` runs — so a framed load with `?lang=ar` rendered
 * Arabic text inside a `dir="ltr"` document: correct words, mirrored layout,
 * every logical CSS property resolving the wrong way.
 *
 * Reading `useT()` — the same hook the content reads — is what makes this
 * correct rather than another guess racing the kit. It runs INSIDE
 * LanguageProvider, after the kit's own effect, and re-runs whenever the
 * operator switches language in-app, so the two can no longer disagree.
 */
function DirSync({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useT();

  // `?lang=` outranks a stored choice.
  //
  // Inside a frame the surrounding product's language is not a preference, it
  // is context — a screen opened from an Arabic page must not come up in
  // English under an Arabic window title. setLanguage is the kit's own setter,
  // so it persists and switches i18n rather than racing the provider.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("lang");
    if ((want === "ar" || want === "en") && want !== language) setLanguage(want);
  }, [language, setLanguage]);

  // Direction, applied on EVERY language value rather than only on a change.
  //
  // This is the bug that survived three attempts to fix it upstream of here.
  // The observed state was `lang="ar"` with `dir="ltr"` — Arabic text laid out
  // left-to-right — and it persisted because every guarded version of this
  // effect declined to run: the language already matched what was wanted, so
  // "only fix it when something changed" concluded there was nothing to fix,
  // while `dir` had never been set to match in the first place.
  //
  // Making it unconditional costs one attribute write per render pass and
  // removes the entire class of "who set it last" reasoning. There is no
  // competing writer — a manual write in the live document sticks — so the
  // last word being ours is exactly what is wanted.
  useEffect(() => {
    const want = language === "ar" ? "rtl" : "ltr";
    applyDir(language === "ar" ? "ar" : "en");

    // Re-assert if anything else writes `dir`.
    //
    // Setting it once is not enough, and this was established by measurement
    // rather than assumed: an instrumented build confirmed this effect setting
    // `dir="rtl"` and reading it back as "rtl", while the document a moment
    // later reported "ltr". Some other writer — after the last React commit,
    // in a bundle where the only other `documentElement.dir` assignment sets
    // both `dir` and `lang` together — was putting it back, and `lang` stayed
    // "ar" throughout, so it was not the language provider disagreeing.
    //
    // Rather than keep hunting a writer that a full-bundle search does not
    // account for, this states the invariant directly: while this app is
    // mounted, `<html dir>` matches the language being rendered. The observer
    // is cheap (it fires only on attribute changes to one element), it
    // disconnects on unmount, and it cannot loop — it only writes when the
    // value is already wrong.
    const el = document.documentElement;

    // BOUNDED. This is the important part, and it was learned the hard way.
    //
    // The first version re-asserted on every change, unconditionally. If any
    // other code also writes `dir` — which is precisely the situation this
    // exists to survive — the two writers ping-pong: it sets ltr, the observer
    // sets rtl, that write fires the observer again, forever. The page pegs a
    // core and stops responding, and it does so INSIDE a framed dashboard on a
    // customer's site, which is the worst place to spend a spin loop.
    //
    // A handful of corrections is enough to win an ordering race at mount. If
    // something is still fighting after that, it is a genuine disagreement and
    // the honest response is to stop and leave the other writer's value rather
    // than hang the page insisting.
    let corrections = 0;
    const obs = new MutationObserver(() => {
      if (el.getAttribute("dir") === want) return;
      if (++corrections > 5) {
        obs.disconnect();
        return;
      }
      el.setAttribute("dir", want);
    });
    obs.observe(el, { attributes: true, attributeFilter: ["dir"] });
    return () => obs.disconnect();
  }, [language]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider themes={themes}>
      <LanguageProvider initialLanguage={initialLanguage()}>
        <DirSync>{children}</DirSync>
      </LanguageProvider>
    </ThemeProvider>
  );
}
