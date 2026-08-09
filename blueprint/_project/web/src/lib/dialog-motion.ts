import type { CSSProperties } from "react";

/**
 * Fade a centred dialog in, and move it not at all.
 *
 * The kit's DialogContent enters with `zoom-in-95` AND
 * `slide-in-from-top-[48%]` on top of the fade, so a dialog does not appear —
 * it lurches up from below the centre of the screen while growing. On a form
 * you open repeatedly that reads as the app stuttering rather than as motion.
 *
 * Zero is the right value here, and it is worth saying why, because the
 * plausible-looking alternative is wrong. The dialog is centred with
 * `left/top: 50%` and a `-50% -50%` offset — but that offset lives on the
 * `translate` PROPERTY (Tailwind v4), not inside `transform`. The two compose
 * independently, so the enter keyframe's `transform` is pure animation on top
 * of a centring that never stops applying. Zeroing it means the element is
 * exactly where it rests for every frame.
 *
 * Verified by sampling `getBoundingClientRect()` across the animation rather
 * than by watching it: the box must not move by a single pixel, and only
 * opacity may change.
 *
 * Set inline rather than by class because `zoom-in-100` and `zoom-in-95` are
 * both real utilities and which one wins depends on their order in the
 * compiled stylesheet, not in the class attribute. An inline style beats both.
 */
export const FADE_ONLY: CSSProperties = {
  ["--tw-enter-scale" as string]: "1",
  ["--tw-enter-translate-x" as string]: "0",
  ["--tw-enter-translate-y" as string]: "0",
  // Exit too, so closing does not zoom out of a dialog that never zoomed in.
  ["--tw-exit-scale" as string]: "1",
  ["--tw-exit-translate-x" as string]: "0",
  ["--tw-exit-translate-y" as string]: "0",
};
