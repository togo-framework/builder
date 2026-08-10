// Client for the setup wizard. The wizard runs before the dashboard is usable.
import { API } from "./api";

export type Step = "welcome" | "preflight" | "plan" | "fleet" | "done";

export interface Check {
  id: number;
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skip";
  detail?: string;
  remedy?: string;
  required: boolean;
}

export interface PreflightReport {
  checks: Check[];
  checked_at: string;
}

export interface AgentSummary {
  slug: string;
  displayName: string;
  description: string;
  role: string;
  model: string;
  enabled: boolean;
  brainNamespace: string;
  memories: number;
}

export interface GenProgress {
  running: boolean;
  done: boolean;
  error?: string;
  summary?: string;
  agents: number;
  skills: number;
  costUsd: number;
  /** Which phase: "roster" | "persona" | "skill" | "write" | "issues-plan" | "issue" | "finished". */
  stage?: string;
  step: number;
  total: number;
  /** How many plan-derived issues landed on the board (opt-in pass). */
  issues: number;
  /** Set when the issue cap bit — the board holds a subset of the plan. */
  issuesNote?: string;
}

export interface SetupState {
  step: Step;
  completed: boolean;
  planMd: string;
  fleetName: string;
  agents: AgentSummary[] | null;
  preflight?: PreflightReport;
  progress: GenProgress;
}

const base = `${API}/api/builder/setup`;

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  // 424 is expected from preflight when the environment is not ready — the body
  // is the report, not an error, so it must not be thrown away.
  if (!res.ok && res.status !== 424) {
    throw new Error((data as any).error || `request failed (${res.status})`);
  }
  return data as T;
}

export const fetchSetup = () =>
  fetch(`${base}/state`, { credentials: "include" }).then(json<SetupState>);

export const runPreflight = () =>
  fetch(`${base}/preflight`, { method: "POST", credentials: "include" })
    .then(json<{ report: PreflightReport; ok: boolean; step: Step }>);

export const savePlan = (plan: string) =>
  fetch(`${base}/plan`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  }).then(json<{ step: Step }>);

/**
 * Start generation, or attach to a run already in flight.
 *
 * A 409 means the server refused a duplicate — which is the guard working, not
 * a failure. The caller asked for generation and generation is happening, so
 * this resolves rather than throwing; surfacing it as an error made a healthy
 * run look broken.
 */
export const startGenerate = async (
  fleet: string,
  // Opt-in and off by default: one model call per issue, and it seeds a board
  // agents can later spend on. The caller passes the checkbox, never a default.
  issues: boolean,
): Promise<{ started: boolean; alreadyRunning: boolean }> => {
  const res = await fetch(
    `${base}/generate?fleet=${encodeURIComponent(fleet)}${issues ? "&issues=1" : ""}`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  if (res.status === 409) return { started: true, alreadyRunning: true };
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as any).error || `request failed (${res.status})`);
  return { started: true, alreadyRunning: false };
};

export const genStatus = () =>
  fetch(`${base}/generate/status`, { credentials: "include" }).then(json<GenProgress>);

export const completeSetup = () =>
  fetch(`${base}/complete`, { method: "POST", credentials: "include" })
    .then(json<{ completed: boolean }>);

export const resetSetup = () =>
  fetch(`${base}/reset`, { method: "POST", credentials: "include" }).then(json<{ reset: boolean }>);

// Once setup is complete it stays complete, so the answer is remembered.
// Resetting setup does a full page load, which clears this.
let _setupDone = false;

/**
 * Cheap check for the route guard.
 *
 * "Cheap" has to be true, because this runs in beforeLoad on EVERY in-app
 * navigation. It previously re-fetched /setup/state each time with no cache and
 * no timeout, which made every click depend on a live round trip: restart the
 * API at the wrong moment and fetch hangs (it has no default timeout), the
 * router sits on its pending component, and the app shows a loading spinner
 * forever with no error and no recovery.
 *
 * So: remember the completed answer, and bound the request. Fails open — a
 * setup endpoint that is down must not lock an operator out of a working
 * dashboard, and must never hang the navigation either.
 */
export async function isSetupComplete(): Promise<boolean> {
  if (_setupDone) return true;
  try {
    const res = await fetch(`${base}/state`, {
      credentials: "include",
      // Bounded so a hung or half-started API costs one second, not the session.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return true; // fail open
    const s = (await res.json()) as SetupState;
    if (s.completed) {
      _setupDone = true;
      return true;
    }
    // A generation in flight — or one that reached a terminal state in this
    // server's lifetime — also opens the gate. Generation is detached and
    // per-item durable on the server; the operator's part of the wizard is
    // over the moment it starts, and the app shell's FleetProgressBar carries
    // the run (and its spend, and its failure/resume) from here. Bouncing back
    // to the wizard would re-block exactly what the background run unblocks.
    // Not cached: only the server's completed_at is durable.
    return Boolean(s.progress?.running || s.progress?.done);
  } catch {
    return true;
  }
}
