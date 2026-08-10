import { useEffect, useRef, useState } from "react";
import {
  Button, Callout, Input, MarkdownRenderer, PageHeader, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue,
} from "@togo-framework/ui";
import {
  LoaderCircle, MessageSquarePlus, MessagesSquare, Send, Trash2, TriangleAlert,
} from "lucide-react";
import {
  ask, deleteSession, fetchSession, listChatAgents, listSessions,
  type ChatAgent, type SessionSummary, type Turn,
} from "../lib/chat";
import { PageShell } from "../components/page-shell";
import { useStrings } from "../lib/i18n";

export const Chat = () => {
  const { S } = useStrings();
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [agent, setAgent] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listChatAgents().then((d) => {
      setAgents(d.agents);
      if (d.agents.length > 0) setAgent(d.agents[0].slug);
    }).catch((e) => setErr(String(e.message)));
    void reloadSessions();
  }, []);

  const reloadSessions = () =>
    listSessions().then((d) => setSessions(d.sessions)).catch(() => {});

  const handleOpen = async (id: string) => {
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

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;

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
        role: "agent", text: r.answer, citations: r.citations, grounded: r.grounded,
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

  const current = agents.find((a) => a.slug === agent);

  return (
    // Tighter page gap than the record pages: a chat is one continuous surface,
    // and document-scale gaps between its controls read as separate widgets.
    <PageShell width="narrow" fill className="gap-3">
      <PageHeader
        title={S.chat.title}
        icon={<MessagesSquare className="size-5" />}
        description={S.chat.desc}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={agent}
          onValueChange={(v) => { setAgent(v); handleNew(); }}
        >
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder={S.chat.pickAgent} />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.slug} value={a.slug}>{a.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current && (
          <span className="text-xs text-muted-foreground">
            {current.role} · {current.model}
          </span>
        )}
        {/* Switching agents clears the thread, so say so rather than letting it
            look like the history was lost. */}
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleNew}>
            <MessageSquarePlus className="me-1.5 size-4" />
            {S.chat.newChat}
          </Button>
        )}
      </div>

      {/* Past conversations. Without these the answer an operator wanted to
          keep disappears when the tab closes, and the same question is asked
          and billed again an hour later. */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sessions.slice(0, 8).map((s) => (
            <span
              key={s.id}
              // Not FilterChip: a chip is ONE button, and this pill carries two
              // actions (open, delete). Nested buttons are invalid HTML, so the
              // pill is a span styled to match the chip family.
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                s.id === session
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <button
                type="button"
                onClick={() => handleOpen(s.id)}
                className="max-w-[22ch] truncate text-muted-foreground hover:text-foreground"
                title={s.title}
              >
                {/* dir="auto": the title is the operator's own first question,
                    in whatever language they typed it. */}
                <bdi>{s.title || S.chat.untitled}</bdi>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                aria-label={S.chat.deleteAria}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {err && <Callout kind="warn">{err}</Callout>}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {/* The empty thread introduces the agent rather than leaving a void:
            who will answer, and from what. Centered because the input below is
            the one action, and a top-left paragraph reads as a load failure. */}
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MessagesSquare className="size-5" />
            </span>
            <p className="text-sm font-medium">
              {current ? S.chat.askAgent(current.displayName) : S.chat.pickAgent}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {current?.description || S.chat.emptyDesc}
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "you" ? "flex justify-end" : ""}>
            <div
              // dir="auto": questions and answers arrive in either language,
              // independent of the UI locale — each bubble sets its own base
              // direction from its own first strong character.
              dir="auto"
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                t.role === "you" ? "bg-primary/10" : "border border-border bg-card"
              }`}
            >
              {t.role === "you"
                ? <p className="whitespace-pre-wrap text-sm">{t.text}</p>
                : <MarkdownRenderer content={t.text} />}

              {t.role === "agent" && t.grounded === false && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                  {S.chat.notGrounded}
                </p>
              )}

              {/* The citations are the difference between an answer and a
                  claim. Shown by default, not behind a toggle. */}
              {t.citations && t.citations.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {S.chat.groundedIn(t.citations.length)}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {t.citations.map((c, j) => (
                      <div key={j} className="rounded-md bg-muted/40 p-2 text-xs">
                        <span dir="ltr" className="font-mono text-muted-foreground">{c.from}</span>
                        <p dir="auto" className="mt-1 line-clamp-3 text-muted-foreground">{c.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            {S.chat.thinking}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleAsk} className="flex shrink-0 gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={S.chat.inputPlaceholder}
          disabled={busy || agents.length === 0}
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          {/* The paper plane flies towards the reading direction. */}
          <Send className="me-1.5 size-4 rtl:-scale-x-100" />
          {S.chat.ask}
        </Button>
      </form>
    </PageShell>
  );
};
Chat.displayName = "Chat";
