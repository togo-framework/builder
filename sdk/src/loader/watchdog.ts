// The dead-man's switch.
//
// This is the most important file in the shell, and it exists because of one
// asymmetry: the shell renders in a full-viewport iframe over somebody else's
// product, and while a window is being dragged that frame must capture ALL
// pointer events — including the ones outside its clip region, or a fast drag
// outruns the rAF and the gesture drops.
//
// So there is a state in which the customer's page is completely uninteractive,
// and the only thing that ends it is a message from a DIFFERENT document.
//
// Every way that message can fail to arrive is a permanently and INVISIBLY
// broken customer site: a throw in the shell's pointerup handler, the iframe
// discarded under memory pressure, rAF halted in a backgrounded tab, a native
// context menu or alt-tab eating the pointerup, any post-boot React error.
// None of those look like a bug in a feedback widget. They look like the
// customer's own site is broken.
//
// Therefore the HOST owns the escape, not the shell. The shell is never trusted
// to end a state the host cannot exit on its own. Concretely:
//
//   - the shell heartbeats every 500 ms REGARDLESS of state
//   - 1500 ms without a heartbeat releases capture
//   - capture-everything can never outlive 1500 ms without a live,
//     loader-observed pointerdown
//   - Escape, pointerup, pointercancel, blur and visibilitychange all release
//     immediately, bound on the HOST in the capture phase
//   - 4000 ms without a heartbeat tears the frame down to pointer-events:none
//   - three releases in one session gives up on `os` mode entirely and falls
//     back to the panel, which is the shipped, tested, already-correct path
//
// The failure mode this accepts is a dropped drag. The failure mode it refuses
// is an inert customer page. Those are not close.

export interface WatchdogOptions {
  /** Release capture and restore the last known clip region. */
  onRelease: (reason: string) => void;
  /** Tear the frame down to pointer-events:none. */
  onTeardown: (reason: string) => void;
  /** Give up on the windowed shell for this session. */
  onFallback: (reason: string) => void;
}

/** Milliseconds without a heartbeat before capture is released. */
const RELEASE_AFTER = 1500;
/** Milliseconds without a heartbeat before the frame is torn down. */
const TEARDOWN_AFTER = 4000;
/** Releases in one session before `os` mode is abandoned. */
const MAX_RELEASES = 3;
/** Hard cap on capture-everything, even with heartbeats arriving. */
const MAX_CAPTURE = 1500;

export class Watchdog {
  private lastBeat = Date.now();
  private capturingSince: number | null = null;
  private releases = 0;
  private timer: number | null = null;
  private dead = false;
  private readonly bound: Array<[EventTarget, string, EventListener, boolean]> = [];

  constructor(private readonly opts: WatchdogOptions) {}

  start(): void {
    this.lastBeat = Date.now();

    // Capture phase, on the host's own document. If the shell has stopped
    // answering, a bubbling listener would never see these — the frame is over
    // everything.
    const release = (reason: string) => () => {
      if (this.capturingSince !== null) this.release(reason);
    };
    this.on(window, "pointerup", release("pointerup"));
    this.on(window, "pointercancel", release("pointercancel"));
    this.on(window, "blur", release("blur"));
    this.on(document, "visibilitychange", () => {
      if (document.hidden) this.release("tab hidden");
    });
    this.on(window, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") this.release("escape");
    });

    // setInterval rather than rAF: rAF is throttled or halted in a backgrounded
    // tab, which is exactly one of the conditions this has to survive.
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  /** The shell is alive. */
  beat(): void {
    this.lastBeat = Date.now();
  }

  /** The shell asked to capture everything (a drag or resize began). */
  captureAll(): void {
    if (this.dead) return;
    this.capturingSince = Date.now();
  }

  /** The shell released capture normally. */
  captureEnded(): void {
    this.capturingSince = null;
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const [t, type, fn, capture] of this.bound) t.removeEventListener(type, fn, capture);
    this.bound.length = 0;
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn, true);
    this.bound.push([target, type, fn, true]);
  }

  private release(reason: string): void {
    if (this.capturingSince === null) return;
    this.capturingSince = null;
    this.releases += 1;
    this.opts.onRelease(reason);
    if (this.releases >= MAX_RELEASES) {
      this.dead = true;
      this.stop();
      // Not a retry. Three releases in one session means the shell is not
      // holding up its end, and the panel is shipped, tested and correct.
      this.opts.onFallback(`released ${this.releases} times`);
    }
  }

  private tick(): void {
    if (this.dead) return;
    const silent = Date.now() - this.lastBeat;

    // A capture that has outlived its cap is released even if heartbeats are
    // still arriving: a shell that is alive but stuck in a drag is the same
    // problem for the customer as one that is dead.
    if (this.capturingSince !== null && Date.now() - this.capturingSince > MAX_CAPTURE) {
      this.release("capture exceeded its cap");
      return;
    }
    if (silent > TEARDOWN_AFTER) {
      this.dead = true;
      this.stop();
      this.opts.onTeardown(`no heartbeat for ${silent}ms`);
      return;
    }
    if (silent > RELEASE_AFTER && this.capturingSince !== null) {
      this.release(`no heartbeat for ${silent}ms`);
    }
  }
}
