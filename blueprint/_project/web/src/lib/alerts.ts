// Realtime agent alerts: SSE stream + an audible cue for decisions.
//
// The audio here is the interesting part. Browsers refuse to play sound until
// the user has interacted with the page — an autoplay attempt before that is
// silently rejected, so a naive implementation "works" in development (where you
// clicked something first) and is silent in production for the one alert that
// actually matters.
//
// So: an AudioContext is created lazily, unlocked on the first real user
// gesture, and any alert that arrives before then is remembered and played the
// moment the user next clicks. Silence is never mistaken for "nothing happened".

export interface AgentEvent {
  id: string;
  kind: string;
  severity: "info" | "warn" | "action_required";
  title: string;
  preview: string;
  link: string;
  sound: string;
  urgency: string;
  issueId?: string;
  at: string;
}

let ctx: AudioContext | null = null;
let unlocked = false;
let pending = 0;
const listeners = new Set<(e: AgentEvent) => void>();
let unlockListeners = new Set<(u: boolean) => void>();

/** True once the browser will actually let us make a sound. */
export const audioUnlocked = () => unlocked;

export function onUnlockChange(fn: (u: boolean) => void): () => void {
  unlockListeners.add(fn);
  return () => unlockListeners.delete(fn);
}

/**
 * Arm the audio path. Must be called from inside a real user gesture handler —
 * calling it on mount does nothing, which is the trap.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    void ctx.resume();
    // A zero-gain blip: the context only truly unlocks once it has actually
    // rendered something inside the gesture.
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
    unlocked = true;
    unlockListeners.forEach((f) => f(true));
    // Anything that arrived while we were muted gets one catch-up chime, so the
    // user learns something happened rather than finding it later.
    if (pending > 0) {
      pending = 0;
      void chime("alert-blocked");
    }
  } catch {
    /* no audio device, or a policy we cannot satisfy — stay silent, never throw */
  }
}

/**
 * Synthesized rather than a bundled file: no asset to 404, no CDN, and it works
 * offline. Two descending tones read as "attention" without being a klaxon.
 */
export async function chime(kind: string): Promise<void> {
  if (!unlocked || !ctx) {
    pending++;
    return;
  }
  if (ctx.state === "suspended") await ctx.resume();

  const tones = kind === "alert-blocked" ? [880, 660] : [660];
  const vol = readVolume();
  tones.forEach((freq, i) => {
    const t0 = ctx!.currentTime + i * 0.18;
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    // Ramps, not steps: an abrupt gain change clicks audibly.
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    o.connect(g).connect(ctx!.destination);
    o.start(t0);
    o.stop(t0 + 0.18);
  });
}

function readVolume(): number {
  const raw = localStorage.getItem("builder.alert.volume");
  const v = raw ? Number(raw) : 0.25;
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0.25;
}

export function setVolume(v: number): void {
  localStorage.setItem("builder.alert.volume", String(Math.min(Math.max(v, 0), 1)));
}

export function onAgentEvent(fn: (e: AgentEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let source: EventSource | null = null;

// Connection state, published so the UI can show it honestly.
//
// The app layout used to open its OWN EventSource just to drive a "Realtime
// connected" badge — at `${API}/events`, which is not the endpoint (it is
// /api/builder/notify/events). That request never completes, so the badge read
// "Offline" permanently while the real stream below was connected and
// delivering events. A second connection for a status light was wrong even with
// the right URL: the badge must reflect the stream that actually carries the
// alerts, not a proxy for it.
let liveNow = false;
const liveListeners = new Set<(v: boolean) => void>();

export const isLive = () => liveNow;

export function onLiveChange(fn: (v: boolean) => void): () => void {
  liveListeners.add(fn);
  fn(liveNow); // report current state immediately, not on the next change
  return () => liveListeners.delete(fn);
}

function setLiveState(v: boolean): void {
  if (liveNow === v) return;
  liveNow = v;
  liveListeners.forEach((f) => f(v));
}

/** Connect the SSE stream. EventSource reconnects on its own. */
export function connectAlerts(apiBase = ""): () => void {
  if (source) return () => {};
  source = new EventSource(`${apiBase}/api/builder/notify/events`, { withCredentials: true });

  const handle = (ev: MessageEvent) => {
    let data: AgentEvent;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    listeners.forEach((f) => f(data));
    if (data.sound) void chime(data.sound);
    // The OS notification is best-effort and separate from the sound: a user
    // may have granted one and not the other.
    if (data.severity === "action_required" && "Notification" in window
        && Notification.permission === "granted") {
      new Notification(data.title, { body: data.preview, tag: data.id });
    }
  };

  for (const kind of ["decision_opened", "run_finished", "issue_moved", "mention", "message"]) {
    source.addEventListener(kind, handle as EventListener);
  }
  source.onopen = () => setLiveState(true);
  source.onerror = () => {
    // EventSource retries by itself; logging every blip would be noise. The
    // badge does need to know, though — a silent reconnect loop looks identical
    // to a working connection from the outside.
    setLiveState(false);
  };
  // The server's first frame is `event: ready`. onopen alone can fire before
  // the server has accepted the subscription, so this confirms it end to end.
  source.addEventListener("ready", () => setLiveState(true));

  // The first gesture anywhere on the page arms audio. `once` per event type so
  // these unbind themselves.
  const arm = () => unlockAudio();
  for (const ev of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(ev, arm, { once: true, passive: true });
  }

  return () => {
    source?.close();
    source = null;
  };
}

export interface Decision {
  id: string;
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  agentSlug: string;
  kind: string;
  question: string;
  context: string;
  urgency: string;
  askedAt: string;
}

const base = "/api/builder/notify";

export const fetchDecisions = () =>
  fetch(`${base}/decisions`, { credentials: "include" })
    .then((r) => r.json())
    .then((d) => (d.decisions ?? []) as Decision[]);

export const answerDecision = (id: string, answer: string, state = "answered") =>
  fetch(`${base}/decisions/${id}/answer`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, state }),
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as any).error || `failed (${r.status})`);
    return d;
  });
