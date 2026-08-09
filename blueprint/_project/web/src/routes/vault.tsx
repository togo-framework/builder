import { useEffect, useState } from "react";
import {
  Button, Callout, EmptyState, Input, PageHeader, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, StatusBadge, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@togo-framework/ui";
import { Eye, EyeOff, KeyRound, Plus, Trash2, UserPlus, X } from "lucide-react";
import {
  deleteSecret, fetchAudit, grantSecret, listSecrets, revealSecret, storeSecret,
  type AuditEntry, type Secret,
} from "../lib/vault";
import {
  Field, FormCard, FormFooter, ListSkeleton, PageShell, Row, RowTitle, Rows,
  Section, Stat, StatRow,
} from "../components/page-shell";

const OUTCOME_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  ok: "success",
  denied: "danger",
  rate_limited: "warning",
  expired: "warning",
};

const KINDS = ["token", "api_key", "password", "ssh_key", "webhook", "other"];

export const Vault = () => {
  const [secrets, setSecrets] = useState<Secret[] | null>(null);
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
  const canStore = !busy && form.name.trim() !== "" && form.value !== "";

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Vault"
        icon={<KeyRound className="size-5" />}
        description="Credentials agents can read. Every reveal is recorded in the same transaction as the decrypt — a read that cannot be logged does not happen."
        actions={
          <Button onClick={() => setAdding((v) => !v)}>
            {adding ? <X className="me-1.5 size-4" /> : <Plus className="me-1.5 size-4" />}
            {adding ? "Cancel" : "Add a secret"}
          </Button>
        }
      />

      <StatRow cols={3}>
        <Stat label="Secrets" value={secrets?.length ?? 0} />
        <Stat label="Reads" value={audit.length} />
        <Stat label="Refused" value={denials} tone={denials ? "warning" : "muted"} />
      </StatRow>

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

      {adding && (
        <FormCard title="Add a secret" onClose={() => setAdding(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name" htmlFor="sec-name" required
              hint="How agents and grants refer to it — the env-var convention keeps it unambiguous."
            >
              <Input
                id="sec-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="GITHUB_TOKEN"
                className="font-mono"
              />
            </Field>
            <Field
              label="Kind" htmlFor="sec-kind"
              hint="Only a label for the list — every kind is encrypted the same way."
            >
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger id="sec-kind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="Value" htmlFor="sec-value" required className="mt-4"
            hint="Encrypted with AES-256-GCM, bound to this row's identity — a ciphertext copied to another row fails to decrypt."
          >
            <Input
              id="sec-value"
              type="password"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              autoComplete="new-password"
              className="font-mono"
            />
          </Field>
          <FormFooter
            note={canStore ? "Stored encrypted; agents still need an explicit grant to reveal it." : "A name and a value are required."}
          >
            <Button onClick={() => void add()} disabled={!canStore}>
              <KeyRound className="me-1.5 size-4" />
              {busy ? "Storing…" : "Store"}
            </Button>
          </FormFooter>
        </FormCard>
      )}

      <Section title="Secrets" count={secrets?.length}>
        {secrets === null && <ListSkeleton rows={2} />}
        {secrets?.length === 0 && (
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="No secrets yet"
            description="Add the credentials your agents need — a GitHub token, an API key."
          />
        )}
        {secrets && secrets.length > 0 && (
          <Rows>
            {secrets.map((s) => (
              <Row key={s.id}>
                <RowTitle>
                  <span className="font-mono text-sm font-medium">{s.name}</span>
                  <StatusBadge tone="neutral">{s.kind}</StatusBadge>
                  <StatusBadge tone="info">v{s.version}</StatusBadge>
                  <span className="font-mono text-xs text-muted-foreground">{s.hint}</span>
                  <span className="ms-auto text-xs text-muted-foreground">
                    {s.reads} read{s.reads === 1 ? "" : "s"}
                  </span>
                </RowTitle>

                {revealed[s.name] && (
                  <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2">
                    <code className="break-all font-mono text-xs">{revealed[s.name]}</code>
                    <p className="mt-1 text-[11px] text-warning">
                      This read is in the audit log. Hide it when you are done.
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => void reveal(s.name)}>
                    {revealed[s.name]
                      ? <EyeOff className="me-1.5 size-4" />
                      : <Eye className="me-1.5 size-4" />}
                    {revealed[s.name] ? "Hide" : "Reveal"}
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setGrantFor(grantFor === s.name ? null : s.name)}
                  >
                    <UserPlus className="me-1.5 size-4" />
                    Grant to an agent
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => void remove(s.name)}
                    disabled={busy}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="me-1.5 size-4" />
                    Delete
                  </Button>
                </div>

                {grantFor === s.name && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      value={grantSlug}
                      onChange={(e) => setGrantSlug(e.target.value)}
                      placeholder="agent-slug"
                      className="h-8 w-44 font-mono text-xs"
                    />
                    <Button size="sm" onClick={() => void grant(s.name)} disabled={!grantSlug.trim()}>
                      Allow reveal
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      Reveal is its own grant — it is not implied by read or write.
                    </span>
                  </div>
                )}
              </Row>
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Audit log" count={audit.length}>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reads recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Secret</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{a.Secret}</TableCell>
                    <TableCell className="text-xs">{a.Agent || "a human"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={OUTCOME_TONE[a.Outcome] ?? "neutral"}>
                        {a.Outcome}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.At).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </PageShell>
  );
};
Vault.displayName = "Vault";
