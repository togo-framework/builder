import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ListFilter, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
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
 *
 * Fullscreen is the real thing (Fullscreen API on the wrapper, so the toolbar
 * comes along), with a position:fixed overlay fallback for contexts that refuse
 * the API — an iframe without allowfullscreen, older Safari. The previous
 * toolbar had a Maximize2 button that only reset the zoom; a control that looks
 * like fullscreen and isn't is the operator complaint this replaces.
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
// Below this zoom only the busiest nodes are labelled (plus anything hovered,
// focused, selected or adjacent to the selection). Zoom-gating was chosen over
// a collision layout: a collision pass re-solves against the live simulation on
// every tick, so labels jitter while the graph settles, and it costs O(n²) per
// frame. Gating is stable and cheap, and every hidden label stays reachable —
// hover it, Tab to it, or zoom in.
const LABEL_ALL_ZOOM = 1.5;
const LABEL_BUDGET = 8;

type P = { x: number; y: number; vx: number; vy: number; n: BrainGraphNode };
type FsMode = "off" | "native" | "css";
type FsHost = HTMLDivElement & { webkitRequestFullscreen?: () => void };
type FsDoc = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};

const CTL_BTN =
  "p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary " +
  "disabled:pointer-events-none disabled:opacity-40";

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
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [fs, setFs] = useState<FsMode>("off");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // The kinds actually present, so the filter never offers an empty category.
  const kinds = useMemo(
    () => [...new Set(nodes.map((n) => n.kind))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.map((n) => n.kind).join(",")],
  );
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [nodes]);

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

  // Direct neighbours of the selection: they stay lit while everything else
  // dims, so "what does the agent associate with this?" is answerable at a
  // glance instead of by tracing edges.
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    for (const e of shownEdges) {
      if (e.from === selectedId) s.add(e.to);
      else if (e.to === selectedId) s.add(e.from);
    }
    return s;
  }, [selectedId, shownEdges]);

  // The nodes that keep their labels at default zoom — the busiest ones, which
  // are also the ones a reader orients by.
  const alwaysLabeled = useMemo(
    () =>
      new Set(
        [...shownNodes]
          .sort((a, b) => b.mentions - a.mentions)
          .slice(0, LABEL_BUDGET)
          .map((n) => n.id),
      ),
    [shownNodes],
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

  // Native fullscreen state lives in the document, not in React — the operator
  // can leave via Escape or the browser UI without touching our buttons, so the
  // change event is the source of truth and the button state follows it.
  useEffect(() => {
    const sync = () => {
      const doc = document as FsDoc;
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFs((cur) =>
        active === wrapRef.current ? "native" : cur === "native" ? "off" : cur,
      );
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // The CSS-overlay fallback has no browser chrome managing it, so Escape and
  // the scroll lock are ours to provide — without the lock the page scrolls
  // underneath the overlay on wheel-zoom overshoot.
  useEffect(() => {
    if (fs !== "css") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs("off");
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fs]);

  const toggleFullscreen = () => {
    if (fs !== "off") {
      if (fs === "native") {
        const doc = document as FsDoc;
        if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
        else doc.webkitExitFullscreen?.();
      }
      setFs("off");
      return;
    }
    const el = wrapRef.current as FsHost | null;
    if (!el) return;
    if (el.requestFullscreen) {
      // Refusal (iframe without allowfullscreen, permission policy) rejects the
      // promise — fall back to the fixed overlay so the control always works.
      el.requestFullscreen().then(() => setFs("native")).catch(() => setFs("css"));
    } else if (el.webkitRequestFullscreen) {
      // Legacy Safari: no promise, no rejection. Ask, then check whether it
      // actually took effect; if not, the overlay covers it.
      el.webkitRequestFullscreen();
      window.setTimeout(() => {
        const doc = document as FsDoc;
        const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
        setFs(active === el ? "native" : "css");
      }, 120);
    } else {
      setFs("css");
    }
  };

  // Pointer coordinates have to be mapped through the viewBox, or dragging
  // drifts on any screen where the SVG is not rendered at exactly SIZE px.
  // In fullscreen the rect is no longer square: preserveAspectRatio "meet"
  // letterboxes the square viewBox inside it, so the mapping must go through
  // the rendered square, not the rect — or every drag drifts sideways by half
  // the letterbox width.
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const s = Math.min(r.width, r.height);
    const vx = ((e.clientX - r.left - (r.width - s) / 2) / s) * (SIZE / zoom) + off.x;
    const vy = ((e.clientY - r.top - (r.height - s) / 2) / s) * (SIZE / zoom) + off.y;
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

  // The whole view is drivable from the SVG itself: arrows pan, +/- zoom,
  // 0 resets, F toggles fullscreen. Nodes are separate tab stops (below), so
  // this handler also receives their bubbled arrow presses — which is wanted:
  // panning while a node is focused keeps it in view.
  const handleGraphKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const step = 48 / zoom;
    if (e.key === "ArrowUp") setOff((o) => ({ ...o, y: o.y - step }));
    else if (e.key === "ArrowDown") setOff((o) => ({ ...o, y: o.y + step }));
    else if (e.key === "ArrowLeft") setOff((o) => ({ ...o, x: o.x - step }));
    else if (e.key === "ArrowRight") setOff((o) => ({ ...o, x: o.x + step }));
    else if (e.key === "+" || e.key === "=") zoomBy(1.3);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.3);
    else if (e.key === "0") reset();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else return;
    e.preventDefault();
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
  const isFs = fs !== "off";

  return (
    <div
      ref={wrapRef}
      className={`flex flex-col gap-2 ${
        fs === "css"
          ? "fixed inset-0 z-50 bg-background p-4"
          : fs === "native"
            ? "h-full bg-background p-4"
            : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Filter by kind. Toggling off a noisy category ("term" is usually the
            noisiest) is the fastest way to make a dense graph readable. */}
        <div
          role="group"
          aria-label="Filter nodes by kind"
          className="flex min-w-0 flex-wrap items-center gap-1.5"
        >
          <ListFilter aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]
                            transition-colors focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-primary ${
                              on
                                ? "border-border bg-card text-foreground hover:bg-muted"
                                : "border-dashed border-border text-muted-foreground/60 hover:text-muted-foreground"
                            }`}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: on ? (KIND_COLOR[k] ?? KIND_COLOR.term) : "currentColor" }}
                />
                {k}
                <span className="tabular-nums text-muted-foreground">{kindCounts[k]}</span>
              </button>
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          <div
            role="group"
            aria-label="Zoom"
            className="flex items-center overflow-hidden rounded-md border border-border"
          >
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.3)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              className={CTL_BTN}
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="w-12 border-x border-border px-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(1.3)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              className={CTL_BTN}
            >
              <ZoomIn className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset the view"
            title="Reset view (0)"
            className={`rounded-md border border-border ${CTL_BTN}`}
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFs ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
            className={`rounded-md border border-border ${CTL_BTN}`}
          >
            {isFs ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-lg border border-border ${
          isFs ? "min-h-0 flex-1" : ""
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={view}
          role="application"
          tabIndex={0}
          aria-label="Entity graph. Tab reaches nodes and Enter selects one. Arrow keys pan, plus and minus zoom, 0 resets the view, F toggles fullscreen."
          onKeyDown={handleGraphKey}
          className={`mx-auto block touch-none select-none focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        isFs ? "h-full w-full" : "aspect-square w-full max-w-[560px]"
                      }`}
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
              // Same letterbox correction as toLocal: scale by the rendered
              // square, not the rect, or panning lags the pointer in fullscreen.
              const k = SIZE / zoom / Math.min(r.width, r.height);
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
            // With a selection active, unrelated edges drop to near-invisible so
            // the selected node's connections are the only structure on screen.
            const faded = selectedId != null && !lit;
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="currentColor"
                strokeOpacity={lit ? 0.8 : faded ? 0.04 : 0.08 + (e.weight / maxWeight) * 0.32}
                strokeWidth={(0.5 + (e.weight / maxWeight) * 2) / Math.sqrt(zoom)}
                className={lit ? "text-primary" : "text-muted-foreground"}
              />
            );
          })}
          {[...m.values()].map((p) => {
            const id = p.n.id;
            const rad = 4 + (p.n.mentions / maxMentions) * 9;
            const sel = selectedId === id;
            const neighbor = neighborIds.has(id);
            const dimmed = selectedId != null && !sel && !neighbor;
            const revealed = sel || neighbor || hoveredId === id || focusedId === id;
            const labeled = revealed || zoom >= LABEL_ALL_ZOOM || alwaysLabeled.has(id);
            const iw = 1 / Math.sqrt(zoom); // keep stroke/label sizes constant on screen
            return (
              <g
                key={id}
                role="button"
                tabIndex={0}
                aria-label={`${p.n.name}, ${p.n.kind}, ${p.n.mentions} mention${p.n.mentions === 1 ? "" : "s"}`}
                aria-pressed={sel}
                opacity={dimmed ? 0.3 : 1}
                className="cursor-grab outline-none transition-opacity active:cursor-grabbing"
                onPointerDown={(e) => {
                  // Stop the background pan from also starting.
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const l = toLocal(e);
                  drag.current = { id, dx: p.x - l.x, dy: p.y - l.y };
                }}
                onPointerEnter={() => setHoveredId(id)}
                onPointerLeave={() => setHoveredId((h) => (h === id ? null : h))}
                onFocus={() => setFocusedId(id)}
                onBlur={() => setFocusedId((f) => (f === id ? null : f))}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(p.n);
                }}
                onKeyDown={(e) => {
                  // role="button" on SVG does not synthesise click from the
                  // keyboard the way a native button does — do it ourselves.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect?.(p.n);
                  }
                }}
              >
                {/* A wide invisible target: an 8px circle is very hard to grab. */}
                <circle cx={p.x} cy={p.y} r={Math.max(rad + 10, 16) * iw} fill="transparent" />
                {sel && (
                  <circle
                    cx={p.x} cy={p.y} r={rad + 10 * iw}
                    fill="currentColor" opacity={0.12}
                    className="text-primary"
                  />
                )}
                {sel && (
                  <circle
                    cx={p.x} cy={p.y} r={rad + 5 * iw}
                    fill="none" stroke="currentColor" strokeWidth={2.5 * iw}
                    className="text-primary"
                  />
                )}
                {!sel && neighbor && (
                  <circle
                    cx={p.x} cy={p.y} r={rad + 3.5 * iw}
                    fill="none" stroke="currentColor" strokeWidth={1.5 * iw}
                    strokeOpacity={0.55}
                    className="text-primary"
                  />
                )}
                {focusedId === id && !sel && (
                  <circle
                    cx={p.x} cy={p.y} r={rad + 6 * iw}
                    fill="none" stroke="currentColor" strokeWidth={1.5 * iw}
                    strokeDasharray={`${3 * iw} ${2 * iw}`}
                    className="text-primary"
                  />
                )}
                <circle
                  cx={p.x} cy={p.y} r={rad}
                  fill={KIND_COLOR[p.n.kind] ?? KIND_COLOR.term}
                />
                <title>{`${p.n.name} — ${p.n.kind}, mentioned ${p.n.mentions}×`}</title>
                {labeled && (
                  <text
                    x={p.x} y={p.y - rad - 5 * iw}
                    textAnchor="middle"
                    className={`pointer-events-none fill-current ${
                      revealed ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                    style={{ fontSize: `${9 * iw}px` }}
                  >
                    {p.n.name.length > 22 ? p.n.name.slice(0, 21) + "…" : p.n.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Click or press Enter on a node to read its memories · drag to move it · drag
        the background to pan · scroll or +/− to zoom · F for fullscreen
        {isFs && " · Esc exits"}
      </p>
    </div>
  );
};
BrainGraph.displayName = "BrainGraph";
