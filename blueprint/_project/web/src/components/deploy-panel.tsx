import { useEffect, useState } from "react";
import { Check, GitMerge, Loader2, TriangleAlert } from "lucide-react";
import { Callout, MarkdownRenderer, StatusBadge } from "@togo-framework/ui";
import { previewDeploy, runDeploy, type DeployPreview, type DeployResult } from "../lib/deploy";

/**
 * The operator's merge gate.
 *
 * Shows three things together, because deciding needs all three: what the agent
 * SAYS it did, what the diff ACTUALLY changed, and one button. Keeping the
 * account next to the evidence is the point — the agent's summary is a claim,
 * and the file list is derived from git.
 */
export const DeployPanel = ({ number, onDeployed }: { number: number; onDeployed?: () => void }) => {
  const [p, setP] = useState<DeployPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    previewDeploy(number)
      .then((d) => live && setP(d))
      .catch((e) => live && setErr(String((e as Error).message)));
    return () => {
      live = false;
    };
  }, [number]);

  if (err) {
    return <Callout kind="warn" title="Could not read the branch">{err}</Callout>;
  }
  if (!p) return null;

  // Nothing to deploy is the common case — most issues are not in review — and
  // a panel that shouts about it on every issue would be noise.
  if (!p.deployable && !result) {
    if (p.merged) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Check className="size-4 text-success" />
          Already merged into the working tree.
        </div>
      );
    }
    return null;
  }

  async function deploy() {
    setBusy(true);
    setResult(null);
    const r = await runDeploy(number);
    setResult(r);
    setBusy(false);
    if (r.ok) onDeployed?.();
  }

  return (
    <section className="rounded-lg border border-success/30 bg-success/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge className="size-4 text-success" />
        <h2 className="text-sm font-semibold">Ready to deploy</h2>
        <StatusBadge tone="neutral">{p.branch}</StatusBadge>
        {p.agent && <StatusBadge tone="info">{p.agent}</StatusBadge>}
        <span className="ms-auto font-mono text-[11px] text-muted-foreground">
          {p.files.length} file{p.files.length === 1 ? "" : "s"} · +{p.added}/−{p.removed}
        </span>
      </div>

      {/* What the agent says it did. */}
      {p.lastComment && (
        <div className="mt-3 rounded-md border border-border bg-background/60 p-3 text-sm">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            What the agent says it did
          </p>
          <MarkdownRenderer content={p.lastComment} />
        </div>
      )}

      {/* What git says it changed. */}
      {p.files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-0.5">
          {p.files.map((f) => (
            <li key={f} className="font-mono text-[11px] text-muted-foreground">
              {f}
            </li>
          ))}
        </ul>
      )}

      {p.diff && (
        <div className="mt-2">
          <button
            onClick={() => setShowDiff((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showDiff ? "Hide the diff" : "Read the diff"}
          </button>
          {showDiff && (
            <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed">
              {p.diff}
            </pre>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void deploy()}
          disabled={busy}
          // The section's border and icon already carry the success identity;
          // the button itself is the page's primary action, so it wears the
          // primary token — a hardcoded emerald ignored the theme presets and
          // white-on-light-green failed contrast in dark mode.
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <GitMerge className="size-4" />}
          {busy ? "Deploying…" : "Deploy"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Merges into the working tree. Frontend changes appear immediately; Go changes
          rebuild on the watcher's next pass.
        </span>
      </div>

      {result && (
        <div className="mt-3">
          {result.ok ? (
            <Callout kind="info" title="Deployed">
              {result.message}
              {result.mergeSha && (
                <span className="ms-1 font-mono text-xs">({result.mergeSha.slice(0, 8)})</span>
              )}
            </Callout>
          ) : (
            <Callout kind="warn" title={`Stopped at: ${result.step}`}>
              {result.message}
              {result.output && (
                // The tail of the output, because a failing build puts the reason
                // in the last lines.
                <pre className="mt-2 max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px]">
                  {result.output}
                </pre>
              )}
            </Callout>
          )}
        </div>
      )}

      {!result && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          Nothing is pushed to a remote. This merges locally only.
        </p>
      )}
    </section>
  );
};
DeployPanel.displayName = "DeployPanel";
