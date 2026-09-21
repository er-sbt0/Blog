/**
 * Is the keyboard currently owned by the terminal?
 * (docs/plans/in-app-terminal.md §4.8.)
 *
 * §4.8's rule is that a focused xterm consumes the keyboard wholesale, and
 * `TerminalView` implements most of it by stopping `keydown` propagation at the
 * terminal's own element — which reaches every app handler bound in the bubble
 * phase, including the rail's own `Mod+1..9`.
 *
 * It does **not** reach a handler bound on `window` in the *capture* phase,
 * because capture runs from the window down to the target: those handlers have
 * already fired by the time the event reaches anything this view can stop it
 * at, whatever order the components mount in. Two exist — the command palette's
 * `Mod+K` and the inline Copilot bar's `Mod+/` — and both are real chords in a
 * terminal (`Ctrl+K` kills to end of line, `Ctrl+/` is undo). They ask this
 * instead, the way the palette already defers to a focused Lexical editor by
 * asking `isContentEditable`.
 *
 * A DOM question rather than a registry: nothing has to be registered,
 * unregistered or kept in sync, and a stale answer is impossible because the
 * answer is read from the document at the moment the chord arrives. It is also
 * why this is not exported from `TerminalView` the way `hasInlineCopilotBar` is
 * exported from its bar — importing that module would pull xterm into the main
 * bundle of a build that does not have a terminal at all.
 *
 * Import-free, and safe to call during SSR.
 */

/**
 * Marks the element xterm renders into. `TerminalView` sets it; the predicate
 * below is the only reader.
 */
export const TERMINAL_HOST_ATTR = "data-terminal-host";

/**
 * Whether focus is inside the terminal.
 *
 * xterm takes keystrokes through a hidden `<textarea>` inside its host, so this
 * is a `closest` from the active element rather than an identity check.
 */
export const isTerminalFocused = (): boolean => {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof Element)) return false;
  return active.closest(`[${TERMINAL_HOST_ATTR}]`) !== null;
};
