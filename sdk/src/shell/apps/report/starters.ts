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
export function buildStarters(ctx: CaptureContext, mode: Mode): Starter[] {
  const out: Starter[] = [];

  // Strongest signal: the user pointed at something.
  if (ctx.pinName) {
    out.push({
      id: "pin",
      label: `The “${ctx.pinName}” ${guessRole(ctx.pinName)} does nothing`,
      text: `The “${ctx.pinName}” ${guessRole(ctx.pinName)} does not respond when I use it.`,
      icon: "Pin",
      weight: 100,
    });
  }

  // A server error the user just caused.
  const failed = ctx.network.filter((n) => n.status >= 500).slice(0, 2);
  for (const [i, n] of failed.entries()) {
    out.push({
      id: `net5xx-${i}`,
      label: `Report the ${n.status} on ${n.method} ${shortUrl(n.url)}`,
      text: `${n.method} ${n.url} returned ${n.status}.`,
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
        label: `Report the ${client.status} on ${shortUrl(client.url)}`,
        text: `${client.method} ${client.url} returned ${client.status}.`,
        icon: "WarningTriangle",
        weight: 70,
      });
    }
  }

  const err = ctx.console.find((c) => c.level === "error");
  if (err) {
    out.push({
      id: "console",
      label: truncate(`Console error: ${err.text}`, 60),
      text: `The console shows: ${err.text}`,
      icon: "XCircle",
      weight: 80,
    });
  }

  // Real issues already filed here. Not a template — clicking one should let
  // the user say "this again" rather than describe it from scratch.
  for (const [i, r] of (ctx.recent ?? []).slice(0, 2).entries()) {
    out.push({
      id: `recent-${r.number}`,
      label: `#${r.number} ${truncate(r.title, 44)}`,
      text: `This looks like #${r.number} (${r.title}) happening again.`,
      icon: "History",
      weight: 40 - i,
    });
  }

  // Mode-appropriate fallback, so the row is never empty. Empty scaffolding is
  // worse than none: it reads as the feature being broken.
  if (out.length < 2) out.push(...templatesFor(mode, ctx.route));

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

function templatesFor(mode: Mode, route: string): Starter[] {
  switch (mode) {
    case "idea":
      return [
        { id: "t-idea", label: "Suggest an improvement here", icon: "Lightbulb", weight: 10,
          text: `On ${route}, it would help if ` },
      ];
    case "question":
      return [
        { id: "t-q", label: "Ask how something works", icon: "HelpCircle", weight: 10,
          text: `On ${route}, I am not sure how ` },
      ];
    case "chore":
      return [
        { id: "t-chore", label: "Note something to tidy up", icon: "Wrench", weight: 10,
          text: `On ${route}, ` },
      ];
    default:
      return [
        { id: "t-bug", label: "Something looks wrong on this page", icon: "Bug", weight: 10,
          text: `On ${route}, ` },
        { id: "t-repro", label: "Describe what you expected", icon: "Flag", weight: 9,
          text: `I expected … but instead … ` },
      ];
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
