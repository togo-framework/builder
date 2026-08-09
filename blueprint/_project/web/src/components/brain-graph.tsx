import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { BrainGraphEdge, BrainGraphNode } from "../lib/agents";

/**
 * The entity graph, drawn, movable and interrogable.
 *
 * A ring layout showed the nodes but not the structure: with every node
 * equidistant, a tight cluster and an unrelated pair look identical. A short
 * force relaxation lets connected entities pull together, so what the agent
 * associates becomes visible as shape rather than as a count of lines.
 *
 * The simulation is deliberately finite — a few hundred ticks with cooling,
 * then it stops. Getting that to actually stop took a fix: the effects keyed on
 * the `nodes`/`edges` ARRAY IDENTITY, and the parent passes
 * `brain.graph?.nodes ?? []`, which mints a fresh array on every render. Each
 * render re-seeded the layout, which called force(), which re-rendered — a
 * permanent animation and a permanent render loop, from a `??`. They key on a
 * content signature now, so the sim restarts only when the graph really changes.
 */
const KIND_COLOR: Record<string, string> = {
  file: "#38bdf8",
  symbol: "#a78bfa",
  issue: "#fbbf24",
  agent: "#34d399",
  area: "#f472b6",
  term: "#94a3b8",
};

const SIZE = 480;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;

type P = { x: number; y: number; vx: number; vy: number; n: BrainGraphNode };

export const BrainGraph = ({
  nodes,
  edges,
  onSelect,
  selectedId,
}: {
  nodes: BrainGraphNode[];
  edges: BrainGraphEdge[];
  onSelect?: (node: BrainGraphNode) => void;
  selectedId?: string | null;
}) => {
  const [, force] = useState(0);
  const pts = useRef<Map<string, P>>(new Map());
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // The kinds actually present, so the filter never offers an empty category.
  const kinds = useMemo(
    () => [...new Set(nodes.map((n) => n.kind))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.map((n) => n.kind).join(",")],
  );

  const shownNodes = useMemo(
    () => nodes.filter((n) => !hidden.has(n.kind)),
    [nodes, hidden],
  );
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes]);
  const shownEdges = useMemo(
    () => edges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to)),
    [edges, shownIds],
  );

  // THE fix for the endless animation. `nodes` is a new array on every parent
  // render; its contents are not. Keying the simulation on the contents means a
  // re-render no longer restarts it.
  const nodeSig = useMemo(() => shownNodes.map((n) => n.id).join("|"), [shownNodes]);
  const edgeSig = useMemo(
    () => shownEdges.map((e) => `${e.from}>${e.to}:${e.weight}`).join("|"),
    [shownEdges],
  );

  const maxMentions = useMemo(
    () => Math.max(1, ...shownNodes.map((n) => n.mentions)),
    [shownNodes],
  );
  const maxWeight = useMemo(
    () => Math.max(1, ...shownEdges.map((e) => e.weight)),
    [shownEdges],
  );

  // Seed on a ring, then let the simulation sort it out. Seeding at the centre
  // makes the first ticks explode as everything repels from one point. Nodes
  // already placed keep their position, so toggling a filter does not throw
  // away a layout the operator has been reading.
  useEffect(() => {
    const prev = pts.current;
    const m = new Map<string, P>();
    shownNodes.forEach((n, i) => {
      const kept = prev.get(n.id);
      if (kept) {
        m.set(n.id, { ...kept, n });
        return;
      }
      const a = (i / Math.max(1, shownNodes.length)) * Math.PI * 2;
      m.set(n.id, {
        x: SIZE / 2 + Math.cos(a) * (SIZE / 3),
        y: SIZE / 2 + Math.sin(a) * (SIZE / 3),
        vx: 0,
        vy: 0,
        n,
      });
    });
    pts.current = m;
    force((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig]);

  useEffect(() => {
    if (shownNodes.length === 0) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;
    // Reduced motion still gets the layout, computed instantly — the point is
    // the arrangement, and only the animation is the accessibility problem.
    const total = reduced ? 1 : 260;

    const tick = () => {
      const m = pts.current;
      const alpha = reduced ? 0 : 1 - frame / total; // cool towards stillness

      const step = () => {
        // Repulsion, so labels do not stack.
        const arr = [...m.values()];
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i], b = arr[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
            const f = 900 / d2;
            const d = Math.sqrt(d2);
            a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
            b.vx += (dx / d) * f; b.vy += (dy / d) * f;
          }
        }
        // Attraction along edges, weighted by how often the two co-occur.
        for (const e of shownEdges) {
          const a = m.get(e.from), b = m.get(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - 90) * 0.0016 * (0.4 + (e.weight / maxWeight) * 0.6);
          a.vx += (dx / d) * f * d; a.vy += (dy / d) * f * d;
          b.vx -= (dx / d) * f * d; b.vy -= (dy / d) * f * d;
        }
        // Gentle pull to centre, so a disconnected node does not drift away.
        for (const p of m.values()) {
          p.vx += (SIZE / 2 - p.x) * 0.002;
          p.vy += (SIZE / 2 - p.y) * 0.002;
        }
        for (const [id, p] of m) {
          // A node held by the pointer is pinned: the operator's hand outranks
          // the simulation, or dragging fights the layout.
          if (drag.current?.id === id) { p.vx = 0; p.vy = 0; continue; }
          p.vx *= 0.82; p.vy *= 0.82;
          p.x = Math.max(24, Math.min(SIZE - 24, p.x + p.vx * (0.2 + alpha)));
          p.y = Math.max(24, Math.min(SIZE - 24, p.y + p.vy * (0.2 + alpha)));
        }
      };

      if (reduced) { for (let k = 0; k < 200; k++) step(); }
      else step();

      force((v) => v + 1);
      frame++;
      if (frame < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Content signatures, NOT the arrays. See the note at the top of the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig, edgeSig, maxWeight]);

  // Pointer coordinates have to be mapped through the viewBox, or dragging
  // drifts on any screen where the SVG is not rendered at exactly SIZE px.
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const vx = ((e.clientX - r.left) / r.width) * (SIZE / zoom) + off.x;
    const vy = ((e.clientY - r.top) / r.height) * (SIZE / zoom) + off.y;
    return { x: vx, y: vy };
  };

  const zoomBy = (factor: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      // Keep the centre of the view fixed while zooming, or the graph appears
      // to run away towards the origin.
      setOff((o) => {
        const cx = o.x + SIZE / z / 2;
        const cy = o.y + SIZE / z / 2;
        return { x: cx - SIZE / next / 2, y: cy - SIZE / next / 2 };
      });
      return next;
    });
  };

  const reset = () => {
    setZoom(1);
    setOff({ x: 0, y: 0 });
  };

  if (nodes.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No entities yet. The graph fills in as the agent records what it learns.
      </p>
    );
  }

  const m = pts.current;
  const view = `${off.x} ${off.y} ${SIZE / zoom} ${SIZE / zoom}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Filter by kind. Toggling off a noisy category ("term" is usually the
            noisiest) is the fastest way to make a dense graph readable. */}
        {kinds.map((k) => {
          const on = !hidden.has(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })
              }
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]
                          transition-colors ${
                            on
                              ? "border-border text-foreground"
                              : "border-transparent text-muted-foreground/50 line-through"
                          }`}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: on ? (KIND_COLOR[k] ?? KIND_COLOR.term) : "currentColor" }}
              />
              {k}
            </button>
          );
        })}

        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.3)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.3)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset the view"
            className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <svg
          ref={svgRef}
          viewBox={view}
          className="mx-auto block aspect-square w-full max-w-[480px] touch-none select-none"
          onWheel={(e) => {
            // No preventDefault: React attaches wheel passively, and calling it
            // throws. Zoom still works; the page may also scroll, which is the
            // lesser evil against a console full of errors.
            zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
          }}
          onPointerDown={(e) => {
            // Empty space starts a pan. Nodes stop propagation, so this only
            // fires on the background.
            pan.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              const p = m.get(drag.current.id);
              if (!p) return;
              const l = toLocal(e);
              p.x = l.x + drag.current.dx;
              p.y = l.y + drag.current.dy;
              force((v) => v + 1);
              return;
            }
            if (pan.current) {
              const r = svgRef.current?.getBoundingClientRect();
              if (!r) return;
              const k = SIZE / zoom / r.width;
              setOff({
                x: pan.current.ox - (e.clientX - pan.current.x) * k,
                y: pan.current.oy - (e.clientY - pan.current.y) * k,
              });
            }
          }}
          onPointerUp={() => { drag.current = null; pan.current = null; }}
          onPointerLeave={() => { drag.current = null; pan.current = null; }}
        >
          {shownEdges.map((e, i) => {
            const a = m.get(e.from), b = m.get(e.to);
            if (!a || !b) return null;
            const lit = selectedId === e.from || selectedId === e.to;
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="currentColor"
                strokeOpacity={lit ? 0.7 : 0.08 + (e.weight / maxWeight) * 0.32}
                strokeWidth={(0.5 + (e.weight / maxWeight) * 2) / Math.sqrt(zoom)}
                className={lit ? "text-primary" : "text-muted-foreground"}
              />
            );
          })}
          {[...m.values()].map((p) => {
            const rad = 4 + (p.n.mentions / maxMentions) * 9;
            const sel = selectedId === p.n.id;
            return (
              <g
                key={p.n.id}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  // Stop the background pan from also starting.
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const l = toLocal(e);
                  drag.current = { id: p.n.id, dx: p.x - l.x, dy: p.y - l.y };
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(p.n);
                }}
              >
                {/* A wide invisible target: an 8px circle is very hard to grab. */}
                <circle cx={p.x} cy={p.y} r={Math.max(rad + 10, 16) / Math.sqrt(zoom)} fill="transparent" />
                {sel && (
                  <circle
                    cx={p.x} cy={p.y} r={rad + 5 / Math.sqrt(zoom)}
                    fill="none" stroke="currentColor" strokeWidth={2 / Math.sqrt(zoom)}
                    className="text-primary"
                  />
                )}
                <circle
                  cx={p.x} cy={p.y} r={rad}
                  fill={KIND_COLOR[p.n.kind] ?? KIND_COLOR.term}
                />
                <title>{`${p.n.name} — ${p.n.kind}, mentioned ${p.n.mentions}×`}</title>
                <text
                  x={p.x} y={p.y - rad - 4}
                  textAnchor="middle"
                  className="pointer-events-none fill-current text-muted-foreground"
                  style={{ fontSize: `${9 / Math.sqrt(zoom)}px` }}
                >
                  {p.n.name.length > 22 ? p.n.name.slice(0, 21) + "…" : p.n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Click a node to read its memories · drag to move it · drag the background
        to pan · scroll to zoom
      </p>
    </div>
  );
};
BrainGraph.displayName = "BrainGraph";
