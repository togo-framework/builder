import { useEffect, useState } from "react";
import { PageHeader, StatusBadge, EmptyState, Callout, StatCard } from "@togo-framework/ui";
import {
  deleteSecret, fetchAudit, grantSecret, listSecrets, revealSecret, storeSecret,
  type AuditEntry, type Secret,
} from "../lib/vault";

const OUTCOME_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  ok: "success",
  denied: "danger",
  rate_limited: "warning",
  expired: "warning",
};

export function Vault() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "token", value: "", scope: "project" });
  // Revealed values live in component state only, and are dropped on unmount or
  // when the user hides them. Nothing writes them to storage.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantSlug, setGrantSlug] = useState("");

  const load = async () => {
    try {
      const [s, a] = await Promise.all([listSecrets(), fetchAudit()]);
      setSecrets(s);
      setAudit(a);
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (!form.name.trim() || !form.value) {
      setErr("A name and a value are required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await storeSecret(form);
      // Clear the plaintext out of component state the moment it is stored.
      setForm({ name: "", kind: "token", value: "", scope: "project" });
      setAdding(false);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function reveal(name: string) {
    if (revealed[name]) {
      // Hiding drops the value rather than just toggling a CSS class — a value
      // still in state is still in a heap dump.
      setRevealed((r) => {
        const { [name]: _, ...rest } = r;
        return rest;
      });
      return;
    }
    try {
      const { value } = await revealSecret(name);
      setRevealed((r) => ({ ...r, [name]: value }));
      void load(); // the read count just changed
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function remove(name: string) {
    setBusy(true);
    try {
      await deleteSecret(name);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function grant(name: string) {
    if (!grantSlug.trim()) return;
    try {
      await grantSecret(name, grantSlug.trim(), true);
      setGrantFor(null);
      setGrantSlug("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  const denials = audit.filter((a) => a.Outcome !== "ok").length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Vault"
        description="Credentials agents can read. Every reveal is recorded in the same transaction as the decrypt — a read that cannot be logged does not happen."
        actions={
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {adding ? "Cancel" : "Add a secret"}
          </button>
        }
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Secrets" value={String(secrets.length)} />
        <StatCard label="Reads" value={String(audit.length)} />
        <StatCard label="Refused" value={String(denials)} tone={denials ? "warning" : "muted"} />
      </div>

      {err && (
        <div className="mt-4">
          <Callout kind="warn" title="Something went wrong">{err}</Callout>
        </div>
      )}

      {adding && (
        <div className="mt-4 rounded-lg border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="GITHUB_TOKEN"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                {["token", "api_key", "password", "ssh_key", "webhook", "other"].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Value</span>
            <input
              type="password"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm"
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Encrypted with AES-256-GCM, bound to this row's identity — a ciphertext copied
            to another row fails to decrypt.
          </p>
          <button
            onClick={() => void add()}
            disabled={busy}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Storing…" : "Store"}
          </button>
        </div>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Secrets
      </h2>
      {secrets.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            title="No secrets yet"
            description="Add the credentials your agents need — a GitHub token, an API key."
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {secrets.map((s) => (
            <article key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">{s.name}</span>
                <StatusBadge tone="neutral">{s.kind}</StatusBadge>
                <StatusBadge tone="info">v{s.version}</StatusBadge>
                <span className="font-mono text-xs text-muted-foreground">{s.hint}</span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {s.reads} read{s.reads === 1 ? "" : "s"}
                </span>
              </div>

              {revealed[s.name] && (
                <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2">
                  <code className="break-all font-mono text-xs">{revealed[s.name]}</code>
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    This read is in the audit log. Hide it when you are done.
                  </p>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => void reveal(s.name)}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:border-primary"
                >
                  {revealed[s.name] ? "Hide" : "Reveal"}
                </button>
                <button
                  onClick={() => setGrantFor(grantFor === s.name ? null : s.name)}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:border-primary"
                >
                  Grant to an agent
                </button>
                <button
                  onClick={() => void remove(s.name)}
                  disabled={busy}
                  className="rounded border border-border px-2.5 py-1 text-xs text-red-600 hover:border-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>

              {grantFor === s.name && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={grantSlug}
                    onChange={(e) => setGrantSlug(e.target.value)}
                    placeholder="agent-slug"
                    className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                  />
                  <button
                    onClick={() => void grant(s.name)}
                    className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
                  >
                    Allow reveal
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    Reveal is its own grant — it is not implied by read or write.
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Audit log
      </h2>
      {audit.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No reads recorded yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-2.5">Secret</th>
                <th className="p-2.5">Who</th>
                <th className="p-2.5">Outcome</th>
                <th className="p-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="p-2.5 font-mono text-xs">{a.Secret}</td>
                  <td className="p-2.5 text-xs">{a.Agent || "a human"}</td>
                  <td className="p-2.5">
                    <StatusBadge tone={OUTCOME_TONE[a.Outcome] ?? "neutral"}>
                      {a.Outcome}
                    </StatusBadge>
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground">
                    {new Date(a.At).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
