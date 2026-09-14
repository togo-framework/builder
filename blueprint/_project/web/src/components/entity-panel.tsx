import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Callout, StatusBadge } from "@togo-framework/ui";
import { fetchEntity, type EntityDetail } from "../lib/agents";

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/**
 * One graph node, opened.
 *
 * The graph was a picture you could rearrange but not question — a dot labelled
 * "claim.go" mentioned nine times, with no way to see which nine things the
 * agent remembers about it. This is that answer, and it is a slide-over rather
 * than an inline block so the graph stays on screen underneath it: the
 * neighbours listed here are the ones you are looking at.
 */
export const EntityPanel = ({
  slug,
  entityId,
  onClose,
  onOpenEntity,
}: {
  slug: string;
  entityId: string;
  onClose: () => void;
  onOpenEntity: (id: string) => void;
}) => {
  const [d, setD] = useState<EntityDetail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setD(null);
    setErr("");
    fetchEntity(slug, entityId)
      .then(setD)
      .catch((e: Error) => setErr(e.message));
  }, [slug, entityId]);

  // Escape closes it. A panel that covers content and traps you is worse than
  // no panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150 motion-reduce:animate-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={d ? `Entity ${d.name}` : "Entity"}
        className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col gap-3 overflow-y-auto
                   border-s border-border bg-card p-4
                   animate-in slide-in-from-right duration-200 motion-reduce:animate-none"
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-sm font-semibold">
              {d?.name ?? "Loading…"}
            </h2>
            {d && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <StatusBadge tone="neutral">{d.kind}</StatusBadge>
                <span>mentioned {d.mentions}×</span>
                <span>last seen {ago(d.lastSeen)}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        {err && <Callout kind="warn" title="Could not open this entity">{err}</Callout>}

        {d && (
          <>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Memories — {d.memories.length}
              </h3>
              {d.memories.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This entity is in the graph but no live memory references it —
                  every memory that mentioned it has since been superseded.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {d.memories.map((mem) => (
                    <article
                      key={mem.id}
                      className="rounded-lg border border-border p-2.5 text-xs"
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{mem.content}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {mem.sourceKind && (
                          <span className="font-mono">{mem.sourceKind}</span>
                        )}
                        {mem.sourceRef && (
                          <span className="truncate font-mono">{mem.sourceRef}</span>
                        )}
                        <span className="ms-auto shrink-0">{ago(mem.createdAt)}</span>
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {d.neighbours.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Related
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {d.neighbours.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => onOpenEntity(n.id)}
                      title={`co-occurs ${n.weight}×`}
                      className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px]
                                 text-muted-foreground transition-colors hover:border-primary/60
                                 hover:text-foreground"
                    >
                      {n.name}
                      <span className="ms-1 opacity-60">{n.weight}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </aside>
    </>
  );
};
EntityPanel.displayName = "EntityPanel";
