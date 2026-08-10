import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Link2,
  ListFilter,
  Maximize2,
  Minimize2,
  RotateCcw,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { BrainGraphEdge, BrainGraphNode } from "../lib/agents";

/**
 * The entity graph, drawn, movable and interrogable.
 *
 * The shape of the problem: a real project brain is ~60 entities and ~400
 * links, and three quarters of those links are the weakest tier (seen together
 * once). Drawn as straight lines at a readable opacity that is not a graph, it
 * is a grey disc. Everything below is in service of making 400 links legible
 * rather than making them faint enough to ignore.
 *
 *   Density. Links are quadratic arcs, not segments. Two nodes with several
 *   paths between them separate visually instead of stacking on one pixel row,
 *   and a bowed line is traceable by eye across a crossing where a straight one
 *   is not. Base opacity is deliberately low and scaled by weight, so the mass
 *   reads as texture and the strong links read as structure.
 *
 *   Focus. Hover, keyboard focus or selection makes a node ACTIVE. Its incident
 *   links are redrawn on a layer above everything else at full strength in the
 *   accent colour; every other link drops to near nothing. That is the answer to
 *   "what does the brain connect this to" — one gesture, no tracing.
 *
 *   Cutting. A minimum-strength control drops the weak tier. At >=2 the same
 *   graph is 95 links over 60 nodes, which is a diagram. The default is 1
 *   because the default must show what is actually there.
 *
 *   Labels. Text is placed by a greedy pass in view space: candidates are
 *   ordered (active and its neighbours, then busiest) and a label is drawn only
 *   if its box misses every box already placed. Nothing overlaps. Suppressed
 *   labels stay reachable by hover, Tab or zoom. The pass runs on the settled
 *   layout, which is the only layout there is — see below.
 *
 *   Stillness. There is no entrance animation. The force layout is solved to
 *   convergence inside a LAYOUT effect, before the browser paints, so the first
 *   frame the operator sees is the finished graph. A simulation shaking itself
 *   apart and back together says nothing the settled arrangement does not; it
 *   is a second of unreadable motion charged on every open. The arrangement is
 *   the information, the journey to it is not. This used to be the
 *   prefers-reduced-motion branch; it is now the only branch, for everyone.
 *
 * Direction: the payload is co-occurrence, `from`/`to` are an arbitrary storage
 * order, and there is not one reciprocal pair in it. Drawing arrowheads on that
 * would assert a claim the data does not make, so arrowheads appear only if the
 * edge list ever actually contains a reciprocal pair — the one signal that the
 * producer means the pair to be read as directed.
 *
 * Fullscreen is the real thing (Fullscreen API on the wrapper, so the toolbar
 * comes along) with a position:fixed overlay fallback for contexts that refuse
 * the API. The part that made the previous fullscreen feel broken was not the
 * request, it was the viewBox: a fixed square viewBox inside a 16:9 element is
 * letterboxed by preserveAspectRatio, so "fullscreen" produced a small square
 * marooned between two black bars. The viewBox is now derived from the measured
 * element, the layout world widens to match, and the graph re-settles into the
 * space it was given.
 *
 * The endless-animation fix is kept: the effects key on a CONTENT SIGNATURE of
 * the nodes and edges, never on array identity. The parent passes
 * `brain.graph?.nodes ?? []`, which mints a fresh array on every render; keying
 * on it re-seeded the layout, which called force(), which re-rendered — a
 * permanent animation loop out of a `??`.
 */
const KIND_COLOR: Record<string, string> = {
  file: "#38bdf8",
  symbol: "#a78bfa",
  issue: "#fbbf24",
  agent: "#34d399",
  area: "#f472b6",
  term: "#94a3b8",
};

/** World height in user units. Width is this times the measured aspect ratio. */
const SIZE = 480;
const PAD = 26;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
/** How wide/narrow the layout world is allowed to get, whatever the element does. */
const MIN_AR = 0.7;
const MAX_AR = 2.6;
/** Layout iterations solved before the first paint. There is no second pass. */
const TICKS = 240;
/** Longest label drawn before an ellipsis. Names top out at 27 characters. */
const LABEL_CHARS = 22;

type P = { x: number; y: number; vx: number; vy: number; n: BrainGraphNode };
type View = { z: number; x: number; y: number };
type Box = { w: number; h: number };
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

const CHIP =
  "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** FNV-1a. Only used to give each link a stable, arbitrary-looking bow. */
const hash32 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Quadratic arc from a to b, bowed by k of its own length. */
const arc = (ax: number, ay: number, bx: number, by: number, k: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  return `M${ax.toFixed(1)} ${ay.toFixed(1)}Q${(( ax + bx) / 2 - dy * k).toFixed(1)} ${
    ((ay + by) / 2 + dx * k).toFixed(1)
  } ${bx.toFixed(1)} ${by.toFixed(1)}`;
};

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
  const uid = useId().replace(/:/g, "");
  const [, force] = useState(0);
  const redraw = () => force((v) => v + 1);

  const pts = useRef<Map<string, P>>(new Map());
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef(SIZE);

  // One object, so a zoom never has to call setState from inside another
  // setState updater — that read a stale zoom under StrictMode's double
  // invocation and made wheel-zoom drift off centre.
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [minWeight, setMinWeight] = useState(1);
  const [fs, setFs] = useState<FsMode>("off");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // The world is a rectangle shaped like the element it is drawn into, so the
  // viewBox never needs letterboxing and fullscreen is genuinely wider rather
  // than merely larger.
  const ar = useMemo(() => {
    if (box.w <= 0 || box.h <= 0) return 1;
    return clamp(Math.round((box.w / box.h) * 20) / 20, MIN_AR, MAX_AR);
  }, [box.w, box.h]);
  const worldW = SIZE * ar;
  const worldH = SIZE;

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

  // The weight tiers the data actually has, so the strength control never
  // offers a cut that removes everything.
  const weightTiers = useMemo(() => {
    const max = Math.max(1, ...edges.map((e) => e.weight));
    return Array.from({ length: Math.min(max, 4) }, (_, i) => i + 1);
  }, [edges]);
  const maxWeight = weightTiers[weightTiers.length - 1] ?? 1;

  const shownNodes = useMemo(() => nodes.filter((n) => !hidden.has(n.kind)), [nodes, hidden]);
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes]);
  const shownEdges = useMemo(
    () =>
      edges.filter(
        (e) => e.weight >= minWeight && shownIds.has(e.from) && shownIds.has(e.to),
      ),
    [edges, shownIds, minWeight],
  );

  // Content signatures, never array identity. See the note at the top.
  const nodeSig = useMemo(() => shownNodes.map((n) => n.id).join("|"), [shownNodes]);
  const edgeSig = useMemo(
    () => shownEdges.map((e) => `${e.from}>${e.to}:${e.weight}`).join("|"),
    [shownEdges],
  );

  // A stable bow per link, so arcs do not reshuffle between frames.
  const arcs = useMemo(
    () => shownEdges.map((e) => ({ e, k: 0.11 + (hash32(`${e.from}>${e.to}`) % 9) / 100 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edgeSig],
  );

  // Arrowheads only if the producer ever emits a pair in both directions.
  const directed = useMemo(() => {
    const seen = new Set(edges.map((e) => `${e.from} ${e.to}`));
    return edges.some((e) => seen.has(`${e.to} ${e.from}`));
  }, [edges]);

  const maxMentions = useMemo(
    () => Math.max(1, ...shownNodes.map((n) => n.mentions)),
    [shownNodes],
  );

  // Hover previews, focus follows the keyboard, selection persists — in that
  // order, so pointing at a second node answers a question about it without
  // throwing away the selection behind it.
  const activeId = hoveredId ?? focusedId ?? selectedId ?? null;

  const relatedIds = useMemo(() => {
    const s = new Set<string>();
    if (!activeId) return s;
    for (const e of shownEdges) {
      if (e.from === activeId) s.add(e.to);
      else if (e.to === activeId) s.add(e.from);
    }
    return s;
  }, [activeId, shownEdges]);

  const degrees = useMemo(() => {
    const d: Record<string, number> = {};
    for (const e of shownEdges) {
      d[e.from] = (d[e.from] ?? 0) + 1;
      d[e.to] = (d[e.to] ?? 0) + 1;
    }
    return d;
  }, [shownEdges]);

  // Measure the drawing surface. Everything downstream — viewBox, world shape,
  // pointer mapping, constant-on-screen stroke widths — is derived from it.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const apply = (w: number, h: number) =>
      setBox((b) => (Math.abs(b.w - w) < 1 && Math.abs(b.h - h) < 1 ? b : { w, h }));
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) apply(r.width, r.height);
    });
    ro.observe(el);
    const r0 = el.getBoundingClientRect();
    apply(r0.width, r0.height);
    return () => ro.disconnect();
  }, []);

  // Seed on a ring — seeding at the centre makes the first ticks explode as
  // everything repels from one point. Nodes already placed keep their position,
  // so toggling a filter or going fullscreen does not throw away a layout the
  // operator was reading. When the world changes shape the kept points are
  // TRANSLATED, not scaled: scaling by the width ratio stretches the layout
  // into a diagonal smear that 200 cooling ticks cannot undo, which is what
  // made the first fullscreen re-settle look like a different graph.
  //
  // A layout effect, not an effect: seeding and solving both have to happen
  // before the browser paints, or the operator sees the ring.
  useLayoutEffect(() => {
    const prev = pts.current;
    const shift = (worldW - worldRef.current) / 2;
    worldRef.current = worldW;
    const next = new Map<string, P>();
    shownNodes.forEach((n, i) => {
      const kept = prev.get(n.id);
      if (kept) {
        next.set(n.id, { ...kept, x: kept.x + shift, n });
        return;
      }
      const a = (i / Math.max(1, shownNodes.length)) * Math.PI * 2;
      next.set(n.id, {
        x: worldW / 2 + Math.cos(a) * (worldW / 3),
        y: worldH / 2 + Math.sin(a) * (worldH / 3),
        vx: 0,
        vy: 0,
        n,
      });
    });
    pts.current = next;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig, worldW]);

  // Solve, do not animate. Every tick runs inside this layout effect, so the
  // whole simulation is over before the first paint and the graph arrives
  // stationary. No requestAnimationFrame, no per-frame redraw, no cooling in
  // public — one redraw at the end, with the answer.
  useLayoutEffect(() => {
    if (shownNodes.length === 0) return;

    const cx = worldW / 2;
    const cy = worldH / 2;
    // Repulsion grows with the world, but sub-linearly. Scaling it linearly
    // (with gravity weakened to match) flung the periphery onto the clamp and
    // left a ring of nodes stuck to the frame edge. Gravity below stays firm
    // and the fit pass afterwards is what actually uses the extra room.
    const repel = 900 * Math.sqrt(Math.max(1, worldW / SIZE));

    const step = (alpha: number) => {
      const m = pts.current;
      const arr = [...m.values()];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            d2 = 1;
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
          }
          const f = repel / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * f;
          a.vy -= (dy / d) * f;
          b.vx += (dx / d) * f;
          b.vy += (dy / d) * f;
        }
      }
      // Attraction along links, weighted by how often the two co-occur.
      for (const e of shownEdges) {
        const a = m.get(e.from);
        const b = m.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 86) * 0.0016 * (0.4 + (e.weight / maxWeight) * 0.6);
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      // Gravity towards the middle, a little slacker across the long axis so a
      // wide canvas produces a wide layout rather than a disc with margins.
      for (const p of m.values()) {
        p.vx += (cx - p.x) * (0.0026 / Math.sqrt(ar));
        p.vy += (cy - p.y) * 0.0026;
      }
      for (const [id, p] of m) {
        // A node under the pointer is pinned: the operator's hand outranks the
        // simulation, or dragging fights the layout.
        if (drag.current?.id === id) {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = clamp(p.x + p.vx * (0.2 + alpha), PAD, worldW - PAD);
        p.y = clamp(p.y + p.vy * (0.2 + alpha), PAD, worldH - PAD);
      }
    };

    // Gravity decides the layout's shape; this decides how much of the canvas
    // it gets to use. Fitting the settled bounding box into the frame is what
    // opens up a congested core — every gap grows while the nodes stay the
    // size they were, which is precisely the trade a dense graph wants. It runs
    // once, at the end: doing it per tick makes a feedback loop (fit shrinks
    // distances, repulsion is 1/d², so it expands again) that never settles.
    const fitToFrame = () => {
      const arr = [...pts.current.values()];
      if (arr.length < 2 || drag.current) return;
      // Fit the TRIMMED extent, not the full bounding box. Three unconnected
      // singletons parked in the corners will stretch a true bbox across the
      // whole frame, the fit then scales by ~1, and the crowded middle — the
      // part that actually needed the room — never opens up. Discarding a few
      // extremes per axis targets the mass instead; the discarded ones are
      // clamped back inside afterwards.
      const span = (vals: number[], trim: number) => {
        const s = vals.sort((a, b) => a - b);
        return [s[trim], s[s.length - 1 - trim]] as const;
      };
      const trim = Math.min(3, Math.floor(arr.length * 0.06));
      const [minX, maxX] = span(arr.map((p) => p.x), trim);
      const [minY, maxY] = span(arr.map((p) => p.y), trim);
      const w = Math.max(maxX - minX, 1);
      const h = Math.max(maxY - minY, 1);
      // Uniform, so the shape of the layout — which is the information — is not
      // distorted to fill a rectangle. Capped, so a two-node graph does not fly
      // to opposite corners.
      const s = Math.min((worldW - PAD * 2) / w, (worldH - PAD * 2) / h, 2.6);
      const dx = (worldW - w * s) / 2 - minX * s;
      const dy = (worldH - h * s) / 2 - minY * s;
      for (const p of arr) {
        p.x = clamp(p.x * s + dx, PAD, worldW - PAD);
        p.y = clamp(p.y * s + dy, PAD, worldH - PAD);
        p.vx = 0;
        p.vy = 0;
      }
    };

    // The same cooling schedule the animation used to walk through a frame at a
    // time, walked through in one go. The destination is identical — only the
    // spectacle is gone.
    for (let k = 0; k < TICKS; k++) step(1 - k / TICKS);
    fitToFrame();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig, edgeSig, maxWeight, worldW]);

  // Native fullscreen state lives in the document, not in React — the operator
  // can leave via Escape or the browser UI without touching our buttons, so the
  // change event is the source of truth and the button follows it.
  useEffect(() => {
    const sync = () => {
      const doc = document as FsDoc;
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFs((cur) => (active === wrapRef.current ? "native" : cur === "native" ? "off" : cur));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // Escape leaves, in both modes. The overlay fallback has no browser chrome
  // managing it, so Escape there is entirely ours. Native fullscreen is
  // normally exited by the UA itself — but it does that at the chrome level,
  // an embedder can swallow it, and "press Esc" is written on the control, so
  // we ask as well. The guard keeps the second ask from rejecting on a document
  // that has already left, and the fullscreenchange listener above reconciles
  // the button whichever of the two got there first.
  //
  // The scroll lock is only for the overlay: without it the page scrolls
  // underneath on a wheel-zoom overshoot.
  useEffect(() => {
    if (fs === "off") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fs === "css") {
        setFs("off");
        return;
      }
      const doc = document as FsDoc;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    if (fs !== "css") return () => window.removeEventListener("keydown", onKey);
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
      // Refusal (iframe without allowfullscreen, a permissions policy) rejects
      // the promise — fall back to the overlay so the control always works.
      el.requestFullscreen()
        .then(() => setFs("native"))
        .catch(() => setFs("css"));
    } else if (el.webkitRequestFullscreen) {
      // Legacy Safari: no promise, no rejection. Ask, then check.
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

  const viewW = worldW / view.z;
  const viewH = worldH / view.z;
  /** World units per screen pixel — for anything that must not grow with zoom. */
  const u = box.h > 0 ? viewH / box.h : 1;

  // Panning is clamped loosely: the world must keep overlapping the view, so
  // the graph can never be flicked off screen and lost. 0 resets regardless.
  const clampView = (v: View): View => {
    const vw = worldW / v.z;
    const vh = worldH / v.z;
    return {
      z: v.z,
      x: clamp(v.x, -vw * 0.6, worldW - vw * 0.4),
      y: clamp(v.y, -vh * 0.6, worldH - vh * 0.4),
    };
  };

  /** Zoom about a point given in 0..1 of the element, default its centre. */
  const zoomBy = (factor: number, fx = 0.5, fy = 0.5) =>
    setView((v) => {
      const z = clamp(v.z * factor, MIN_ZOOM, MAX_ZOOM);
      if (z === v.z) return v;
      const wx = v.x + (worldW / v.z) * fx;
      const wy = v.y + (worldH / v.z) * fy;
      return clampView({ z, x: wx - (worldW / z) * fx, y: wy - (worldH / z) * fy });
    });

  const reset = () => setView({ z: 1, x: 0, y: 0 });

  // Pointer to world. The viewBox now matches the element's aspect exactly, so
  // this is a straight linear map — no letterbox correction, which is what the
  // old square-viewBox drag drift came from.
  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: view.x + ((e.clientX - r.left) / r.width) * viewW,
      y: view.y + ((e.clientY - r.top) / r.height) * viewH,
    };
  };

  // The whole view is drivable from the SVG: arrows pan, +/- zoom, 0 resets,
  // F toggles fullscreen. Nodes are separate tab stops, so this also receives
  // their bubbled arrow presses — which is wanted: panning while a node is
  // focused keeps it in view.
  const handleGraphKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const stepPx = viewW * 0.12;
    if (e.key === "ArrowUp") setView((v) => clampView({ ...v, y: v.y - stepPx }));
    else if (e.key === "ArrowDown") setView((v) => clampView({ ...v, y: v.y + stepPx }));
    else if (e.key === "ArrowLeft") setView((v) => clampView({ ...v, x: v.x - stepPx }));
    else if (e.key === "ArrowRight") setView((v) => clampView({ ...v, x: v.x + stepPx }));
    else if (e.key === "+" || e.key === "=") zoomBy(1.3);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.3);
    else if (e.key === "0") reset();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else return;
    e.preventDefault();
  };

  const radiusOf = (n: BrainGraphNode) => 4 + (n.mentions / maxMentions) * 9;

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
        <Waypoints aria-hidden className="size-6 text-muted-foreground/70" />
        <p className="text-sm font-medium">Nothing connected yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          The graph draws itself as the agent records entities and notices which of
          them keep turning up together.
        </p>
      </div>
    );
  }

  const m = pts.current;
  const isFs = fs !== "off";
  const nothingShown = shownNodes.length === 0;

  // Greedy label placement in view space. Ordered so the answer to the current
  // question wins the space, then the busiest nodes, then a stable tiebreak so
  // a settled graph does not flicker. A candidate is drawn only if its box
  // misses every box already placed — that is the whole collision story.
  const placed = new Set<string>();
  {
    const cands = [...m.values()]
      .filter((p) => {
        const r = radiusOf(p.n) + 30 * u;
        return (
          p.x + r >= view.x &&
          p.x - r <= view.x + viewW &&
          p.y + r >= view.y &&
          p.y - r <= view.y + viewH
        );
      })
      .map((p) => {
        const id = p.n.id;
        const rank = id === activeId ? 0 : relatedIds.has(id) ? 1 : id === selectedId ? 2 : 3;
        return { p, rank };
      })
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          b.p.n.mentions - a.p.n.mentions ||
          (degrees[b.p.n.id] ?? 0) - (degrees[a.p.n.id] ?? 0) ||
          (a.p.n.id < b.p.n.id ? -1 : 1),
      );

    const taken: number[][] = [];
    const fontUnits = 10.5 * u;
    // The box is estimated from the character count rather than measured — a
    // real measurement means a getBBox() per candidate per frame, which forces
    // a layout flush 60 times a second. 0.6em per character is generous for the
    // UI face, and GAP absorbs what the estimate gets wrong, so "no overlap"
    // holds in pixels and not only in arithmetic.
    const GAP = 3 * u;
    // No budget: there is no settling phase left to ration labels through, so
    // every candidate that fits gets its name from the first frame onwards.
    for (const { p } of cands) {
      const chars = Math.min(p.n.name.length, LABEL_CHARS + 1);
      const w = chars * fontUnits * 0.6;
      const h = fontUnits * 1.2;
      const x = p.x - w / 2;
      const y = p.y - radiusOf(p.n) - 4 * u - h;
      let hits = false;
      for (const t of taken) {
        if (
          x < t[0] + t[2] + GAP &&
          x + w + GAP > t[0] &&
          y < t[1] + t[3] + GAP &&
          y + h + GAP > t[1]
        ) {
          hits = true;
          break;
        }
      }
      if (hits) continue;
      taken.push([x, y, w, h]);
      placed.add(p.n.id);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`flex flex-col gap-2 ${
        isFs ? "fixed inset-0 z-50 bg-background p-3 sm:p-4" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Filter by kind. Dropping the noisiest category is the fastest way to
            make a dense graph readable, and the count says how much it costs. */}
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
                className={`${CHIP} ${
                  on
                    ? "border-border bg-card text-foreground hover:bg-muted"
                    : "border-dashed border-border text-muted-foreground/60 hover:text-muted-foreground"
                }`}
              >
                <span
                  className="inline-block size-2 rounded-pill"
                  style={{ background: on ? (KIND_COLOR[k] ?? KIND_COLOR.term) : "currentColor" }}
                />
                {k}
                <span className="tabular-nums text-muted-foreground">{kindCounts[k]}</span>
              </button>
            );
          })}
        </div>

        {/* The scalpel for density. Most links in a real brain are the weakest
            tier; cutting them turns a hairball into a diagram without hiding
            that they exist — the count beside it always tells the truth. */}
        {weightTiers.length > 1 && (
          <div
            role="group"
            aria-label="Minimum link strength"
            className="flex min-w-0 items-center gap-1.5"
          >
            <Link2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="flex items-center overflow-hidden rounded-field border border-border">
              {weightTiers.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={minWeight === w}
                  aria-label={`Show links seen at least ${w} time${w === 1 ? "" : "s"}`}
                  onClick={() => setMinWeight(w)}
                  // "≥" is bidi-neutral, so in an Arabic paragraph it flips
                  // behind the digit and the control reads "1≥". Same reason
                  // the page pins its identifiers LTR.
                  dir="ltr"
                  className={`px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset
                              focus-visible:ring-primary ${
                                minWeight === w
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                >
                  {`≥${w}`}
                </button>
              ))}
            </div>
            <span
              dir="ltr"
              className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
            >
              {shownEdges.length}/{edges.length} links
            </span>
          </div>
        )}

        <div className="ms-auto flex items-center gap-1.5">
          <div
            role="group"
            aria-label="Zoom"
            className="flex items-center overflow-hidden rounded-field border border-border"
          >
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.3)}
              disabled={view.z <= MIN_ZOOM}
              aria-label="Zoom out"
              className={CTL_BTN}
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="w-12 border-x border-border px-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.round(view.z * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(1.3)}
              disabled={view.z >= MAX_ZOOM}
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
            className={`rounded-field border border-border ${CTL_BTN}`}
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={isFs}
            title={isFs ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
            className={`rounded-field border border-border ${CTL_BTN}`}
          >
            {isFs ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-card border border-border bg-card ${
          isFs ? "min-h-0 flex-1" : ""
        }`}
      >
        <svg
          ref={svgRef}
          // Direction is pinned on the canvas: the chrome above mirrors under
          // Arabic, the drawing must not — mirroring it would flip a layout the
          // operator has been reading. (`dir` is not in React's SVG prop types;
          // the CSS property is the same switch and does type.)
          style={{ direction: "ltr" }}
          viewBox={`${view.x} ${view.y} ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          role="application"
          tabIndex={0}
          aria-label="Entity graph. Tab reaches nodes and Enter opens one. Arrow keys pan, plus and minus zoom, 0 resets the view, F toggles fullscreen."
          onKeyDown={handleGraphKey}
          className={`block touch-none select-none focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                        isFs ? "size-full" : "aspect-square w-full"
                      }`}
          onWheel={(e) => {
            // No preventDefault: React attaches wheel passively and calling it
            // throws. Anchoring on the pointer means the thing under the
            // cursor stays under the cursor, which is the whole point.
            const r = svgRef.current?.getBoundingClientRect();
            if (!r || r.width === 0 || r.height === 0) return;
            zoomBy(
              e.deltaY < 0 ? 1.12 : 1 / 1.12,
              (e.clientX - r.left) / r.width,
              (e.clientY - r.top) / r.height,
            );
          }}
          onPointerDown={(e) => {
            // Empty space starts a pan. Nodes stop propagation, so this only
            // fires on the background.
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pan.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              const p = m.get(drag.current.id);
              if (!p) return;
              const l = toLocal(e);
              p.x = clamp(l.x + drag.current.dx, PAD, worldW - PAD);
              p.y = clamp(l.y + drag.current.dy, PAD, worldH - PAD);
              redraw();
              return;
            }
            if (pan.current) {
              const r = svgRef.current?.getBoundingClientRect();
              if (!r || r.width === 0) return;
              const k = viewW / r.width;
              const p0 = pan.current;
              setView((v) =>
                clampView({
                  ...v,
                  x: p0.ox - (e.clientX - p0.x) * k,
                  y: p0.oy - (e.clientY - p0.y) * k,
                }),
              );
            }
          }}
          onPointerUp={() => {
            drag.current = null;
            pan.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
            pan.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
            pan.current = null;
          }}
        >
          {directed && (
            <defs>
              <marker
                id={`${uid}-arrow`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M0 1 L8 4 L0 7 z" fill="hsl(var(--primary))" />
              </marker>
            </defs>
          )}

          {/* Layer 1 — the mass. Low opacity scaled by weight, so 400 links
              read as texture and the strong ones read as structure. Incident
              links are skipped here and redrawn on top by layer 2. */}
          <g pointerEvents="none" fill="none" strokeLinecap="round">
            {arcs.map(({ e, k }) => {
              const a = m.get(e.from);
              const b = m.get(e.to);
              if (!a || !b) return null;
              const incident = activeId != null && (e.from === activeId || e.to === activeId);
              if (incident) return null;
              const t = e.weight / maxWeight;
              return (
                <path
                  key={`${e.from}>${e.to}`}
                  d={arc(a.x, a.y, b.x, b.y, k)}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={activeId != null ? 0.05 : 0.16 + t * 0.3}
                  strokeWidth={(0.55 + t * 1.5) * u}
                />
              );
            })}
          </g>

          {/* Layer 2 — the answer. Everything the active node touches, drawn
              above the mass at full strength. This is what "show me what it
              connects to" means when there are 400 candidates. */}
          {activeId != null && (
            <g pointerEvents="none" fill="none" strokeLinecap="round">
              {arcs.map(({ e, k }) => {
                if (e.from !== activeId && e.to !== activeId) return null;
                const a = m.get(e.from);
                const b = m.get(e.to);
                if (!a || !b) return null;
                const t = e.weight / maxWeight;
                return (
                  <path
                    key={`hi-${e.from}>${e.to}`}
                    d={arc(a.x, a.y, b.x, b.y, k)}
                    stroke="hsl(var(--primary))"
                    strokeOpacity={0.55 + t * 0.4}
                    strokeWidth={(1.3 + t * 1.7) * u}
                    markerEnd={directed ? `url(#${uid}-arrow)` : undefined}
                  />
                );
              })}
            </g>
          )}

          {/* Layer 3 — nodes. */}
          {[...m.values()].map((p) => {
            const id = p.n.id;
            const rad = radiusOf(p.n);
            const sel = selectedId === id;
            const isActive = activeId === id;
            const related = relatedIds.has(id);
            const dimmed = activeId != null && !isActive && !related;
            return (
              <g
                key={id}
                role="button"
                tabIndex={0}
                aria-label={`${p.n.name}, ${p.n.kind}, ${p.n.mentions} mention${
                  p.n.mentions === 1 ? "" : "s"
                }, ${degrees[id] ?? 0} link${(degrees[id] ?? 0) === 1 ? "" : "s"}`}
                aria-pressed={sel}
                opacity={dimmed ? 0.22 : 1}
                className="cursor-grab outline-none transition-opacity active:cursor-grabbing"
                onPointerDown={(e) => {
                  // Stop the background pan from also starting.
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
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
                  // role="button" on SVG does not synthesise a click from the
                  // keyboard the way a native button does — do it ourselves.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect?.(p.n);
                  }
                }}
              >
                {/* A wide invisible target: an 8px circle is very hard to grab. */}
                <circle cx={p.x} cy={p.y} r={Math.max(rad + 8, 15 * u)} fill="transparent" />
                {sel && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={rad + 10 * u}
                    fill="hsl(var(--primary))"
                    opacity={0.14}
                  />
                )}
                {sel && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={rad + 5 * u}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5 * u}
                  />
                )}
                {!sel && isActive && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={rad + 5 * u}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2 * u}
                    strokeOpacity={0.8}
                  />
                )}
                {!sel && !isActive && related && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={rad + 3.5 * u}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5 * u}
                    strokeOpacity={0.55}
                  />
                )}
                {focusedId === id && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={rad + 8 * u}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5 * u}
                    strokeDasharray={`${3 * u} ${2 * u}`}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rad}
                  fill={KIND_COLOR[p.n.kind] ?? KIND_COLOR.term}
                  stroke="hsl(var(--card))"
                  strokeWidth={u}
                />
                <title>
                  {`${p.n.name} — ${p.n.kind}, mentioned ${p.n.mentions}×, ${
                    degrees[id] ?? 0
                  } link${(degrees[id] ?? 0) === 1 ? "" : "s"}`}
                </title>
              </g>
            );
          })}

          {/* Layer 4 — labels, above every node so a circle can never sit on
              top of a name. Each is knocked out of the links behind it with a
              card-coloured stroke drawn under the fill. */}
          <g pointerEvents="none">
            {[...m.values()].map((p) => {
              const id = p.n.id;
              if (!placed.has(id)) return null;
              const isActive = activeId === id;
              const related = relatedIds.has(id);
              const dimmed = activeId != null && !isActive && !related;
              const name = p.n.name;
              return (
                <text
                  key={`t-${id}`}
                  x={p.x}
                  y={p.y - radiusOf(p.n) - 4 * u}
                  textAnchor="middle"
                  opacity={dimmed ? 0.25 : 1}
                  fill={
                    isActive || related || selectedId === id
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--muted-foreground))"
                  }
                  stroke="hsl(var(--card))"
                  strokeWidth={3 * u}
                  style={{
                    paintOrder: "stroke",
                    fontSize: `${10.5 * u}px`,
                    fontWeight: isActive || selectedId === id ? 600 : 400,
                  }}
                >
                  {name.length > LABEL_CHARS ? `${name.slice(0, LABEL_CHARS - 1)}…` : name}
                </text>
              );
            })}
          </g>
        </svg>

        {/* Filtered to nothing is a state the operator caused, so it says which
            control caused it and offers the way back rather than a blank box. */}
        {nothingShown && (
          <div className="absolute inset-0 grid place-items-center bg-card/85 p-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <Waypoints aria-hidden className="size-6 text-muted-foreground/70" />
              <p className="text-sm font-medium">Every kind is hidden</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {nodes.length} entities are still here — the kind filter is hiding all
                of them.
              </p>
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className={`${CHIP} border-border bg-card text-foreground hover:bg-muted`}
              >
                Show every kind
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Hover or focus a node to light up what it connects to · click or press Enter to
        read its memories · drag to move it · drag the background to pan · scroll or
        +/&minus; to zoom · F for fullscreen{isFs && " · Esc exits"}
      </p>
    </div>
  );
};
BrainGraph.displayName = "BrainGraph";
