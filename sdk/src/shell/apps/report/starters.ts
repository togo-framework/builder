// Starters: the scaffolding that carries the weight.
//
// The Initial CTA pattern's core claim is that the input box is the small part.
// Most people cannot prompt well — "a short prompt rarely captures the nuance of
// their intent" — so the surrounding scaffolding has to do the work, and the
// first step has to be forgiving.
//
// Everything here is DERIVED FROM THE CONTEXT ALREADY CAPTURED. No model call,
// no network, no latency. That is deliberate: a suggestion that arrives half a
// second after the user starts typing is a suggestion nobody reads, and one
// that requires the AI to be available makes filing a bug depend on the AI
// being available.

export type Mode = "bug" | "idea" | "question" | "chore";

export interface ConsoleEntry {
  level: string;
  text: string;
  at?: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
}

export interface CaptureContext {
  route: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  /** Accessible name of the pinned element, when the user pinned one. */
  pinName?: string;
  /** Recent issues already filed on this route. */
  recent?: { number: number; title: string }[];
}

export interface Starter {
  /** Stable id, so React keys do not reshuffle as context updates. */
  id: string;
  /** What the card shows. */
  label: string;
  /** What clicking it puts in the composer. */
  text: string;
  /** Glyph name from the inlined set. */
  icon: string;
  /** Ranked: the more specific the evidence, the higher. */
  weight: number;
}

const shortUrl = (u: string): string => {
  try {
    const p = new URL(u, "http://x.invalid").pathname;
    return p.length > 40 ? p.slice(0, 39) + "…" : p;
  } catch {
    return u.slice(0, 40);
  }
};

/**
 * Build starters from what was actually captured.
 *
 * Ordered by how much evidence sits behind each one. A 500 the user just
 * triggered is a better opening line than a generic template, and a pinned
 * element beats both because the user pointed at it deliberately.
 */
/**
 * The starter strings, per locale.
 *
 * Every label and every inserted sentence was an English literal, so an
 * operator working in Arabic got an English suggestion list — and clicking one
 * INSERTED English into their Arabic report. The scaffolding that is supposed
 * to carry the weight for someone who cannot phrase the bug was carrying it in
 * a language they may not write.
 *
 * Functions rather than templates with placeholders: Arabic word order puts the
 * quoted name and the role in a different sequence, and a `${}`-substituted
 * English sentence is not a translation.
 */
const T = {
  en: {
    pinLabel: (n: string, r: string) => `The “${n}” ${r} does nothing`,
    pinText: (n: string, r: string) => `The “${n}” ${r} does not respond when I use it.`,
    netLabel: (s: number, m: string, u: string) => `Report the ${s} on ${m} ${u}`,
    netText: (m: string, u: string, s: number) => `${m} ${u} returned ${s}.`,
    net4Label: (s: number, u: string) => `Report the ${s} on ${u}`,
    errLabel: "Report the error in the console",
    errText: (t: string) => `The page logged an error: ${t}`,
    wrongLabel: "Something looks wrong on this page",
    wrongText: "Something on this page does not look right:",
    expectedLabel: "Describe what you expected",
    expectedText: "I expected: \nInstead: ",
    recentLabel: (n: number, title: string) => `#${n} ${title}`,
    recentText: (n: number, title: string) => `This looks like #${n} (${title}) happening again.`,
  },
  ar: {
    pinLabel: (n: string, r: string) => `«${n}» ${r} لا يستجيب`,
    pinText: (n: string, r: string) => `«${n}» ${r} لا يستجيب عند استخدامه.`,
    netLabel: (s: number, m: string, u: string) => `الإبلاغ عن الخطأ ${s} في ${m} ${u}`,
    netText: (m: string, u: string, s: number) => `أعاد ${m} ${u} الرمز ${s}.`,
    net4Label: (s: number, u: string) => `الإبلاغ عن الخطأ ${s} في ${u}`,
    errLabel: "الإبلاغ عن الخطأ في وحدة التحكم",
    errText: (t: string) => `سجّلت الصفحة خطأً: ${t}`,
    wrongLabel: "هناك شيء يبدو خاطئًا في هذه الصفحة",
    wrongText: "هناك شيء في هذه الصفحة لا يبدو صحيحًا:",
    expectedLabel: "صف ما كنت تتوقعه",
    expectedText: "توقعت: \nلكن حدث: ",
    recentLabel: (n: number, title: string) => `#${n} ${title}`,
    recentText: (n: number, title: string) => `يبدو أن هذه هي المشكلة #${n} (${title}) تتكرر.`,
  },
} as const;

export function buildStarters(ctx: CaptureContext, mode: Mode, locale: string = "en"): Starter[] {
  const t = locale === "ar" ? T.ar : T.en;
  const out: Starter[] = [];

  // Strongest signal: the user pointed at something.
  if (ctx.pinName) {
    out.push({
      id: "pin",
      label: t.pinLabel(ctx.pinName, guessRole(ctx.pinName)),
      text: t.pinText(ctx.pinName, guessRole(ctx.pinName)),
      icon: "Pin",
      weight: 100,
    });
  }

  // A server error the user just caused.
  // Deduped by method+url+status. The recorder keeps every failure, and a
  // page that retries a broken endpoint logs the same 502 three times — so the
  // suggestion row offered "Report the 502 on GET /api/github" twice, side by
  // side, which reads as the widget being broken rather than the endpoint.
  const seen = new Set<string>();
  const failed = ctx.network
    .filter((n) => n.status >= 500)
    .filter((n) => {
      const k = `${n.method} ${n.url} ${n.status}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 2);
  for (const [i, n] of failed.entries()) {
    out.push({
      id: `net5xx-${i}`,
      label: t.netLabel(n.status, n.method, shortUrl(n.url)),
      text: t.netText(n.method, n.url, n.status),
      icon: "WarningTriangle",
      weight: 90 - i,
    });
  }

  // A 4xx is weaker evidence — often the app behaving correctly — so it only
  // appears when nothing stronger did.
  if (!failed.length) {
    const client = ctx.network.find((n) => n.status >= 400 && n.status < 500);
    if (client) {
      out.push({
        id: "net4xx",
        label: t.net4Label(client.status, shortUrl(client.url)),
        text: t.netText(client.method, client.url, client.status),
        icon: "WarningTriangle",
        weight: 70,
      });
    }
  }

  const err = ctx.console.find((c) => c.level === "error");
  if (err) {
    out.push({
      id: "console",
      label: truncate(t.errLabel, 60),
      text: t.errText(err.text),
      icon: "XCircle",
      weight: 80,
    });
  }

  // Real issues already filed here. Not a template — clicking one should let
  // the user say "this again" rather than describe it from scratch.
  for (const [i, r] of (ctx.recent ?? []).slice(0, 2).entries()) {
    out.push({
      id: `recent-${r.number}`,
      label: t.recentLabel(r.number, truncate(r.title, 44)),
      text: t.recentText(r.number, r.title),
      icon: "History",
      weight: 40 - i,
    });
  }

  // The mode's own opener, ALWAYS — not only when nothing else was found.
  //
  // Gated on `out.length < 2`, the mode never reached the row whenever the page
  // had produced any evidence at all: an operator who picked "Idea" on a page
  // with a 500 in its network log was offered only bug-shaped sentences, and
  // the mode chip they had just pressed changed nothing they could see. Its
  // weight (10) keeps it last, so real evidence still leads.
  out.push(...templatesFor(mode, ctx.route, locale));

  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/**
 * Guess what an element IS from its accessible name, so the sentence reads
 * naturally. "Pay now" is a button; "Email" is a field. Wrong guesses are
 * cheap — the text lands in an editable box, not in the filed issue.
 */
function guessRole(name: string): string {
  const n = name.toLowerCase();
  if (/(save|submit|send|pay|buy|continue|next|confirm|delete|cancel)/.test(n)) return "button";
  if (/(email|name|password|search|phone|address)/.test(n)) return "field";
  if (/(menu|nav|tab)/.test(n)) return "menu";
  return "control";
}

/**
 * The fallback starters, when the captured context produced fewer than two.
 *
 * Localized like everything else here: an operator writing in Arabic was
 * offered English openers, and clicking one inserted English into their report.
 */
function templatesFor(mode: Mode, route: string, locale: string): Starter[] {
  const ar = locale === "ar";
  const on = (s: string) => (ar ? `في ${route}، ${s}` : `On ${route}, ${s}`);
  switch (mode) {
    case "idea":
      return [
        {
          id: "t-idea",
          label: ar ? "اقترح تحسينًا هنا" : "Suggest an improvement here",
          icon: "Lightbulb",
          weight: 10,
          text: on(ar ? "سيكون من المفيد لو " : "it would help if "),
        },
      ];
    case "question":
      return [
        {
          id: "t-q",
          label: ar ? "اسأل عن طريقة عمل شيء ما" : "Ask how something works",
          icon: "HelpCircle",
          weight: 10,
          text: on(ar ? "لست متأكدًا كيف " : "I am not sure how "),
        },
      ];
    case "chore":
      return [
        {
          id: "t-chore",
          label: ar ? "سجّل شيئًا يحتاج ترتيبًا" : "Note something to tidy up",
          icon: "Wrench",
          weight: 10,
          text: on(""),
        },
      ];
    default:
      return [
        {
          id: "t-bug",
          label: ar ? "هناك شيء يبدو خاطئًا في هذه الصفحة" : "Something looks wrong on this page",
          icon: "Bug",
          weight: 10,
          text: on(""),
        },
        {
          id: "t-repro",
          label: ar ? "صف ما كنت تتوقعه" : "Describe what you expected",
          icon: "Flag",
          weight: 9,
          text: ar ? "توقعت … لكن بدلاً من ذلك … " : "I expected … but instead … ",
        },
      ];
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
