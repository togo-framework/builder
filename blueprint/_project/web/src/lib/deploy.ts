// Client for the deploy gate.
//
// The loop stops at `in_review` on purpose — an agent never merges its own work.
// This is the operator's half: read what the agent says it did, look at the real
// diff, and decide.
import { API } from "./api";

export interface DeployPreview {
  number: number;
  status: string;
  branch: string;
  headSha: string;
  agent: string;
  repo: string;
  deployable: boolean;
  merged: boolean;
  reason?: string;
  /** The agent's own account of what it changed. */
  lastComment: string;
  files: string[];
  added: number;
  removed: number;
  diff: string;
}

export interface DeployResult {
  ok: boolean;
  step: "check" | "verify" | "merge" | "done" | string;
  message: string;
  output?: string;
  mergeSha?: string;
  files?: string[];
}

const base = `${API}/api/builder/deploy`;

export const previewDeploy = (n: number | string): Promise<DeployPreview> =>
  fetch(`${base}/issues/${n}/deploy`, { credentials: "include" }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error || `request failed (${r.status})`);
    return d as DeployPreview;
  });

/**
 * Merge the branch.
 *
 * A non-2xx is NOT thrown here: the server answers a refused deploy with a
 * structured reason (verify failed, tree dirty, merge conflicted) and the panel
 * shows it. Throwing would collapse all of those into one useless "failed".
 */
export const runDeploy = async (n: number | string): Promise<DeployResult> => {
  const res = await fetch(`${base}/issues/${n}/deploy`, {
    method: "POST",
    credentials: "include",
  });
  const d = (await res.json().catch(() => ({}))) as Partial<DeployResult>;
  return {
    ok: Boolean(d.ok),
    step: d.step ?? "check",
    message: d.message ?? `deploy failed (${res.status})`,
    output: d.output,
    mergeSha: d.mergeSha,
    files: d.files,
  };
};
