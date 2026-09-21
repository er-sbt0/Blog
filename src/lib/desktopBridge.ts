/**
 * The renderer's view of the Electron shell (docs/plans/in-app-terminal.md
 * §2.1).
 *
 * **This is the first privileged renderer API this application has ever had.**
 * The window is created with `contextIsolation: true`, `nodeIntegration: false`
 * and — until this feature — no preload script at all, and two places in the
 * shell are written around that absence and say so (`pdf.js`, `menu.js`). §2.1
 * states the cost plainly: after this lands, adding the next capability is an
 * argument about that capability rather than about whether the shell has a
 * bridge at all.
 *
 * What keeps it narrow is §4.1 rather than luck. The child's argv is fixed in
 * the main process, so there is no `spawn` here; the session is created by the
 * main process, so there is no session id to name. The renderer's whole
 * vocabulary is *write these bytes to the session that exists*, *resize it*,
 * *subscribe*, *restart it*.
 *
 * Import-free on purpose, like `lib/desktop.ts` and `lib/blobPath.ts`: this is
 * the declaration of a boundary, and a boundary that drags a module graph
 * behind it cannot be read on its own.
 */

/**
 * Whether a terminal can be started, and what is standing in the way when it
 * cannot.
 *
 * A discriminated union rather than a bag of optionals because the two answers
 * lead to two different renderings and neither has the other's fields: a
 * running session has a command and a cwd, and a missing binary has the list of
 * places that were looked in. `TerminalView` names that list in its empty state
 * — §4.5 chose an explained empty state over an absent view, and "we looked
 * here and here" is the part that makes it an explanation rather than a notice.
 */
export type TerminalStatus =
  | { available: true; running: boolean; command: string; cwd: string }
  | { available: false; reason: "no-binary"; searched: string[] };

/** What a session emits when the child is gone. */
export interface TerminalExit {
  code: number | null;
  signal: number | null;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * The one session this window has (§4.7).
 *
 * `start` is idempotent from the renderer's side — it returns the status of the
 * session that exists, having created one if there was none — which is what
 * lets the view be unmounted and remounted (switching to Outline and back)
 * without killing a turn in flight.
 */
export interface DesktopTerminal {
  status(): Promise<TerminalStatus>;
  start(size: TerminalSize): Promise<TerminalStatus>;
  restart(size: TerminalSize): Promise<TerminalStatus>;
  write(data: string): void;
  resize(size: TerminalSize): void;
  /** Subscribe to output. Returns the unsubscribe. */
  onData(cb: (chunk: string) => void): () => void;
  /** Subscribe to the child's death. Returns the unsubscribe. */
  onExit(cb: (info: TerminalExit) => void): () => void;
}

export interface DesktopBridge {
  terminal: DesktopTerminal;
}

declare global {
  interface Window {
    /**
     * Injected by the shell's preload script. Optional in the type because it
     * genuinely is absent everywhere but the Electron build — see
     * {@link getDesktopBridge}.
     */
    desktop?: DesktopBridge;
  }
}

/**
 * The bridge, or `null` when there is none.
 *
 * `null` rather than a throw, and rather than a non-optional global, so that
 * **every call site has to answer for its absence**. A bridge that is assumed
 * present is a `TypeError` during render, which in a React tree is a white
 * screen — and it would be a white screen on the *VPS* build, where nothing
 * about the feature is supposed to exist at all.
 *
 * The `typeof window` guard is not defensive dressing: this module is imported
 * by client components that Next still renders on the server, and the desktop
 * build runs a real Next server in the shell's child process, so the
 * server-side pass happens there too.
 *
 * Not memoized. The preload runs before any page script, so the answer is
 * constant for the window's lifetime — but it is constant *after mount*, and
 * the server pass answers `null`. Callers that render from it must therefore
 * read it in an effect rather than during render, or they are rendering
 * something the SSR pass did not (docs/guides/hydration.md).
 */
export const getDesktopBridge = (): DesktopBridge | null => {
  if (typeof window === "undefined") return null;
  return window.desktop ?? null;
};
