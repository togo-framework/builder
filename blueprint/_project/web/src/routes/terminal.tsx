import { useEffect, useRef, useState } from "react";
import {
  Button, Callout, EmptyState, Input, PageHeader, Skeleton, StatusBadge,
} from "@togo-framework/ui";
import {
  ArrowDownToLine, Check, Copy, Plug, Plus, SquareTerminal, Trash2,
} from "lucide-react";
import {
  attachURL, createSession, killSession, termStatus, type TermStatus,
} from "../lib/term";
import { API } from "../lib/api";
import { PageShell } from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { useAIStrings } from "../lib/i18n.ai";

/** The slice of xterm's API this page actually drives. Typed here rather than
 *  importing the class, so xterm stays out of the main bundle. */
interface XTermLike {
  dispose: () => void;
  write: (d: string) => void;
  scrollToBottom: () => void;
  onScroll: (cb: (y: number) => void) => { dispose: () => void };
  buffer: { active: { viewportY: number; baseY: number } };
}

/**
 * A terminal in the dashboard, attached to tmux on the machine the builder
 * runs on.
 *
 * tmux rather than a bare shell because the point is persistence: start
 * `claude`, close the tab, come back and it is still running. Reattaching is
 * what makes this useful for the long jobs an agent's work actually involves.
 *
 * The redesign is about reading LENGTH. Agent output is thousands of lines, so
 * the session list became a tab strip on top of the terminal instead of loose
 * pills floating above the page; the frame carries a title bar that says which
 * machine, which directory and whether the socket is live; and the scroll
 * position is watched so that reading back through the scrollback offers a way
 * to return to the tail rather than stranding the operator in the middle of a
 * run.
 */
export const Terminal = () => {
  const { S } = useStrings();
  const { A } = useAIStrings();
  const [status, setStatus] = useState<TermStatus | null>(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("builder");
  const [connected, setConnected] = useState(false);
  const [attachedAt, setAttachedAt] = useState<string | null>(null);
  /** False while the operator is reading back through the scrollback. */
  const [atTail, setAtTail] = useState(true);
  /** Bumped to force a re-attach without changing the session. */
  const [nonce, setNonce] = useState(0);
  const [copiedInstall, setCopiedInstall] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  // The xterm instance and its socket live in refs, not state: they are
  // imperative objects with their own lifecycle, and putting them in state
  // would tear the terminal down on every unrelated re-render.
  const termRef = useRef<XTermLike | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = () =>
    termStatus().then(setStatus).catch((e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
  }, []);

  // Attach whenever the chosen session changes.
  useEffect(() => {
    if (!active || !hostRef.current) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      // Imported here rather than at module scope so xterm and its CSS are not
      // in the main bundle for every operator who never opens this page.
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      // The icon font ships with the plugin, so the prompt renders the same on
      // a machine that has never installed a Nerd Font. Awaited before xterm
      // measures the cell: if the font arrives after measurement, every glyph
      // is laid out against the fallback's metrics and the columns are wrong.
      await ensureIconFont();
      if (disposed || !hostRef.current) return;

      const term = new XTerm({
        convertEol: false,
        cursorBlink: true,
        // Nerd Fonts FIRST, then the plain monospace fallbacks.
        //
        // A zsh prompt with powerlevel10k or oh-my-zsh draws its separators,
        // git status and language icons from the Private Use Area, and a normal
        // monospace font has no glyphs there — every one of them renders as a
        // replacement box. The operator sees their own prompt as a row of
        // rectangles.
        //
        // These are the names the common installs actually register (Homebrew's
        // font-* casks, the Nerd Fonts releases, and the two Microsoft ships),
        // listed so whichever the operator already has is used. If none is
        // present the terminal still works — it falls through to SF Mono and
        // only the icons are missing, which is where this started.
        fontFamily: [
          '"MesloLGS NF"',                 // what powerlevel10k installs and names
          '"MesloLGS Nerd Font Mono"',     // the same family under the Nerd Fonts name
          '"MesloLGS Nerd Font"',
          '"MesloLGM Nerd Font Mono"',
          '"MesloLGL Nerd Font Mono"',
          '"JetBrainsMono Nerd Font"',
          '"FiraCode Nerd Font"',
          '"Hack Nerd Font"',
          '"SauceCodePro Nerd Font"',
          '"UbuntuMono Nerd Font"',
          '"DejaVuSansMono Nerd Font"',
          '"Symbols Nerd Font Mono"', // glyph-only fallback beside a plain font
          '"Cascadia Code PL"',
          '"CaskaydiaCove Nerd Font"',
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
          // LAST on purpose. This one is symbols-only: it has no letters or
          // digits, so the browser takes ordinary text from the monospace fonts
          // above and falls through to here only for the Private Use Area
          // glyphs a prompt draws its icons from. Putting it first would give
          // every character a missing glyph.
          '"Builder Symbols"',
        ].join(", "),
        fontSize: 13,
        // Powerline separators are drawn to the cell edge; the default 1.0
        // leaves hairline gaps between them on some fonts.
        lineHeight: 1.0,
        letterSpacing: 0,
        // Draw box-drawing and block characters with the renderer's own
        // geometry rather than the font's glyphs, so tmux borders and
        // powerline blocks join cleanly whatever font resolved.
        customGlyphs: true,
        // A powerline arrow occupies one cell but many fonts report it wide;
        // this keeps column maths matching what tmux thinks it drew.
        allowProposedApi: true,
        // Read from the page so the terminal matches whichever theme the
        // dashboard is in, rather than being a black rectangle in a light UI.
        theme: readTheme(),
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term as unknown as XTermLike;

      // Follow-tail. xterm keeps the viewport where the operator put it, so
      // scrolling up to read a stack trace while output keeps arriving is
      // silent — nothing says the tail has moved on. This watches the viewport
      // and lets the chrome offer the way back.
      //
      // ATTACHED TO TMUX THIS NEVER FIRES, and that is correct rather than
      // broken: tmux takes the alternate screen, so xterm's normal buffer gets
      // no scrollback and the viewport is always the tail. The history lives in
      // tmux's own copy mode, which is what the footer note points at. The
      // watcher stays because it is right for any attached program that does
      // NOT hold the alternate screen, and it costs one event subscription.
      const onScroll = term.onScroll(() => {
        const b = term.buffer.active;
        setAtTail(b.viewportY >= b.baseY);
      });

      const ws = new WebSocket(attachURL(active, term.cols, term.rows));
      // The PTY sends bytes; a partial UTF-8 sequence split across two reads is
      // normal, so frames arrive binary and are decoded with a streaming
      // decoder rather than one call per frame.
      ws.binaryType = "arraybuffer";
      const decoder = new TextDecoder();
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setAttachedAt(new Date().toISOString());
      };
      ws.onclose = () => {
        setConnected(false);
        term.write("\r\n\x1b[2m— detached. The session is still running in tmux. —\x1b[0m\r\n");
      };
      ws.onerror = () => setErr("The terminal connection failed.");
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          // stream:true keeps a split multi-byte character across frames.
          term.write(decoder.decode(ev.data, { stream: true }));
        } else {
          term.write(String(ev.data));
        }
      };

      const send = (m: object) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
      };
      const onData = term.onData((d: string) => send({ type: "in", data: d }));

      const onResize = () => {
        fit.fit();
        send({ type: "resize", cols: term.cols, rows: term.rows });
      };
      window.addEventListener("resize", onResize);
      // The sidebar collapsing changes the width without a window resize, so
      // the element itself is observed too.
      const ro = new ResizeObserver(onResize);
      ro.observe(hostRef.current);

      cleanup = () => {
        onData.dispose();
        onScroll.dispose();
        window.removeEventListener("resize", onResize);
        ro.disconnect();
        ws.close();
        term.dispose();
        termRef.current = null;
        wsRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [active, nonce]);

  async function start() {
    const n = newName.trim();
    if (!n) return;
    setErr("");
    try {
      const r = await createSession(n);
      await load();
      setActive(r.name);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function kill(name: string) {
    setErr("");
    try {
      await killSession(name);
      if (active === name) setActive(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  /** Drop the socket and attach again. The tmux session is untouched — this
   *  only rebuilds the browser's end of it. */
  const handleReconnect = () => {
    setErr("");
    setNonce((n) => n + 1);
  };

  const handleJumpToLatest = () => {
    termRef.current?.scrollToBottom();
    setAtTail(true);
  };

  const handleCopyInstall = async () => {
    if (!status?.install) return;
    await navigator.clipboard.writeText(status.install);
    setCopiedInstall(true);
    window.setTimeout(() => setCopiedInstall(false), 1600);
  };

  if (!status) {
    // The header is identical to the loaded one so nothing jumps when the
    // status arrives; the skeleton is the size of the terminal it becomes.
    return (
      <PageShell width="wide">
        <PageHeader
          title={A.term.title}
          icon={<SquareTerminal className="size-5" />}
          description={A.term.desc}
        />
        <Skeleton className="h-[min(72dvh,760px)] w-full rounded-xl" />
      </PageShell>
    );
  }

  // The two states where there is no terminal to show. Both say exactly what to
  // do rather than rendering a dead black box. Narrow: they are prose, and a
  // sentence stretched across a terminal-wide column stops being read.
  if (!status.enabled) {
    return (
      <PageShell width="narrow">
        <PageHeader
          title={A.term.title}
          icon={<SquareTerminal className="size-5" />}
          description={A.term.desc}
        />
        <Callout kind="warn" title={A.term.offTitle}>
          {/* The server's own sentence — it names the flag to set. */}
          <bdi>{status.reason}</bdi>
        </Callout>
        <p className="max-w-prose text-xs text-muted-foreground">{A.term.offBody}</p>
      </PageShell>
    );
  }

  if (!status.hasTmux) {
    return (
      <PageShell width="narrow">
        <PageHeader
          title={A.term.title}
          icon={<SquareTerminal className="size-5" />}
          description={A.term.desc}
        />
        <Callout kind="warn" title={A.term.noTmuxTitle}>{A.term.noTmuxBody}</Callout>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              shell
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => void handleCopyInstall()}
            >
              {copiedInstall
                ? <Check className="me-1.5 size-3.5" />
                : <Copy className="me-1.5 size-3.5" />}
              {copiedInstall ? A.term.copied : A.term.copyCommand}
            </Button>
          </div>
          <pre dir="ltr" className="overflow-x-auto p-3 text-xs">{status.install}</pre>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title={A.term.title}
        icon={<SquareTerminal className="size-5" />}
        description={A.term.descIn(status.workdir)}
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={A.term.namePlaceholder}
              aria-label={A.term.nameAria}
              dir="ltr"
              className="h-9 w-44"
              onKeyDown={(e) => e.key === "Enter" && void start()}
            />
            <Button size="sm" onClick={() => void start()}>
              <Plus className="me-1.5 size-4" />
              {A.term.newSession}
            </Button>
          </div>
        }
      />

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {/* One frame: tab strip, title bar, terminal. The sessions used to be
          loose pills above an unrelated black rectangle, which is why the page
          read as two widgets that happened to share a screen. */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {status.sessions.length > 0 && (
          <div
            role="tablist"
            aria-label={A.term.sessionsHeading}
            className="flex min-w-0 items-stretch gap-px overflow-x-auto border-b border-border bg-muted/30"
          >
            {status.sessions.map((n) => (
              <div
                key={n}
                className={`group flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 transition-colors ${
                  active === n
                    ? "border-b-primary bg-card"
                    : "border-b-transparent hover:bg-card/60"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === n}
                  onClick={() => setActive(n)}
                  className="flex items-center gap-2"
                >
                  {/* A session name is a machine identifier. */}
                  <bdi dir="ltr" className="font-mono text-xs">{n}</bdi>
                  {active === n && (
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground"}`}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void kill(n)}
                  aria-label={A.term.killAria(n)}
                  title={A.term.killTitle}
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {active ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
              <StatusBadge tone={connected ? "success" : "neutral"}>
                {connected ? A.term.attached : A.term.detached}
              </StatusBadge>
              {connected && attachedAt && (
                <span className="text-[11px] text-muted-foreground">
                  {A.term.attachedSince(A.mcp.ago(attachedAt))}
                </span>
              )}
              {/* The working directory is a path — machine text, own direction. */}
              <bdi
                dir="ltr"
                className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
              >
                {status.workdir}
              </bdi>
              <Button
                variant="ghost"
                size="sm"
                title={A.term.reconnectTitle}
                className="ms-auto h-7 px-2 text-[11px] text-muted-foreground"
                onClick={handleReconnect}
              >
                <Plug className="me-1.5 size-3.5" />
                {A.term.reconnect}
              </Button>
            </div>

            {/* relative: the jump-to-latest pill is positioned inside the
                terminal, where the eye already is, not in the page chrome. */}
            <div className="relative">
              <div
                ref={hostRef}
                // A DEFINITE height, expressed as an arbitrary Tailwind value
                // rather than a style attribute — not flex-1 + h-full.
                //
                // The page sits inside a `main` that scrolls, so `h-full`
                // resolved against an auto-height ancestor — which is no height
                // at all. FitAddon measured the container, found it unbounded,
                // and sized the terminal to 417 rows: roughly seven thousand
                // pixels of black that the whole page then scrolled through
                // forever.
                //
                // dvh rather than vh so a mobile browser's collapsing toolbar
                // does not change the row count on every scroll.
                // h-[min(64dvh,760px)] — 64, not 72: the frame now carries a tab
                // strip, a title bar and a status line, and the old figure
                // pushed the tmux status row past the fold on a 900px viewport
                // — the one line that says which window you are in.
                //
                // bg-background, not bg-black: xterm paints its own background
                // from the SAME --background variable (readTheme below), so any
                // other frame colour shows as a halo around the terminal —
                // black in a light theme, off-tone in the coloured presets.
                className="min-h-0 h-[min(64dvh,760px)] overflow-hidden bg-background p-2"
              />
              {!atTail && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <Button
                    size="sm"
                    className="pointer-events-auto shadow-lg"
                    onClick={handleJumpToLatest}
                  >
                    <ArrowDownToLine className="me-1.5 size-4" />
                    {A.term.jumpToLatest}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              {/* Only claims to be following when it is. Scrolled back, the
                  pill above is the statement, and repeating it here would be
                  two controls for one fact. */}
              {atTail && <span>{A.term.following}</span>}
              <span className="ms-auto">{A.term.scrollbackNote}</span>
            </div>
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={<SquareTerminal className="size-6" />}
              title={status.sessions.length ? A.term.emptyPickTitle : A.term.emptyNoneTitle}
              description={
                status.sessions.length ? A.term.emptyPickDesc : A.term.emptyNoneDesc
              }
            />
          </div>
        )}
      </section>
    </PageShell>
  );
};
Terminal.displayName = "Terminal";

/**
 * Load the embedded Nerd Font symbols once per document.
 *
 * Served by the plugin from its own embedded assets, so a generated app has it
 * without the operator installing anything. Subset to the ranges a zsh prompt
 * actually uses — Powerline separators, Devicons, Font Awesome, Octicons, box
 * drawing — which takes it from 2.5 MB to 600 kB.
 *
 * Failure is not fatal: without it the terminal still works and only the icons
 * are boxes, which is strictly better than refusing to open a shell because a
 * decorative font did not download.
 */
let iconFontPromise: Promise<void> | null = null;
function ensureIconFont(): Promise<void> {
  if (iconFontPromise) return iconFontPromise;
  iconFontPromise = (async () => {
    try {
      const url = `${API}/builder-assets/fonts/symbols-nerd-font-mono.woff2`;
      const face = new FontFace("Builder Symbols", `url(${url}) format("woff2")`, {
        style: "normal",
        weight: "normal",
        // Only the Private Use Area and box drawing. Declaring the range keeps
        // the browser from consulting this font for ordinary text at all.
        unicodeRange: "U+2500-259F, U+E000-E00A, U+E0A0-E0D7, U+E200-E2A9, U+E300-E3E3, U+E5FA-E6B7, U+E700-E8EF, U+EA60-EC1E, U+ED00-F2FF, U+F300-F381, U+F400-F533, U+F500-FD46",
      });
      await face.load();
      document.fonts.add(face);
    } catch {
      /* icons will render as boxes; the terminal still works */
    }
  })();
  return iconFontPromise;
}

/** Reads the dashboard's own colours so the terminal belongs to the page. */
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
  return {
    background: v("--background", "#0b0d10"),
    foreground: v("--foreground", "#e6e8ea"),
    cursor: v("--primary", "#e6e8ea"),
  };
}
