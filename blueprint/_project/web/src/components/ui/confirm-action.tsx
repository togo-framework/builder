import { useEffect, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Input,
  cn,
  useT,
} from "@togo-framework/ui";
import { LoaderCircle } from "lucide-react";
import { TokenCost } from "./token-cost";

/**
 * confirm-action — the human in the loop.
 *
 * The agents in this product delete knowledge, revoke credentials, push
 * branches and spend money without being asked twice. The moment the operator
 * IS asked is therefore the most important surface in the app, and right now
 * the app asks in three different ways: `window.confirm()` on the library and
 * the sources page, a hand-built AlertDialog on the issue and skill pages, and
 * nothing at all in a few places.
 *
 * `window.confirm()` is the one that has to go. It is unstyled, untranslatable,
 * unthemed, blocks the main thread, cannot show a cost, cannot be dismissed by
 * anything but its own two buttons, and it renders in the browser's language
 * rather than the app's — an Arabic operator gets an English "OK / Cancel" from
 * the operating system. A tool that spends money must not ask permission in a
 * dialog it does not own.
 *
 * What this shape asks, in order:
 *
 *   1. What is about to happen           (title)
 *   2. Why it cannot be undone           (description)
 *   3. Exactly what will change          (consequences — the checkable list)
 *   4. What it will cost                 (costUsd, when a model call is involved)
 *   5. Proof the operator meant it       (requireTyping, for the irreversible)
 *
 * Steps 3–5 are what make it an approval rather than a speed bump. A dialog
 * whose only content is "Are you sure?" trains the operator to press the
 * primary button without reading, which is worse than no dialog at all.
 */

const ConfirmAction = ({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  consequences,
  costUsd,
  tone = "danger",
  confirmLabel,
  cancelLabel,
  requireTyping,
  requireTypingHint,
  busy = false,
  onConfirm,
  className,
}: {
  /** Uncontrolled use: the element that opens the dialog. */
  trigger?: ReactNode;
  /** Controlled use: pass both. Omit `trigger` when controlling. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-resolved question ("Delete the Postgres source?"). */
  title: string;
  /** Pre-resolved consequence sentence. Say what is lost, not "this cannot be undone". */
  description?: ReactNode;
  /** The checkable list of what will change. Pre-resolved strings. */
  consequences?: ReactNode[];
  /** Shown when confirming spends money. */
  costUsd?: number;
  tone?: "danger" | "primary";
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Require the operator to type this exact string before the primary enables.
   * Reserve it for the irreversible — a vault secret, a brain namespace. Asking
   * for it on a routine delete only teaches people to copy-paste past it.
   */
  requireTyping?: string;
  /** Pre-resolved instruction above the typing field. */
  requireTypingHint?: string;
  /** Keeps the primary in its pending state while the caller's promise settles. */
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) => {
  const { language } = useT();
  const ar = language === "ar";
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const controlled = open !== undefined;
  const isOpen = controlled ? open : undefined;

  // The confirmation phrase must not survive a close. Leaving it typed means
  // the next open starts pre-armed, which defeats the entire point of asking.
  useEffect(() => {
    if (controlled && !open) setTyped("");
  }, [controlled, open]);

  const armed = !requireTyping || typed.trim() === requireTyping.trim();
  const working = busy || pending;

  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped("");
    onOpenChange?.(next);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    // The dialog must stay open while the work runs, or a failure closes the
    // surface that was going to report it. Radix closes on Action click by
    // default; this takes that back.
    e.preventDefault();
    if (!armed || working) return;
    try {
      setPending(true);
      await onConfirm();
      setTyped("");
      handleOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}

      <AlertDialogContent className={cn("max-w-md", className)}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {consequences && consequences.length > 0 && (
          <ul className="flex list-none flex-col gap-1.5 rounded-card border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {consequences.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                {/* A bullet, not an icon: five warning triangles in a row is
                    alarm fatigue, and the heading already carries the alarm. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-1 shrink-0 rounded-full",
                    tone === "danger" ? "bg-destructive" : "bg-primary",
                  )}
                />
                <span className="min-w-0">{c}</span>
              </li>
            ))}
          </ul>
        )}

        {costUsd !== undefined && costUsd > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-card border border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {ar ? "التكلفة المتوقعة" : "Estimated cost"}
            </span>
            <TokenCost usd={costUsd} tone="default" />
          </div>
        )}

        {requireTyping && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-typing" className="text-xs text-muted-foreground">
              {requireTypingHint ?? (
                <>
                  {ar ? "اكتب " : "Type "}
                  {/* The phrase is a machine string quoted inside a sentence.
                      Without the isolate the bidi algorithm reorders its
                      punctuation in Arabic and the operator is asked to type
                      something that is not what is shown. */}
                  <bdi dir="ltr" className="font-mono">
                    {requireTyping}
                  </bdi>
                  {ar ? " للتأكيد" : " to confirm"}
                </>
              )}
            </label>
            <Input
              id="confirm-typing"
              dir="ltr"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-9 font-mono text-sm"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>
            {cancelLabel ?? (ar ? "إلغاء" : "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!armed || working}
            className={cn(
              "motion-press",
              tone === "danger" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {working && (
              <LoaderCircle
                aria-hidden="true"
                className="me-1.5 size-3.5 animate-spin motion-reduce:animate-none"
              />
            )}
            {confirmLabel ?? (ar ? "تأكيد" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
ConfirmAction.displayName = "ConfirmAction";

export { ConfirmAction };
