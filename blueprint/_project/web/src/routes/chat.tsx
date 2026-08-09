import { useEffect, useRef, useState } from "react";
import { Button, Callout, Input, MarkdownRenderer, PageHeader } from "@togo-framework/ui";
import { Send } from "lucide-react";
import { ask, listChatAgents, type ChatAgent, type Turn } from "../lib/chat";

export const Chat = () => {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [agent, setAgent] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listChatAgents().then((d) => {
      setAgents(d.agents);
      if (d.agents.length > 0) setAgent(d.agents[0].slug);
    }).catch((e) => setErr(String(e.message)));
  }, []);

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
      const r = await ask(agent, question, history);
      setTurns((t) => [...t, {
        role: "agent", text: r.answer, citations: r.citations, grounded: r.grounded,
      }]);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const current = agents.find((a) => a.slug === agent);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col p-6">
      <PageHeader
        title="Chat"
        description="Ask any agent on the fleet. Answers come from the project brain, with what they used shown underneath."
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={agent}
          onChange={(e) => { setAgent(e.target.value); setTurns([]); }}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {agents.map((a) => <option key={a.slug} value={a.slug}>{a.displayName}</option>)}
        </select>
        {current && (
          <span className="text-xs text-muted-foreground">
            {current.role} · {current.model}
          </span>
        )}
        {/* Switching agents clears the thread, so say so rather than letting it
            look like the history was lost. */}
        {turns.length > 0 && (
          <span className="text-xs text-muted-foreground">
            · changing agent starts a new conversation
          </span>
        )}
      </div>

      {err && <Callout kind="warn" className="mt-4">{err}</Callout>}

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {current?.description || "Pick an agent and ask something about this project."}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "you" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                t.role === "you" ? "bg-primary/10" : "border border-border bg-card"
              }`}
            >
              {t.role === "you"
                ? <p className="whitespace-pre-wrap text-sm">{t.text}</p>
                : <MarkdownRenderer content={t.text} />}

              {t.role === "agent" && t.grounded === false && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Nothing in the project brain matched — this is the model’s own knowledge.
                </p>
              )}

              {/* The citations are the difference between an answer and a
                  claim. Shown by default, not behind a toggle. */}
              {t.citations && t.citations.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Grounded in {t.citations.length} memor
                    {t.citations.length === 1 ? "y" : "ies"}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {t.citations.map((c, j) => (
                      <div key={j} className="rounded-md bg-muted/40 p-2 text-xs">
                        <span className="font-mono text-muted-foreground">{c.from}</span>
                        <p className="mt-1 line-clamp-3 text-muted-foreground">{c.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleAsk} className="mt-3 flex shrink-0 gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about this project…"
          disabled={busy || agents.length === 0}
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          <Send className="size-4" />
          Ask
        </Button>
      </form>
    </div>
  );
};
Chat.displayName = "Chat";
