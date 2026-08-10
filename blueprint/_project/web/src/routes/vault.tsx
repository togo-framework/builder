import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button, Callout, Input, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, cn,
} from "@togo-framework/ui";
import {
  Check, Copy, Eye, EyeOff, Globe, Hash, KeyRound, Plus, Search, ShieldAlert,
  Trash2, UserPlus, X,
} from "lucide-react";
import {
  deleteSecret, fetchAudit, grantSecret, listSecrets, revealSecret, storeSecret,
  type AuditEntry, type Secret,
} from "../lib/vault";
import {
  Field, FormCard, FormFooter, ListSkeleton, MonoBadge, PageShell, Row, RowMeta,
  RowTitle, Rows, Section, Stat, StatRow,
} from "../components/page-shell";
import { EmptyState } from "../components/ui/empty-state";
import { ConfirmAction } from "../components/ui/confirm-action";
import {
  Footprint, FootprintArtefact, FootprintRow, type FootprintStatus,
} from "../components/ui/footprint";
import { exactTime, relativeTime, useVaultStrings } from "../lib/i18n.vault";

/**
 * vault — the screen that decides who can read a credential.
 *
 * The one behaviour everything else is arranged around: a value is not in the
 * DOM until the operator asks for it. Masking with CSS, or fetching every
 * plaintext and hiding it behind a toggle, would put every secret in the page's
 * memory and in the devtools of anyone standing behind the operator. So the
 * list renders the server's non-reversible hint (`sk-…a1b2`) and nothing else,
 * and a reveal is a round trip that the server audits in the same transaction
 * as the decrypt.
 *
 * Three consequences of that, visible in the UI:
 *
 *   1. A revealed value EXPIRES. Hiding is not the operator's chore; the value
 *      drops out of React state on a timer, because the common failure is a
 *      revealed secret left on a screen in an office, not a malicious reader.
 *   2. Copy is its own action, not a convenience on top of reveal. It fetches,
 *      writes to the clipboard, and never puts the plaintext in the document —
 *      the safest way to move a token into a terminal is to never draw it.
 *   3. Delete asks for the secret's name to be typed. ConfirmAction reserves
 *      that for the irreversible, and a destroyed ciphertext is exactly that.
 *
 * The audit log is a Footprint rather than a table. It is the same shape as an
 * agent's run history because it answers the same question — what was actually
 * done, in order, by whom — and the outcome is carried by the glyph AND by the
 * verb ("Refused a read of"), so the list survives monochrome.
 */

const KINDS = ["token", "api_key", "password", "ssh_key", "webhook", "other"];

/** How long a revealed value stays on screen before the state drops it. */
const REVEAL_SECONDS = 45;

/** A name that agents and shells can both address without quoting. */
const NAME_OK = /^[A-Za-z0-9_.-]+$/;

const AUDIT_STATUS: Record<AuditEntry["Outcome"], FootprintStatus> = {
  ok: "done",
  denied: "failed",
  rate_limited: "blocked",
  expired: "skipped",
};

const SUGGESTED = ["GITHUB_TOKEN", "OPENAI_API_KEY", "DATABASE_URL"];

/** A square, quiet action. Icon-only rows keep the name the loudest thing on
 *  the line, so every one of these carries its label as title AND aria-label —
 *  a tooltip is not an accessible name. */
const IconAction = ({
  icon, label, onClick, disabled = false, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "motion-hover motion-press inline-flex size-8 shrink-0 items-center justify-center rounded-field",
      "text-muted-foreground hover:bg-muted hover:text-foreground",
      "disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4",
      danger && "hover:bg-destructive/10 hover:text-destructive",
    )}
  >
    {icon}
  </button>
);
IconAction.displayName = "IconAction";

/** The list filter. A bordered flex box rather than an Input with an absolutely
 *  positioned icon, because absolute positioning inside a field is the one
 *  place an RTL flip is easiest to get wrong and hardest to notice. */
const FilterBox = ({
  value, onChange, placeholder, clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
}) => (
  <div className="motion-hover flex h-8 items-center gap-1.5 rounded-field border border-border bg-background px-2 focus-within:border-primary/50">
    <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-32 min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-44"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        title={clearLabel}
        aria-label={clearLabel}
        className="motion-hover shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    )}
  </div>
);
FilterBox.displayName = "FilterBox";

export const Vault = () => {
  const { S, ar } = useVaultStrings();

  const [secrets, setSecrets] = useState<Secret[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", kind: "token", value: "", scope: "project" });

  /**
   * Revealed plaintext lives here and NOWHERE else — not in a ref, not in a
   * cache, not in storage. Each entry carries its own expiry so the value
   * leaves state on its own; a value still in state is still in a heap dump.
   */
  const [revealed, setRevealed] = useState<Record<string, { value: string; expires: number }>>({});
  const [tick, setTick] = useState(() => Date.now());

  const [copied, setCopied] = useState("");
  const copyTimer = useRef<number | undefined>(undefined);

  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantSlug, setGrantSlug] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Secret | null>(null);

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

  // One clock, running only while something is on screen to expire.
  const revealCount = Object.keys(revealed).length;
  useEffect(() => {
    if (revealCount === 0) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [revealCount]);

  useEffect(() => {
    const stale = Object.keys(revealed).filter((n) => revealed[n].expires <= tick);
    if (stale.length === 0) return;
    setRevealed((r) => {
      const next = { ...r };
      for (const n of stale) delete next[n];
      return next;
    });
  }, [tick, revealed]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const nameOk = form.name.trim() === "" || NAME_OK.test(form.name.trim());
  const canStore = !busy && NAME_OK.test(form.name.trim()) && form.value !== "";

  async function add() {
    setBusy(true);
    setErr("");
    try {
      await storeSecret({ ...form, name: form.name.trim() });
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
      // Hiding DROPS the value rather than toggling a class.
      setRevealed((r) => {
        const next = { ...r };
        delete next[name];
        return next;
      });
      return;
    }
    try {
      const { value } = await revealSecret(name);
      setTick(Date.now());
      setRevealed((r) => ({
        ...r,
        [name]: { value, expires: Date.now() + REVEAL_SECONDS * 1000 },
      }));
      void load(); // the read count just changed
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  /**
   * Copy without drawing. The value goes from the response straight to the
   * clipboard; it is never assigned to state, so it never reaches the DOM.
   */
  async function copy(name: string) {
    setErr("");
    try {
      const value = revealed[name]?.value ?? (await revealSecret(name)).value;
      if (!navigator.clipboard) throw new Error(S.clipboardErr);
      await navigator.clipboard.writeText(value);
      setCopied(name);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(""), 2000);
      if (!revealed[name]) void load(); // a copy is a read, and the count moved
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    setBusy(true);
    setErr("");
    try {
      await deleteSecret(name);
      setRevealed((r) => {
        const next = { ...r };
        delete next[name];
        return next;
      });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function grant(name: string) {
    const slug = grantSlug.trim();
    if (!slug) return;
    setErr("");
    try {
      await grantSecret(name, slug, true);
      setGrantFor(null);
      setGrantSlug("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  const denials = audit.filter((a) => a.Outcome !== "ok").length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !secrets) return secrets;
    return secrets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q),
    );
  }, [secrets, query]);

  const auditVerb = (o: AuditEntry["Outcome"]) =>
    o === "ok"
      ? S.auditVerbOk
      : o === "denied"
        ? S.auditVerbDenied
        : o === "rate_limited"
          ? S.auditVerbRate
          : S.auditVerbExpired;

  return (
    <PageShell
      width="narrow"
      title={S.title}
      description={S.description}
      icon={<KeyRound />}
      actions={
        <Button onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="me-1.5 size-4" /> : <Plus className="me-1.5 size-4" />}
          {adding ? S.cancel : S.add}
        </Button>
      }
    >
      <StatRow cols={3}>
        <Stat label={S.statSecrets} value={secrets?.length ?? 0} />
        <Stat label={S.statReads} value={audit.length} />
        <Stat label={S.statRefused} value={denials} tone={denials ? "warning" : "muted"} />
      </StatRow>

      {err && (
        <Callout kind="warn" title={S.errTitle}>
          {err}
        </Callout>
      )}

      {adding && (
        <FormCard title={S.formTitle} onClose={() => setAdding(false)} closeLabel={S.cancel}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={S.fName}
              htmlFor="sec-name"
              required
              hint={S.fNameHint}
              error={nameOk ? undefined : "A-Z 0-9 _ . -"}
            >
              <Input
                id="sec-name"
                dir="ltr"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="GITHUB_TOKEN"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <Field label={S.fKind} htmlFor="sec-kind" hint={S.fKindHint}>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger id="sec-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={S.fValue} htmlFor="sec-value" required className="mt-4" hint={S.fValueHint}>
            <Input
              id="sec-value"
              dir="ltr"
              type="password"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              autoComplete="new-password"
              spellCheck={false}
              className="font-mono"
            />
          </Field>

          <FormFooter note={canStore ? S.noteReady : S.noteMissing}>
            <Button onClick={() => void add()} disabled={!canStore}>
              <KeyRound className="me-1.5 size-4" />
              {busy ? S.storing : S.store}
            </Button>
          </FormFooter>
        </FormCard>
      )}

      <Section
        title={S.sectionSecrets}
        count={secrets?.length}
        actions={
          secrets && secrets.length > 0 ? (
            <FilterBox
              value={query}
              onChange={setQuery}
              placeholder={S.filterPlaceholder}
              clearLabel={S.clearFilter}
            />
          ) : undefined
        }
      >
        {secrets === null && <ListSkeleton rows={3} />}

        {secrets?.length === 0 && (
          <EmptyState
            icon={<KeyRound />}
            title={S.emptyTitle}
            description={S.emptyDesc}
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="me-1.5 size-4" />
                {S.add}
              </Button>
            }
            suggestionsLabel={S.emptySuggestLabel}
            suggestions={SUGGESTED.map((name) => ({
              label: name,
              title: S.add,
              onSelect: () => {
                setForm((f) => ({ ...f, name }));
                setAdding(true);
              },
            }))}
          />
        )}

        {secrets && secrets.length > 0 && shown?.length === 0 && (
          <EmptyState
            variant="filtered"
            size="sm"
            icon={<Search />}
            title={S.noMatchTitle}
            description={S.noMatchDesc}
            action={
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                {S.clearFilter}
              </Button>
            }
          />
        )}

        {shown && shown.length > 0 && (
          <Rows>
            {shown.map((s) => {
              const open = revealed[s.name];
              const left = open ? Math.max(0, Math.ceil((open.expires - tick) / 1000)) : 0;

              return (
                <Row
                  key={s.id}
                  leading={
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <KeyRound className="size-4" />
                    </span>
                  }
                  trailing={
                    <>
                      <Button
                        variant={open ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => void reveal(s.name)}
                      >
                        {open ? (
                          <EyeOff className="me-1.5 size-4" />
                        ) : (
                          <Eye className="me-1.5 size-4" />
                        )}
                        {open ? S.hide : S.reveal}
                      </Button>
                      <IconAction
                        icon={copied === s.name ? <Check className="text-success" /> : <Copy />}
                        label={copied === s.name ? S.copied : S.copy}
                        onClick={() => void copy(s.name)}
                      />
                      <IconAction
                        icon={<UserPlus />}
                        label={S.grant}
                        onClick={() => setGrantFor(grantFor === s.name ? null : s.name)}
                      />
                      <IconAction
                        icon={<Trash2 />}
                        label={S.remove}
                        danger
                        disabled={busy}
                        onClick={() => setPendingDelete(s)}
                      />
                    </>
                  }
                  footer={
                    grantFor === s.name ? (
                      <div className="motion-entrance border-t border-border/60 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            dir="ltr"
                            value={grantSlug}
                            onChange={(e) => setGrantSlug(e.target.value)}
                            placeholder={S.grantPlaceholder}
                            aria-label={S.grant}
                            autoComplete="off"
                            spellCheck={false}
                            className="h-8 w-44 font-mono text-xs"
                          />
                          <Button
                            size="sm"
                            onClick={() => void grant(s.name)}
                            disabled={!grantSlug.trim()}
                          >
                            {S.grantAllow}
                          </Button>
                          <span className="min-w-0 text-[11px] text-muted-foreground">
                            {S.grantNote}
                          </span>
                        </div>
                      </div>
                    ) : undefined
                  }
                >
                  <RowTitle>
                    <bdi dir="ltr" className="font-mono text-sm font-medium text-foreground">
                      {s.name}
                    </bdi>
                    <MonoBadge>{s.kind}</MonoBadge>
                    {s.scope === "agent" && s.agentSlug && (
                      <MonoBadge className="text-muted-foreground">{s.agentSlug}</MonoBadge>
                    )}
                  </RowTitle>

                  <RowMeta>
                    {/* The mask is the server's own non-reversible hint. Nothing
                        here is derived from a plaintext the page has seen. */}
                    <span className="inline-flex items-center gap-1.5" title={S.hiddenHint}>
                      <EyeOff aria-hidden="true" className="size-3 shrink-0" />
                      <span className="sr-only">{S.hidden}</span>
                      <bdi dir="ltr" className="font-mono">
                        {s.hint}
                      </bdi>
                    </span>
                    <span className="numeric font-mono">v{s.version}</span>
                    <span className="numeric">{S.readsCount(s.reads)}</span>
                    <span title={exactTime(s.createdAt, ar)}>
                      {S.createdLead} {relativeTime(s.createdAt, ar)}
                    </span>
                  </RowMeta>

                  {open && (
                    <div className="motion-entrance mt-2 rounded-card border border-warning/40 bg-warning/10 p-2.5">
                      <div className="flex items-start gap-2">
                        <code
                          dir="ltr"
                          className="min-w-0 flex-1 break-all font-mono text-xs text-foreground"
                        >
                          {open.value}
                        </code>
                        <IconAction
                          icon={copied === s.name ? <Check className="text-success" /> : <Copy />}
                          label={copied === s.name ? S.copied : S.copy}
                          onClick={() => void copy(s.name)}
                        />
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-warning">
                        <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
                        <span>{S.revealBanner}</span>
                        <span className="numeric ms-auto tabular-nums">
                          {S.revealCountdown(left)}
                        </span>
                      </p>
                    </div>
                  )}
                </Row>
              );
            })}
          </Rows>
        )}
      </Section>

      <Section title={S.auditTitle} count={audit.length}>
        {audit.length === 0 ? (
          <EmptyState size="sm" icon={<ShieldAlert />} title={S.auditEmpty} />
        ) : (
          <Footprint bordered>
            {audit.map((a, i) => (
              <FootprintRow
                key={`${a.At}-${a.Secret}-${i}`}
                status={AUDIT_STATUS[a.Outcome] ?? "pending"}
                arabic={ar}
                title={
                  <span className="min-w-0">
                    {auditVerb(a.Outcome)}{" "}
                    <bdi dir="ltr" className="font-mono text-foreground">
                      {a.Secret}
                    </bdi>
                  </span>
                }
                actor={a.Agent || undefined}
                artefacts={
                  <>
                    {!a.Agent && <span>{S.auditHuman}</span>}
                    {a.IP && (
                      <FootprintArtefact icon={<Globe />} title={a.IP}>
                        {a.IP}
                      </FootprintArtefact>
                    )}
                    {a.RunID && (
                      <FootprintArtefact icon={<Hash />} title={a.RunID}>
                        {a.RunID}
                      </FootprintArtefact>
                    )}
                  </>
                }
                time={relativeTime(a.At, ar)}
              />
            ))}
          </Footprint>
        )}
      </Section>

      {/* One dialog for the page, not one per row: an AlertDialog mounted N
          times is N focus traps waiting for a bug. */}
      <ConfirmAction
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={S.deleteTitle}
        description={
          <span>
            {S.deleteDescLead}
            <bdi dir="ltr" className="font-mono">
              {pendingDelete?.name}
            </bdi>
            {S.deleteDescTail}
          </span>
        }
        consequences={[S.deleteC1, S.deleteC2, S.deleteC3]}
        confirmLabel={S.deleteConfirm}
        cancelLabel={S.cancel}
        requireTyping={pendingDelete?.name}
        busy={busy}
        onConfirm={confirmDelete}
      />
    </PageShell>
  );
};
Vault.displayName = "Vault";
