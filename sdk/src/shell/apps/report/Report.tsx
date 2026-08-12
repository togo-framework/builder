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

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppHost } from "../../../app/contract";
import { Icon } from "../../../../vendor/ui-desktop-embed/icons";
import { buildStarters, type CaptureContext, type Mode } from "./starters";

type Attachment = { id: string; kind: string; label: string; removable: boolean };

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
}

export function Report({ host, context, attachments, onRemoveAttachment, onSubmit }: ReportProps) {
  const ar = host.dir === "rtl";
  const L = <T,>(en: T, arabic: T): T => (ar ? arabic : en);

  const [mode, setMode] = useState<Mode>("bug");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);

  const starters = useMemo(() => buildStarters(context, mode), [context, mode]);

  // Switching mode changes the PLACEHOLDER, never the text. Pre-filling real
  // content the user then has to delete is worse than an empty box — it makes
  // the first action a deletion.
  useEffect(() => {
    box.current?.focus();
  }, [mode]);

  const canEnhance = text.trim().length >= MIN_FOR_ENHANCE;
  const canSend = text.trim().length > 0 && !sending;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-5" dir={host.dir}>
      {/* MODE CHIPS — action-first entry. Clicking "Bug" is easier than
          composing from nothing, which is the pattern's whole point. */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={L("Type", "النوع")}>
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m.id)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2",
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
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          placeholder={L(PLACEHOLDER[mode].en, PLACEHOLDER[mode].ar)}
          rows={4}
          aria-label={L("What happened?", "ماذا حدث؟")}
          className={[
            "w-full resize-y rounded-[10px] border border-[color:var(--fos-border)] bg-[color:var(--fos-bg)]",
            "px-3 py-2.5 text-sm outline-none transition-colors",
            "focus-visible:border-[color:var(--fos-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]/30",
          ].join(" ")}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!canEnhance}
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
            {L("Improve this", "تحسين الصياغة")}
          </button>
          {/* bdi: a Latin counter inside Arabic prose reorders to "4000/12"
              without it. This project shipped four bugs of exactly this shape. */}
          <span className="text-[11px] text-[color:var(--fos-muted)]">
            <bdi>{text.length} / {MAX}</bdi>
          </span>
        </div>
      </div>

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
                <Icon name={iconFor(a.kind)} size={12} className="text-[color:var(--fos-muted)]" />
                <span className="max-w-[18ch] truncate">{a.label}</span>
                {a.removable && (
                  <button
                    type="button"
                    aria-label={L(`Remove ${a.label}`, `إزالة ${a.label}`)}
                    onClick={() => {
                      onRemoveAttachment(a.id);
                      setDropped((d) => [...d, a.id]);
                    }}
                    className="grid size-4 place-items-center rounded text-[color:var(--fos-muted)] hover:text-[color:var(--fos-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
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
      {starters.length > 0 && !text.trim() && (
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
                onClick={() => {
                  setText(s.text);
                  box.current?.focus();
                }}
                className="flex items-start gap-2 rounded-[10px] border border-[color:var(--fos-border)] bg-[color:var(--fos-surface)] p-2.5 text-start text-xs transition-colors hover:border-[color:var(--fos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
              >
                <Icon name={s.icon} size={13} className="mt-0.5 shrink-0 text-[color:var(--fos-muted)]" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-[color:var(--fos-border)] pt-3">
        <button
          type="button"
          disabled={!canSend}
          onClick={async () => {
            setSending(true);
            try {
              await onSubmit({ mode, text: text.trim(), dropped });
            } finally {
              setSending(false);
            }
          }}
          className={[
            "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2",
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
