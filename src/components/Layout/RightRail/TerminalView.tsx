"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { RotateCw, SquareTerminal } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  type DesktopBridge,
  getDesktopBridge,
  type TerminalExit,
  type TerminalStatus,
} from "@/lib/desktopBridge";
import { TERMINAL_HOST_ATTR } from "@/lib/terminalFocus";
import { ICON_SIZE } from "@/theme/icons";
import { VIEW_IDS } from "./panelState";
import { railRowSx } from "./railChrome";
import { resolveTerminalScheme, terminalTheme } from "./terminalTheme";

/**
 * Claude Code, in a PTY, in the right rail (docs/plans/in-app-terminal.md
 * §4.3).
 *
 * Desktop-only by construction: `terminal` is in `VIEW_IDS` only when
 * `IS_DESKTOP_CLIENT`, so on the VPS build nothing renders this and nothing
 * requests its chunk. The bridge-absent state below is therefore unreachable in
 * practice and is still written, because "unreachable" is a claim about two
 * files agreeing and a blank rectangle is what a broken claim looks like.
 *
 * **Uncovered by tests, and deliberately.** Everything with a rule in it has
 * been moved out — the palette into `terminalTheme.ts`, the focus predicate
 * into `lib/terminalFocus.ts`, the view's membership into `panelState.ts` —
 * and what is left is the part only a browser can answer: whether a
 * `ResizeObserver` and a `FitAddon` agree about how many columns fit, whether
 * xterm's hidden textarea takes focus, and whether a keystroke reaches the PTY.
 * Same line `useScrollMemory` and `SidebarResizeHandle` are on.
 *
 * ## The session outlives this component (§4.7)
 *
 * A long turn must survive the user clicking "Outline", and the view unmounts
 * when they do. So the xterm instance and the two wires that carry bytes live
 * in a module singleton, created once per window and never disposed: the PTY is
 * the main process's to own, and the scrollback is this module's.
 *
 * Unsubscribing those wires on unmount would keep the *session* alive and still
 * lose the turn — output produced while Outline was showing would arrive at a
 * listener that no longer exists and be dropped, and the user would come back
 * to a live session that had silently skipped a screen. What the component
 * unsubscribes is its own listener, the one that drives *its* state (`onExit`).
 */

/** What is between the user and a prompt, at this moment. */
type Phase =
  | { kind: "connecting" }
  /** No preload bridge — a VPS build, or a desktop build missing its preload. */
  | { kind: "no-bridge" }
  | { kind: "no-binary"; searched: string[] }
  | { kind: "ready"; command: string; cwd: string }
  | { kind: "failed"; message: string };

interface Session {
  term: Terminal;
  fit: FitAddon;
}

/**
 * The one session this window has (§4.7), held across mounts.
 *
 * Module scope rather than a ref, because a ref dies with the component and
 * that is precisely what must not happen here. One per window is the decision,
 * so a module-level singleton is not a cache with an eviction question — it is
 * the shape of the feature.
 */
let session: Session | null = null;

/**
 * The digit that selects this view, as a key name.
 *
 * `RightRail` binds `Mod+1..9` by position in {@link VIEW_IDS}, so the terminal's
 * own chord is wherever it sits in that array rather than a fixed `"5"`. Read
 * once here because the value is needed inside xterm's key handler, which runs
 * outside React and cannot ask a hook.
 */
const TERMINAL_VIEW_CHORD = String(VIEW_IDS.indexOf("terminal") + 1);

const ensureSession = (bridge: DesktopBridge): Session => {
  if (session) return session;

  // The bridge's terminal half, named once. Everything below talks to the one
  // session this window has (§4.7) — there is no session id to pass, which is
  // the shape §2.1 is describing when it says the renderer's vocabulary is
  // *write to the session that exists*.
  const pty = bridge.terminal;

  const term = new Terminal({
    // §14's code family, with the app's own `Cascadia` first. The fallbacks
    // matter more than usual: xterm measures a cell from the *resolved* font,
    // so a family that does not load leaves every column calculation wrong
    // rather than merely differently shaped.
    fontFamily: '"Cascadia", Menlo, Consolas, Monaco, monospace',
    // 13px is `dense` on §3's scale and the size §2.3's column arithmetic was
    // done at. Changing it changes how wide the panel has to be.
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    // A TUI redraws rather than scrolls, so this is for the things Claude Code
    // prints and leaves behind — a file it read, a command it ran.
    scrollback: 5000,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  /**
   * The one chord the terminal does not get to own.
   *
   * §4.8 gives a focused terminal the keyboard wholesale, and that is right for
   * every chord the app and a TUI both want — `Ctrl+C` has to be the interrupt.
   * Taken literally, though, it leaves a keyboard-only user with no way out of
   * this view at all: `Escape` is an interrupt, `Tab` and `Shift+Tab` are xterm's,
   * and the rail icon and the panel's close button are both pointer-driven. That
   * is a keyboard trap (WCAG 2.1.2), which is a defect regardless of what the
   * plan says, so exactly one chord is reserved: the view's own toggle.
   *
   * Returning `false` from this handler is what makes it work. It tells xterm to
   * neither consume the key nor send anything for it, so the event goes on
   * bubbling and `RightRail`'s digit handler sees it — and selecting the view
   * that is already showing is what closes the panel (`selectView` in
   * `panelState.ts` is a toggle). The same chord opens and closes the terminal,
   * which is the only behaviour that needs no separate explanation.
   *
   * Derived from `VIEW_IDS` rather than written as `"5"`, so that a view added
   * before this one moves the escape hatch with it instead of stranding it.
   */
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return true;
    return event.key !== TERMINAL_VIEW_CHORD;
  });

  // The three durable wires. They belong to the session and not to the view —
  // see the note above about what unsubscribing them would lose.
  term.onData((data) => pty.write(data));
  pty.onData((chunk) => term.write(chunk));
  // Fired by `fit()` only when the numbers actually change, which is what keeps
  // this from being an IPC message per animation frame during a rail drag.
  term.onResize(({ cols, rows }) => pty.resize({ cols, rows }));

  session = { term, fit };
  return session;
};

/**
 * Put the terminal back on screen.
 *
 * `open()` is called once, ever; a remount re-parents the element xterm already
 * built. Calling `open()` a second time would build a second renderer over the
 * same buffer, which is how a terminal ends up drawing its scrollback twice.
 */
const attach = (host: HTMLElement, { term, fit }: Session) => {
  if (!term.element) {
    term.open(host);
  } else if (term.element.parentElement !== host) {
    host.appendChild(term.element);
  }
  fit.fit();
};

const TerminalView: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [exited, setExited] = useState<TerminalExit | null>(null);
  const [restarting, setRestarting] = useState(false);
  const { mode, systemMode } = useColorScheme();
  const scheme = resolveTerminalScheme(mode, systemMode);

  // Read during render, which is safe *here* and nowhere else in this feature:
  // `RightRail` imports this module through `next/dynamic` with `ssr: false`,
  // so there is no server pass for a client pass to disagree with. The rail's
  // own signal (`useViewData`) reads the same thing in an effect, because the
  // rail does render on the server.
  const bridge = getDesktopBridge();

  /**
   * Start the session, or adopt the one already running.
   *
   * `status()` before `start()` rather than relying on `start()` being
   * idempotent: this effect runs again every time the view is reopened, and
   * "the session is already up" is the *normal* case there (§4.7), not an edge
   * one. Asking first also means the no-binary answer (§4.5) arrives without
   * anything having been attempted.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!bridge) {
      setPhase({ kind: "no-bridge" });
      return;
    }

    const pty = bridge.terminal;
    const live = ensureSession(bridge);
    attach(host, live);

    let cancelled = false;
    void (async () => {
      try {
        const current = await pty.status();
        if (cancelled) return;
        if (!current.available) {
          setPhase({ kind: "no-binary", searched: current.searched });
          return;
        }
        const started: TerminalStatus = current.running
          ? current
          : await pty.start({ cols: live.term.cols, rows: live.term.rows });
        if (cancelled) return;
        if (!started.available) {
          setPhase({ kind: "no-binary", searched: started.searched });
          return;
        }
        setPhase({
          kind: "ready",
          command: started.command,
          cwd: started.cwd,
        });
        live.term.focus();
      } catch (error) {
        if (cancelled) return;
        setPhase({
          kind: "failed",
          message: error instanceof Error
            ? error.message
            : "The terminal could not be started.",
        });
      }
    })();

    // This one *is* the view's, and it goes on unmount: it drives the exited
    // state below, and a component that has gone away has no state to drive.
    const offExit = pty.onExit((info) => setExited(info));

    // The rail is resizable and the window is resizable, and a TUI that is told
    // the wrong number of columns wraps every line it draws. `fit()` is what
    // recomputes it; `term.onResize` above is what tells the PTY, and only when
    // the answer changed.
    const observer = new ResizeObserver(() => live.fit.fit());
    observer.observe(host);

    // The first fit measures whatever font was resolved at that instant, and
    // `Cascadia` is a webfont — so on a cold load the columns are computed from
    // the fallback's advance and are wrong by the difference. Re-fitting once
    // the font is in is cheap and is the whole fix.
    void document.fonts?.ready.then(() => {
      if (!cancelled) live.fit.fit();
    });

    return () => {
      cancelled = true;
      offExit();
      observer.disconnect();
    };
  }, [bridge]);

  /**
   * Keep the palette on the app's toggle (DESIGN.md §19).
   *
   * Declared after the effect above, so the session exists by the time it first
   * runs; `session` is module state rather than a dependency, which is why this
   * re-runs on the scheme alone.
   */
  useEffect(() => {
    if (!session) return;
    session.term.options.theme = terminalTheme(scheme);
  }, [scheme]);

  /**
   * Whether there is a character grid worth showing.
   *
   * `connecting` counts: the surface has to be laid out and fitted before
   * `start()` can be told how many columns it has.
   */
  const hasSurface = phase.kind === "connecting" || phase.kind === "ready";

  const restart = useCallback(async () => {
    if (!bridge || !session) return;
    setRestarting(true);
    try {
      const { term } = session;
      // The dead session's last screen is not the new one's scrollback, and a
      // TUI's redraw would otherwise land on top of it.
      term.reset();
      const next = await bridge.terminal.restart({
        cols: term.cols,
        rows: term.rows,
      });
      if (!next.available) {
        setPhase({ kind: "no-binary", searched: next.searched });
        return;
      }
      setExited(null);
      setPhase({ kind: "ready", command: next.command, cwd: next.cwd });
      term.focus();
    } catch (error) {
      setPhase({
        kind: "failed",
        message: error instanceof Error
          ? error.message
          : "The terminal could not be restarted.",
      });
    } finally {
      setRestarting(false);
    }
  }, [bridge]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        // So the "starting" state can sit *over* the empty grid rather than
        // under it: the host holds the whole column while it is fitting, and a
        // spinner pushed to the foot of it reads as something that failed.
        position: "relative",
      }}
    >
      {
        /* The host is mounted in every phase, because `start()` takes a size
          and the size comes from a fitted terminal — the surface has to exist
          before there is anything to say about it. The states below cover it
          rather than replace it. */
      }
      <Box
        ref={hostRef}
        // Read by `isTerminalFocused`, which is how the two capture-phase
        // chords the stopPropagation below cannot reach know to stand down.
        {...({ [TERMINAL_HOST_ATTR]: "" } as Record<string, string>)}
        role="group"
        aria-label="Claude Code terminal"
        /**
         * §4.8: while the terminal has focus it owns the keyboard.
         *
         * `Ctrl+C` is the interrupt — a terminal that cannot interrupt is not
         * one — and it is also `Mod+C` in the app (Lexical's rich copy, the
         * notes canvas selection). There is no way to serve both, so the
         * focused terminal wins and `APP_SHORTCUTS` records that it does.
         *
         * Stopping propagation here is what makes that true for every app
         * handler bound in the bubble phase: React's delegated listener sits at
         * the root container, so a `stopPropagation` from a handler it
         * dispatches also stops the native event before `window` sees it. That
         * covers the rail's own `Mod+1..9` (`RightRail`), the sidebar's chords
         * and the posts list's.
         *
         * It cannot cover a `window` listener bound in the *capture* phase,
         * which has already run by the time the event reaches this element —
         * the command palette's `Mod+K` and the Copilot bar's `Mod+/` are both
         * bound that way. `isTerminalFocused()` is how those two stand down;
         * see `lib/terminalFocus.ts`.
         *
         * Nothing is `preventDefault`ed. xterm decides for itself what to
         * consume and what to leave to the browser, and the two chords that
         * have to survive are exactly the ones it leaves alone: `Ctrl+Shift+C`
         * and `Ctrl+Shift+V`, which reach xterm's own `copy`/`paste` handlers
         * by way of the browser's clipboard commands. Preventing the default
         * here would take them away.
         *
         * The consequence, stated rather than discovered: `Escape` does not
         * close the panel while the terminal is focused, because `Escape` is
         * how a turn is interrupted. Neither do `Mod+1..4`. That would leave a
         * keyboard-only user with no way out of this view — a keyboard trap —
         * so the view's own chord is reserved and let through; see
         * `TERMINAL_VIEW_CHORD` and the handler that keeps xterm off it.
         */
        onKeyDown={(e) => {
          // The escape hatch, on the bubble side too: `attachCustomKeyEventHandler`
          // keeps xterm from swallowing the view chord, and this keeps the
          // `stopPropagation` below from doing it instead.
          const mod = e.metaKey || e.ctrlKey;
          if (mod && !e.shiftKey && !e.altKey && e.key === TERMINAL_VIEW_CHORD) return;
          e.stopPropagation();
        }}
        sx={{
          // Hidden rather than unmounted in the states that have no terminal to
          // show: the element is what `hostRef` names and what xterm's own DOM
          // hangs off, so unmounting it would mean rebuilding the renderer over
          // the same buffer the next time a session came up.
          display: hasSurface ? "block" : "none",
          flex: 1,
          minHeight: 0,
          // xterm draws its own background from the palette; this is what the
          // strip around the character grid is, so the two have to agree.
          bgcolor: "background.panel",
          "& .xterm": { height: "100%", p: 0.5 },
          "& .xterm-viewport": {
            // A black frame around the character grid, and nothing in this app
            // drew it. `xterm.css` still carries the pre-6.0 rule
            // `.xterm-viewport { background-color: #000 }`, and that element is
            // `position: absolute; inset: 0` over the whole padding box — but
            // 6.0 paints `theme.background` onto `.xterm-scrollable-element`
            // instead, which is a different node and only as large as the
            // grid. So the black is no longer covered anywhere the grid is not:
            // the 4px padding above, and the sub-cell remainder `fit()` leaves
            // at the right and foot. Transparent rather than the palette's
            // background, so it keeps tracking the host through the toggle.
            backgroundColor: "transparent",
            // §12's thin auto-hiding bars. xterm styles this element itself, so
            // the app's global rule does not reach it.
            scrollbarWidth: "thin",
            scrollbarColor: "var(--mui-palette-text-disabled) transparent",
          },
        }}
      />

      {phase.kind === "connecting" && <Connecting />}
      {phase.kind === "no-bridge" && <NoBridge />}
      {phase.kind === "no-binary" && <NoBinary searched={phase.searched} />}
      {phase.kind === "failed" && (
        <Alert
          severity="error"
          sx={{ mt: 1, typography: "caption" }}
          action={
            <Button size="small" onClick={restart} disabled={restarting}>
              Try again
            </Button>
          }
        >
          {phase.message}
        </Alert>
      )}

      {
        /* Exit is a state of a session that *was* started, so it renders
          alongside the scrollback rather than over it: what the process said on
          its way out is usually the reason it went. */
      }
      {exited && phase.kind !== "no-binary" && (
        <Exited info={exited} busy={restarting} onRestart={restart} />
      )}
    </Box>
  );
};

const Connecting = () => (
  <Box
    sx={{
      position: "absolute",
      top: 8,
      left: 8,
      display: "flex",
      alignItems: "center",
      gap: 1,
      color: "text.disabled",
      typography: "caption",
    }}
  >
    <CircularProgress size={ICON_SIZE.inline} />
    Starting Claude Code…
  </Box>
);

/**
 * The install instruction (§4.5).
 *
 * §4.5 chose this over hiding the view, on the grounds that a view which
 * vanishes is unexplainable — and §2.4 says a missing binary is the likeliest
 * way this feature fails on a first launch, because a packaged app launched
 * from a `.desktop` file inherits the session's `PATH` rather than a login
 * shell's, and `~/.local/bin` may simply not be on it.
 *
 * Which is why the searched list is shown rather than summarised. "Claude Code
 * isn't installed" is wrong advice for the user who installed it and whose
 * `PATH` is short, and the list is the only thing on screen that can tell the
 * two apart.
 */
const NoBinary = ({ searched }: { searched: string[] }) => (
  <Box sx={{ py: 1.5, px: 0.5 }}>
    <Box sx={{ color: "text.disabled", mb: 1 }}>
      <SquareTerminal size={ICON_SIZE.large} />
    </Box>
    <Typography variant="caption" component="p" fontWeight={700} gutterBottom>
      Claude Code isn&apos;t installed
    </Typography>
    <Typography
      variant="caption"
      component="p"
      color="text.secondary"
      sx={{ mb: 1 }}
    >
      This view runs the <code>claude</code> command on your machine. Install
      it, then reopen this view.
    </Typography>
    <Box
      component="code"
      sx={{
        display: "block",
        bgcolor: "background.input",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        p: 0.75,
        mb: 1,
        typography: "micro",
        fontFamily: '"Cascadia", Menlo, Consolas, Monaco, monospace',
        overflowX: "auto",
      }}
    >
      npm install -g @anthropic-ai/claude-code
    </Box>
    {searched.length > 0 && (
      <>
        <Typography variant="micro" component="p" color="text.disabled">
          Looked in:
        </Typography>
        <Box
          component="ul"
          sx={{ m: 0, pl: 2, color: "text.disabled", typography: "micro" }}
        >
          {searched.map((path) => <li key={path}>{path}</li>)}
        </Box>
      </>
    )}
  </Box>
);

/**
 * No preload bridge at all.
 *
 * Unreachable if the build is coherent — the view is not on the rail without
 * `IS_DESKTOP_CLIENT`, and the flag and the preload arrive from the same build
 * (docs/plans/desktop-app.md §5). It says which of the two is missing rather
 * than apologising, because the only person who can see this screen is the one
 * who can fix it.
 */
const NoBridge = () => (
  <Alert severity="warning" sx={{ mt: 1, typography: "caption" }}>
    The desktop shell&apos;s terminal bridge isn&apos;t available in this
    window. This view only works in the desktop app.
  </Alert>
);

const Exited = (
  { info, busy, onRestart }: {
    info: TerminalExit;
    busy: boolean;
    onRestart: () => void;
  },
) => (
  <Box
    // The same card every other rail row is drawn on (`railChrome`), because
    // this is one: a thing that happened, with the action it affords.
    sx={{ ...railRowSx, alignItems: "center", gap: 1, mt: 1 }}
  >
    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
      Claude Code exited{describeExit(info)}.
    </Typography>
    <Button
      size="small"
      variant="outlined"
      disabled={busy}
      onClick={onRestart}
      startIcon={busy
        ? <CircularProgress size={ICON_SIZE.micro} />
        : <RotateCw size={ICON_SIZE.inline} />}
    >
      Restart
    </Button>
  </Box>
);

/**
 * How the child went, when there is anything to say about it.
 *
 * A clean exit says nothing extra — "exited" is the whole story, and "exited
 * with code 0" reads as a failure to anyone who does not write shell scripts.
 */
const describeExit = ({ code, signal }: TerminalExit): string => {
  if (signal !== null) return ` on signal ${signal}`;
  if (code !== null && code !== 0) return ` with code ${code}`;
  return "";
};

export default TerminalView;
