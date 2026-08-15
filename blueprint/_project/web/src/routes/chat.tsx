import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Button, Callout, MarkdownRenderer, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader,
  SheetTitle, Textarea,
} from "@togo-framework/ui";
import {
  Bot, Check, Coins, Copy, History, LoaderCircle, MessageSquarePlus, MessagesSquare,
  Quote, RefreshCw, Send, Sparkles, Trash2, TriangleAlert,
} from "lucide-react";
import {
  ask, deleteSession, fetchSession, listChatAgents, listSessions,
  type ChatAgent, type Citation, type SessionSummary, type Turn,
} from "../lib/chat";
import { fetchProjectBrain } from "../lib/brainproject";
import { PageShell, AppPageHeader as PageHeader } from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { useAIStrings } from "../lib/i18n.ai";

/**
 * Chat — the advisory surface, rebuilt as a conversation product rather than a
 * form that happens to print answers.
 *
 * Three things drive the layout:
 *
 *   - A conversation has a HISTORY, and history is navigation, not a row of
 *     tags. It gets a rail of its own on the start edge, the way every mail
 *     client and every chat product resolves the same problem. Under lg the
 *     rail becomes a side sheet, because 240px taken from a phone is the whole
 *     reading column.
 *   - The thread is ONE framed surface — toolbar, scroller, composer — so the
 *     composer is visibly part of the conversation instead of a stray input
 *     floating at the bottom of the page.
 *   - The answer is a claim until its sources are visible. Citations are
 *     numbered chips ON the answer, and opening one shows the memory verbatim
 *     with its provenance and match score. Nothing about the grounding is
 *     behind a disclosure triangle.
 *
 * What is deliberately NOT here: a token stream and a stop button. `POST /ask`
 * returns the whole answer in one response, so a character-by-character
 * animation would be a lie about what the server is doing, and a stop button
 * would not stop anything. Progress is an elapsed clock and the stage the
 * server is in — both true.
 */

/** A turn plus what this browser session knows about it. The stored turn has
 *  no cost — that is the server's record — so a reopened conversation shows
 *  cost only for the answers bought since the page was opened. */
interface ThreadTurn extends Turn {
  costUSD?: number;
}

/** Which citation the inspector is showing. */
interface OpenCite {
  turn: number;
  index: number;
}

const usd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}`;

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * Which language MarkdownRenderer should lay an answer out as.
 *
 * NOT the UI locale. MarkdownRenderer puts `dir` on its own wrapper from this
 * prop, so passing the interface language right-aligned every English answer
 * the moment the dashboard was switched to Arabic — the prose came back ragged
 * on the wrong edge. An answer's direction is a property of the answer: the
 * agent replies in whatever language the question was asked in, independent of
 * the chrome around it. This is the first-strong-character rule that `dir=auto`
 * uses, applied to a prop that has no `auto`.
 */
const scriptOf = (s: string): "en" | "ar" => {
  const first = s.match(/[A-Za-z؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/);
  return first && ARABIC.test(first[0]) ? "ar" : "en";
};

export const Chat = () => {
  const { S } = useStrings();
  const { A, isRTL } = useAIStrings();
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [agent, setAgent] = useState("");
  const [turns, setTurns] = useState<ThreadTurn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState("");
  const [copied, setCopied] = useState(-1);
  const [cite, setCite] = useState<OpenCite | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Entity and source names actually in the brain, for the starter prompts. */
  const [seeds, setSeeds] = useState<{ entities: string[]; sources: string[] }>({
    entities: [], sources: [],
  });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listChatAgents().then((d) => {
      setAgents(d.agents);
      if (d.agents.length > 0) setAgent(d.agents[0].slug);
    }).catch((e) => setErr(String(e.message)));
    void reloadSessions();
    // Wayfinders have to be about THIS project or they are decoration. The
    // brain is read once, best-effort: if it fails the starters fall back to
    // questions any agent can answer from its own persona.
    fetchProjectBrain()
      .then((b) => setSeeds({
        entities: [...b.graph.nodes]
          .sort((x, y) => y.mentions - x.mentions).slice(0, 2).map((n) => n.name),
        sources: b.sources.slice(0, 1).map((s) => s.label),
      }))
      .catch(() => {});
  }, []);

  const reloadSessions = () =>
    listSessions().then((d) => setSessions(d.sessions)).catch(() => {});

  const handleOpen = async (id: string) => {
    setHistoryOpen(false);
    try {
      const s = await fetchSession(id);
      setSession(s.id);
      setAgent(s.agent);
      setTurns(s.turns.map((t) => ({
        role: t.role, text: t.text, citations: t.citations, grounded: t.grounded,
      })));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleNew = () => {
    setSession("");
    setTurns([]);
    setErr("");
    setCite(null);
    setHistoryOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(S.chat.confirmDelete)) return;
    try {
      await deleteSession(id);
      if (id === session) handleNew();
      void reloadSessions();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  // The elapsed clock. A question can legitimately take two minutes, and a
  // spinner with no number is indistinguishable from a hung request.
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [busy]);

  /** The one path a question travels, whether typed or re-asked. */
  const send = async (question: string) => {
    if (!question || busy || !agent) return;

    // The question is shown before the request goes out. Waiting for the round
    // trip to echo what the operator just typed reads as a dropped message.
    const history = turns;
    setTurns([...history, { role: "you", text: question }]);
    setQ("");
    setBusy(true);
    setErr("");
    try {
      const r = await ask(agent, question, history, session);
      setTurns((t) => [...t, {
        role: "agent", text: r.answer, citations: r.citations,
        grounded: r.grounded, costUSD: r.costUSD,
      }]);
      // The server mints the id on the first question; keeping it is what makes
      // the next question a continuation rather than a new conversation.
      if (r.session) setSession(r.session);
      void reloadSessions();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    void send(q.trim());
  };

  /** Re-ask the question that produced this answer. Appends a new exchange
   *  rather than replacing the old one: the server bills a second run, and
   *  silently overwriting the first would hide what was paid for. */
  const handleAskAgain = (answerIndex: number) => {
    for (let i = answerIndex - 1; i >= 0; i--) {
      if (turns[i].role === "you") {
        void send(turns[i].text);
        return;
      }
    }
  };

  const handleCopy = async (i: number, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(i);
    window.setTimeout(() => setCopied(-1), 1600);
  };

  const handleStarter = (text: string) => {
    setQ(text);
    inputRef.current?.focus();
  };

  const current = agents.find((a) => a.slug === agent);

  /** Spent on this thread since the page was opened. */
  const spend = useMemo(
    () => turns.reduce((sum, t) => sum + (t.costUSD ?? 0), 0),
    [turns],
  );

  /** Wayfinders. Real ones where the brain has content, persona ones where it
   *  does not — never an empty box. */
  const starters = useMemo(() => {
    const out: string[] = [];
    for (const name of seeds.entities) out.push(A.chat.starterEntity(name));
    for (const label of seeds.sources) out.push(A.chat.starterSource(label));
    if (out.length > 0) out.push(A.chat.starterRecent);
    if (current?.role) out.push(A.chat.starterRole(current.role));
    out.push(A.chat.starterOwnership, A.chat.starterGaps);
    return out.slice(0, 4);
  }, [seeds, current, A]);

  const grounded = seeds.entities.length + seeds.sources.length > 0;
  const openCitation =
    cite && turns[cite.turn]?.citations?.[cite.index]
      ? (turns[cite.turn].citations as Citation[])[cite.index]
      : null;

  /* ---------------------------------------------------------------- */
  /* Conversation rail                                                 */
  /* ---------------------------------------------------------------- */

  const rail = (
    // No "new chat" button here: the page header already carries it, and two
    // primaries for the same action makes the operator wonder which one is
    // different.
    <div className="flex min-h-0 flex-col gap-2">
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium">{A.chat.historyEmpty}</p>
          <p className="mt-1 text-xs text-muted-foreground">{A.chat.historyEmptyDesc}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-0.5">
          {sessions.map((s) => (
            // The row is a group so the delete only appears on the row being
            // considered — a permanent bin icon on forty rows is forty
            // invitations to lose something.
            <div
              key={s.id}
              className={`group flex items-start gap-1 rounded-lg border-s-2 px-2 py-1.5 transition-colors ${
                s.id === session
                  ? "border-s-primary bg-primary/10"
                  : "border-s-transparent hover:bg-muted/50"
              }`}
            >
              <button
                type="button"
                onClick={() => handleOpen(s.id)}
                className="min-w-0 flex-1 text-start"
              >
                {/* bdi: the title is the operator's own first question, in
                    whatever language they typed it. */}
                <bdi className="line-clamp-2 block text-xs font-medium">
                  {s.title || S.chat.untitled}
                </bdi>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {A.chat.messages(s.turns)} · {A.chat.ago(s.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                aria-label={S.chat.deleteAria}
                className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */

  return (
    <PageShell width="default" fill className="gap-4">
      <PageHeader
        title={S.chat.title}
        icon={<MessagesSquare className="size-5" />}
        description={S.chat.desc}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="me-1.5 size-4" />
              {A.chat.historyOpen}
            </Button>
            <Button size="sm" onClick={handleNew}>
              <MessageSquarePlus className="me-1.5 size-4" />
              {S.chat.newChat}
            </Button>
          </div>
        }
      />

      {err && <Callout kind="warn">{err}</Callout>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 lg:flex lg:flex-col">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {A.chat.historyHeading}
          </h2>
          {rail}
        </aside>

        {/* ONE surface: toolbar, thread, composer. The composer belonging to
            the same frame as the messages is what makes it read as a
            conversation rather than a page with a text field at the bottom. */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
            <Select
              value={agent}
              onValueChange={(v) => { setAgent(v); handleNew(); }}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder={S.chat.pickAgent} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.slug} value={a.slug}>{a.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {current && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                <bdi>{current.role}</bdi>
                {" · "}
                <bdi className="font-mono">{current.model}</bdi>
              </span>
            )}

            {/* Cost transparency. These are real dollars per question, and a
                surface that spends money without saying so is the reason
                anyone is surprised by a bill. */}
            {spend > 0 && (
              <span
                title={A.chat.spendTitle}
                className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Coins className="size-3" />
                {A.chat.spend}
                <bdi dir="ltr" className="font-mono tabular-nums text-foreground">{usd(spend)}</bdi>
              </span>
            )}
          </div>

          {/* Recessed against the card so the messages sit ON something. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background p-3 sm:p-4">
            {turns.length === 0 && (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-3 py-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MessagesSquare className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {current ? S.chat.askAgent(current.displayName) : S.chat.pickAgent}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current?.description || S.chat.emptyDesc}
                  </p>
                </div>

                {agents.length === 0 ? (
                  <p className="text-xs text-warning">{A.chat.noAgents}</p>
                ) : (
                  <div className="w-full pt-2 text-start">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="size-3.5" />
                      {A.chat.startersHeading}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {starters.map((s) => (
                        // Fills the composer rather than sending. A suggestion
                        // that spends money on one click is a trap, not a
                        // shortcut — the operator still presses send.
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleStarter(s)}
                          className="rounded-lg border border-border bg-card px-3 py-2 text-start text-xs transition-colors hover:border-primary/50 hover:bg-muted/50"
                        >
                          <bdi>{s}</bdi>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {grounded ? A.chat.startersFromBrain : A.chat.startersGeneric}
                    </p>
                  </div>
                )}
              </div>
            )}

            {turns.map((t, i) =>
              t.role === "you" ? (
                <div key={i} className="flex justify-end">
                  <div
                    // dir="auto": questions arrive in either language,
                    // independent of the UI locale — each bubble takes its base
                    // direction from its own first strong character.
                    dir="auto"
                    className="max-w-[85%] rounded-2xl rounded-ee-sm border border-primary/25 bg-primary/10 px-3.5 py-2.5"
                  >
                    <p className="whitespace-pre-wrap text-sm">{t.text}</p>
                  </div>
                </div>
              ) : (
                <article key={i} className="rounded-xl border border-border bg-card">
                  <header className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
                    <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Bot className="size-3.5" />
                    </span>
                    <span className="min-w-0 truncate text-xs font-medium">
                      <bdi>{current?.displayName ?? agent}</bdi>
                    </span>
                    {t.costUSD !== undefined && t.costUSD > 0 && (
                      <bdi
                        dir="ltr"
                        title={A.chat.spendTitle}
                        className="ms-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                      >
                        {usd(t.costUSD)}
                      </bdi>
                    )}
                  </header>

                  {/* Measure cap: the card is as wide as the column, but prose
                      past ~70 characters loses the line the eye returns to. */}
                  <div dir="auto" className="max-w-[70ch] px-3 py-2">
                    <MarkdownRenderer content={t.text} language={scriptOf(t.text)} />
                  </div>

                  {t.grounded === false && (
                    <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-warning">
                      <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                      {S.chat.notGrounded}
                    </p>
                  )}

                  {/* Sources, on the answer, always. Numbered so prose can be
                      read against them, and each one opens the memory itself. */}
                  {t.citations && t.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        <Quote className="size-3" />
                        {A.chat.sourcesHeading}
                      </span>
                      {t.citations.map((c, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => setCite({ turn: i, index: j })}
                          title={c.from}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                        >
                          <span className="font-mono tabular-nums text-foreground">{j + 1}</span>
                          <bdi className="max-w-[18ch] truncate">{c.from}</bdi>
                        </button>
                      ))}
                    </div>
                  )}

                  <footer className="flex flex-wrap items-center gap-1 border-t border-border/60 px-2 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      onClick={() => void handleCopy(i, t.text)}
                    >
                      {copied === i
                        ? <Check className="me-1.5 size-3.5" />
                        : <Copy className="me-1.5 size-3.5" />}
                      {copied === i ? A.chat.copied : A.chat.copy}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={A.chat.askAgainTitle}
                      disabled={busy}
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      onClick={() => handleAskAgain(i)}
                    >
                      <RefreshCw className="me-1.5 size-3.5" />
                      {A.chat.askAgain}
                    </Button>
                  </footer>
                </article>
              ),
            )}

            {/* Progress, not theatre. The stage names the server's own
                sequence — recall, then the model — and the clock is the part
                that tells an operator whether to keep waiting. */}
            {busy && (
              <div className="rounded-xl border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
                  <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Bot className="size-3.5" />
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium">
                    <bdi>{current?.displayName ?? agent}</bdi>
                  </span>
                  <bdi dir="ltr" className="ms-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                    {A.chat.elapsed(elapsed)}
                  </bdi>
                </header>
                <div className="space-y-2 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                    {elapsed < 2 ? A.chat.workingRecall : A.chat.workingAnswer}
                  </p>
                  {/* Skeleton lines the shape of the answer that is coming. */}
                  <div aria-hidden="true" className="space-y-1.5">
                    <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                    <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  </div>
                  {elapsed >= 45 && (
                    <p className="text-[11px] text-muted-foreground">{A.chat.workingLong}</p>
                  )}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Sticky footer composer. Multi-line by default, because a question
              worth grounding is rarely one line, and Enter still sends. */}
          <form
            onSubmit={handleAsk}
            className="shrink-0 border-t border-border px-3 py-2.5"
          >
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(q.trim());
                  }
                }}
                rows={1}
                dir="auto"
                placeholder={S.chat.inputPlaceholder}
                disabled={busy || agents.length === 0}
                className="max-h-40 min-h-[2.5rem] resize-y py-2 text-sm"
              />
              <Button type="submit" disabled={busy || !q.trim()}>
                {busy
                  ? <LoaderCircle className="me-1.5 size-4 animate-spin motion-reduce:animate-none" />
                  /* The paper plane flies towards the reading direction. */
                  : <Send className="me-1.5 size-4 rtl:-scale-x-100" />}
                {S.chat.ask}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {busy ? A.chat.stopHint : A.chat.composerHint}
            </p>
          </form>
        </section>
      </div>

      {/* History as a side sheet under lg — the rail's content, not a second
          implementation of it. */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side={isRTL ? "left" : "right"}
          className="flex w-80 flex-col gap-3 overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{A.chat.historyHeading}</SheetTitle>
            <SheetDescription>{A.chat.historyEmptyDesc}</SheetDescription>
          </SheetHeader>
          {rail}
        </SheetContent>
      </Sheet>

      {/* The source inspector. A citation you cannot read is a footnote to a
          book nobody has. */}
      <Sheet open={!!openCitation} onOpenChange={(o) => !o && setCite(null)}>
        {/* Scrolls in itself: a memory is up to 600 characters and the sheet is
            a fixed-height panel — without this the tail is unreachable. */}
        <SheetContent
          side={isRTL ? "left" : "right"}
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>
              {A.chat.inspectorTitle}
              {cite ? ` ${cite.index + 1}` : ""}
            </SheetTitle>
            <SheetDescription>{A.chat.inspectorDesc}</SheetDescription>
          </SheetHeader>

          {openCitation && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-muted-foreground">{A.chat.fromLabel}</span>
                  {/* Provenance is a machine reference — a path, a repo, a
                      feed id — so it keeps its own direction. */}
                  <bdi dir="ltr" className="min-w-0 break-all font-mono">{openCitation.from}</bdi>
                </div>
                <div className="flex items-baseline gap-2" title={A.chat.matchTitle}>
                  <span className="shrink-0 text-muted-foreground">{A.chat.matchLabel}</span>
                  <bdi dir="ltr" className="font-mono tabular-nums">
                    {openCitation.score.toFixed(3)}
                  </bdi>
                </div>
              </div>

              <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
                {openCitation.content}
              </p>

              <Button asChild variant="outline" size="sm">
                <Link to="/brain">
                  <MessagesSquare className="me-1.5 size-4" />
                  {A.chat.openBrain}
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </PageShell>
  );
};
Chat.displayName = "Chat";
