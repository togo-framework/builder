// The issue composer — the Initial CTA pattern, applied.
//
// The old sideover was a bare textarea in a 440px modal with uppercase form
// labels. The pattern's claim is that the input box is the SMALL part: most
// people cannot prompt well, "a short prompt rarely captures the nuance of
// their intent", and so the scaffolding around the input has to carry the
// weight — mode chips, auto-attached context, starters derived from evidence,
// and an opt-in enhancer.
//
// Two rules govern everything here:
//
//   1. FILING MUST WORK WITH NO MODEL CALL AND NO AUTHENTICATION. The enhancer
//      is one button, pressed deliberately. A widget whose Send depends on an
//      AI endpoint is a widget that stops collecting feedback when that
//      endpoint is slow, and nobody finds out.
//   2. THE ENHANCER PROPOSES BESIDE, NEVER OVER. The user's own words stay
//      visible, selected and editable the whole time. Rewriting somebody's
//      sentence in place is how you teach them not to trust the box.

import { useMemo, useRef, useState } from "react";
import type { AppHost } from "../../../app/contract";
import { Icon } from "../../../../vendor/ui-desktop-embed/icons";
import { buildStarters, type CaptureContext, type Mode } from "./starters";

/** A chip in the context tray. Deliberately NOT the panel's `Attachment` from
 *  src/types.ts: that one models an uploaded FILE (name, mime, size, blob),
 *  while this models a labelled piece of evidence, some of which — a route, a
 *  pin — has no bytes at all. */
export type ReportAttachment = {
  id: string;
  kind: string;
  label: string;
  removable: boolean;
  /** Present for a screenshot: the bytes to upload on send. */
  blob?: Blob;
  /** Present for a pin: how to find the element again. */
  anchor?: unknown;
};
type Attachment = ReportAttachment;

const MODES: { id: Mode; en: string; ar: string; icon: string }[] = [
  { id: "bug", en: "Bug", ar: "علة", icon: "WarningTriangle" },
  { id: "idea", en: "Idea", ar: "فكرة", icon: "Lightbulb" },
  { id: "question", en: "Question", ar: "سؤال", icon: "HelpCircle" },
  { id: "chore", en: "Chore", ar: "مهمة", icon: "Wrench" },
];

const PLACEHOLDER: Record<Mode, { en: string; ar: string }> = {
  bug: { en: "The Pay now button doesn't respond when clicked…", ar: "زر «الدفع الآن» لا يستجيب عند الضغط…" },
  idea: { en: "It would help if this page could…", ar: "سيكون مفيداً لو أمكن لهذه الصفحة…" },
  question: { en: "I'm not sure how this is supposed to…", ar: "لست متأكداً كيف يُفترض أن…" },
  chore: { en: "This could be tidied up by…", ar: "يمكن ترتيب هذا عبر…" },
};

const MIN_FOR_ENHANCE = 12;
const MAX = 4000;

export interface ReportProps {
  host: AppHost;
  context: CaptureContext;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  onSubmit: (payload: { mode: Mode; text: string; dropped: string[] }) => Promise<void>;
  /**
   * Ask the HOST page for evidence.
   *
   * Optional so the composer still renders in a context that cannot capture —
   * a story, a test, an app embedded somewhere with no loader underneath. The
   * buttons are simply absent there rather than present and broken.
   */
  onCapture?: (kind: "screenshot" | "region" | "pin") => void | Promise<void>;
  /**
   * Rewrite the reporter's text into a clearer report.
   *
   * Optional, and the control is ABSENT when it is not supplied. It shipped as
   * a button with no onClick — pressing it did nothing, gave no feedback, and
   * looked identical to a button that had failed. A control that does nothing
   * teaches people that the surface is broken, which costs more than the
   * feature was worth.
   */
  onEnhance?: (text: string) => Promise<string>;
  /** Which capture is in flight, if any. */
  capturing?: "screenshot" | "region" | "pin" | null;
  /** Why the last capture failed, if it did. */
  captureError?: string | null;
}

export function Report({ host, context, attachments, onRemoveAttachment, onSubmit, onCapture, capturing, captureError, onEnhance }: ReportProps) {
  const ar = host.dir === "rtl";
  const L = <T,>(en: T, arabic: T): T => (ar ? arabic : en);

  const [mode, setMode] = useState<Mode>("bug");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; why?: string } | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const starters = useMemo(() => buildStarters(context, mode, host.locale), [context, mode, host.locale]);

  // Switching mode changes the PLACEHOLDER, never the text. Pre-filling real
  // content the user then has to delete is worse than an empty box — it makes
  // the first action a deletion.
  //
  // Focus is NOT moved to the box here any more. It was, on every mode change,
  // which meant a keyboard user who arrowed onto "Idea" was immediately thrown
  // out of the radiogroup and could not reach "Question" without tabbing back.
  // A pointer user is already heading for the box; a keyboard user is not.

  /** Arrow-key navigation, as a radiogroup requires. */
  const onModeKey = (e: React.KeyboardEvent, i: number) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!next) return;
    e.preventDefault();
    // Mirrored in RTL: ArrowRight moves toward the START of the list when the
    // list itself reads right-to-left, or the arrows fight the layout.
    const dir = host.dir === "rtl" ? -next : next;
    const to = (i + dir + MODES.length) % MODES.length;
    setMode(MODES[to].id);
    modeRefs.current[to]?.focus();
  };
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const canEnhance = text.trim().length >= MIN_FOR_ENHANCE;
  const [enhancing, setEnhancing] = useState(false);
  const canSend = text.trim().length > 0 && !sending;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-5" dir={host.dir}>
      {/* MODE CHIPS — action-first entry. Clicking "Bug" is easier than
          composing from nothing, which is the pattern's whole point. */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={L("Type", "النوع")}>
        {MODES.map((m, i) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              // One tab stop for the whole group, which is what a radiogroup
              // is: Tab enters it, arrows move within it, Tab leaves it.
              tabIndex={on ? 0 : -1}
              ref={(el) => {
                modeRefs.current[i] = el;
              }}
              onKeyDown={(e) => onModeKey(e, i)}
              onClick={() => setMode(m.id)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--fos-bg)]",
                on
                  ? "border-[color:var(--fos-accent)] bg-[color:var(--fos-accent-soft)] text-[color:var(--fos-accent-ink)]"
                  : "border-[color:var(--fos-border)] text-[color:var(--fos-text-2)] hover:bg-[color:var(--fos-surface-2)]",
              ].join(" ")}
            >
              <Icon name={m.icon} size={14} />
              {L(m.en, m.ar)}
            </button>
          );
        })}
      </div>

      {/* PROMPT SHELL */}
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            // Say so when the limit bites. Pasting a 6,000-character stack
            // trace silently lost 2,000 of it, and the counter reading
            // "4000 / 4000" is not a message — it looks like a coincidence.
            setTruncated(v.length > MAX);
            setText(v.slice(0, MAX));
          }}
          placeholder={L(PLACEHOLDER[mode].en, PLACEHOLDER[mode].ar)}
          rows={4}
          aria-label={L("What happened?", "ماذا حدث؟")}
          className={[
            "w-full resize-y rounded-md border border-[color:var(--fos-border)] bg-[color:var(--fos-bg)]",
            "px-3 py-2.5 text-sm outline-none transition-colors",
            "focus-visible:border-[color:var(--fos-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]/30",
          ].join(" ")}
        />
        <div className="flex items-center justify-between gap-3">
          {/* Absent, not dead. Rendered only when a handler exists — the button
              shipped with no onClick at all, so it looked enabled, did nothing,
              and gave no reason. */}
          {onEnhance ? (
          <button
            type="button"
            disabled={!canEnhance || enhancing}
            onClick={async () => {
              setEnhancing(true);
              try {
                const better = await onEnhance(text.trim());
                if (better) setText(better);
              } catch {
                // A rewrite that fails must leave the reporter's own words
                // exactly as they were. Silence is the right outcome here:
                // nothing was lost and nothing was promised.
              } finally {
                setEnhancing(false);
              }
            }}
            title={
              canEnhance
                ? L("Propose a clearer version", "اقترح صياغة أوضح")
                : L("Write a little more first", "اكتب أكثر قليلاً أولاً")
            }
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]",
              canEnhance
                ? "text-[color:var(--fos-accent-ink)] hover:bg-[color:var(--fos-accent-soft)]"
                : "cursor-not-allowed text-[color:var(--fos-muted)]",
            ].join(" ")}
          >
            <Icon name="Sparkle" size={13} />
            {enhancing ? L("Rewriting…", "جارٍ التحسين…") : L("Improve this", "تحسين الصياغة")}
          </button>
          ) : (
            <span />
          )}
          {/* bdi: a Latin counter inside Arabic prose reorders to "4000/12"
              without it. This project shipped four bugs of exactly this shape. */}
          <span
            className={`text-[11px] ${truncated ? "text-[color:var(--fos-danger)]" : "text-[color:var(--fos-muted)]"}`}
          >
            <bdi>{text.length} / {MAX}</bdi>
            {truncated && <span className="ms-1.5">{L("trimmed to fit", "تم الاقتطاع")}</span>}
          </span>
        </div>
      </div>

      {/* EVIDENCE — the two things a report is worth far more with, and which
          a written description almost never replaces: a picture of the page,
          and WHICH element. Both have to be asked of the host page; see
          requestCapture in boot.tsx for why the composer cannot take them. */}
      {onCapture && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!capturing}
            onClick={() => onCapture("screenshot")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] px-2.5 py-1.5 text-xs font-medium hover:bg-[color:var(--fos-surface-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
          >
            <Icon name="Camera" size={13} />
            {capturing === "screenshot"
              ? L("Capturing…", "جارٍ الالتقاط…")
              : L("Whole page", "الصفحة كاملة")}
          </button>
          {/* The DEFAULT-shaped action. A whole-page shot is usually the
              wrong evidence — the broken control ends up forty pixels tall in
              the middle of a very tall image — so selecting an area is offered
              first and the full page stays available beside it. */}
          <button
            type="button"
            disabled={!!capturing}
            onClick={() => onCapture("region")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] px-2.5 py-1.5 text-xs font-medium hover:bg-[color:var(--fos-surface-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
          >
            <Icon name="Crosshair" size={13} />
            {capturing === "region"
              ? L("Drag to select an area…", "اسحب لتحديد منطقة…")
              : L("Select an area", "تحديد منطقة")}
          </button>
          <button
            type="button"
            disabled={!!capturing}
            onClick={() => onCapture("pin")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] px-2.5 py-1.5 text-xs font-medium hover:bg-[color:var(--fos-surface-2)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
          >
            <Icon name="Pin" size={13} />
            {capturing === "pin"
              ? L("Click an element on the page…", "انقر عنصرًا في الصفحة…")
              : L("Pin an element", "تحديد عنصر")}
          </button>
        </div>
      )}

      {captureError && (
        <p role="status" className="text-xs text-[color:var(--fos-danger)]">
          {L(`Could not capture: ${captureError}`, `تعذّر الالتقاط: ${captureError}`)}
        </p>
      )}

      {/* CONTEXT TRAY — what ships with the report, visible BEFORE sending and
          individually removable. The route is identity, not evidence, so it is
          the one chip that cannot be dropped. */}
      {attachments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-[color:var(--fos-text-2)]">
            {L("Attached to this report", "المرفق مع هذا البلاغ")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] px-2 py-1 text-xs"
              >
                {/* A thumbnail for anything with bytes. Every screenshot chip
                    otherwise read as a near-identical filename, so two captures
                    of different parts of the page were indistinguishable — and
                    the only way to check what was attached was to send it. */}
                {a.blob ? (
                  <img
                    src={previewOf(a)}
                    alt=""
                    className="size-6 shrink-0 rounded border border-[color:var(--fos-border)] object-cover"
                  />
                ) : (
                  <Icon name={iconFor(a.kind)} size={12} className="text-[color:var(--fos-muted)]" />
                )}
                {/* bdi: a Latin filename inside an Arabic tray reorders without it —
                    "screenshot-2026.png" loses its extension to the left edge. */}
                <bdi className="max-w-[18ch] truncate">{a.label}</bdi>
                {a.removable && (
                  <button
                    type="button"
                    aria-label={L(`Remove ${a.label}`, `إزالة ${a.label}`)}
                    onClick={() => {
                      onRemoveAttachment(a.id);
                      setDropped((d) => [...d, a.id]);
                    }}
                    // 16px was below any reasonable target size for a control that
                    // destroys a capture with no undo. 24px is the WCAG 2.5.8
                    // minimum, reached with padding so the chip does not grow.
                    className="-m-1 grid size-6 place-items-center rounded p-1 text-[color:var(--fos-muted)] hover:text-[color:var(--fos-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
                  >
                    <Icon name="X" size={11} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* STARTERS — the forgiving first step, for somebody who cannot summarise
          the bug in words. Rule-derived from the captured context: no model
          call, no latency, and no dependency on the AI being up. */}
      {/* Visible while the box is empty OR still holds an unedited starter.
          It used to vanish the moment one was clicked, so choosing the wrong
          one meant selecting all, deleting, and waiting for the list to come
          back — the scaffolding disappeared exactly when the user discovered
          they had picked badly. Once they start typing it is their text, and
          the list steps out of the way. */}
      {starters.length > 0 && (!text.trim() || starters.some((s) => s.text === text)) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-[color:var(--fos-text-2)]">
            {L("Not sure what to write?", "لا تعرف ماذا تكتب؟")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {starters.map((s) => (
              <button
                key={s.id}
                type="button"
                // Fills an EMPTY box. Never an overwrite — this only renders
                // when nothing has been typed.
                // aria-pressed, because with the list persisting after a
                // click there is now a selected state to convey.
                aria-pressed={text === s.text}
                onClick={() => {
                  setText(s.text);
                  box.current?.focus();
                }}
                className="flex items-start gap-2 rounded-md border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] p-2.5 text-start text-xs transition-colors hover:border-[color:var(--fos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
              >
                <Icon name={s.icon} size={13} className="mt-0.5 shrink-0 text-[color:var(--fos-muted)]" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* The outcome. role=status so a screen reader hears it without the
          focus having to move, which after pressing Send it should not. */}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            result.ok
              ? "border-[color:var(--fos-ok)]/40 bg-[color:var(--fos-ok)]/10 text-[color:var(--fos-ok)]"
              : "border-[color:var(--fos-danger)]/40 bg-[color:var(--fos-danger)]/10 text-[color:var(--fos-danger)]",
          ].join(" ")}
        >
          <Icon name={result.ok ? "Check" : "WarningTriangle"} size={13} className="mt-0.5 shrink-0" />
          <span>
            {result.ok
              ? L("Reported. Thank you.", "تم الإبلاغ. شكرًا لك.")
              : L(`Could not send: ${result.why}`, `تعذّر الإرسال: ${result.why}`)}
          </span>
        </div>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-[color:var(--fos-border)] pt-3">
        <button
          type="button"
          disabled={!canSend}
          onClick={async () => {
            setSending(true);
            setResult(null);
            try {
              await onSubmit({ mode, text: text.trim(), dropped });
              // Clearing the box IS the success signal, but only alongside a
              // stated one: a form that empties itself with no message is
              // indistinguishable from a form that lost your work.
              setResult({ ok: true });
              setText("");
            } catch (err) {
              // The reason, verbatim, and the text left untouched. A failed
              // send that clears the box costs the reporter everything they
              // typed, which is the one outcome worse than the bug they came
              // to report.
              setResult({ ok: false, why: err instanceof Error ? err.message : String(err) });
            } finally {
              setSending(false);
            }
          }}
          className={[
            "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--fos-bg)]",
            canSend
              ? "bg-[color:var(--fos-accent)] text-[color:var(--fos-accent-fg)]"
              : "cursor-not-allowed bg-[color:var(--fos-surface-2)] text-[color:var(--fos-muted)]",
          ].join(" ")}
        >
          <Icon name="Send" size={14} className={ar ? "-scale-x-100" : ""} />
          {sending ? L("Sending…", "جارٍ الإرسال…") : L("Send", "إرسال")}
        </button>
      </div>
    </div>
  );
}

/**
 * A blob: URL for a chip's thumbnail, created once per attachment.
 *
 * Cached on the attachment object rather than in state: an object URL created
 * during render on every pass would leak one per frame, and the tray re-renders
 * on every keystroke in the composer.
 */
const previews = new WeakMap<Blob, string>();
function previewOf(a: ReportAttachment): string {
  const blob = a.blob!;
  let url = previews.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    previews.set(blob, url);
  }
  return url;
}

function iconFor(kind: string): string {
  switch (kind) {
    case "screenshot": return "Image";
    case "pin": return "Pin";
    case "console": return "XCircle";
    case "network": return "Cloud";
    case "route": return "Layers";
    default: return "Paperclip";
  }
}
