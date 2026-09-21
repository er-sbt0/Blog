/**
 * The terminal's colours (docs/plans/in-app-terminal.md §6.5, DESIGN.md §19).
 *
 * A terminal needs a sixteen-colour ANSI palette, and the app's palette has no
 * such thing — `primary`, `success`, `warning`, `info` are four semantic hues,
 * not eight colours and their bright variants. So the sixteen are stated here,
 * per scheme, as explicit tokens.
 *
 * **This palette is deliberately outside what `pnpm check:theme` can reach.**
 * That checker reads `.css`, `.css.ts` and the editor's `--ed-*` contract; a
 * JavaScript object of hexes is invisible to all three, and nothing about
 * `red: "#b91c1c"` looks like CSS to any other tool in the repo — which is
 * exactly the defect the checker's rule (3) exists to catch in `.css.ts` files.
 * It is outside for a reason that is not evasion: xterm.js does not read CSS
 * for its palette at all. It parses colour *values* into a texture atlas, so a
 * `var(--mui-palette-…)` handed to it is not a colour it resolves later — it is
 * a string it fails to parse, silently, falling back to its own defaults.
 *
 * `__tests__/terminalTheme.test.ts` is what stands in for the check: it asserts
 * that both schemes define every slot and that no slot is the same colour in
 * both, which is §19's actual requirement ("a colour that differs between light
 * and dark must be expressed so that it changes with the scheme") applied to a
 * surface the CSS checker cannot see.
 *
 * Import-free, like `panelState.ts` beside it and for the same reason. The
 * xterm `ITheme` it is handed to is structurally identical and deliberately not
 * imported: the rules here must be exercisable without pulling a renderer into
 * the test environment.
 */

/** The two schemes `html.dark` switches between (DESIGN.md §19.1). */
export type TerminalScheme = "light" | "dark";

/**
 * Structurally an xterm `ITheme`, with every field required.
 *
 * Required rather than optional because an omitted field in `ITheme` means "use
 * xterm's own default", and xterm's defaults are a black-on-white VT100 — which
 * is a scheme of its own, unrelated to the app's, and would appear only in
 * whichever slots we forgot.
 */
export interface TerminalPalette {
  foreground: string;
  background: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/**
 * The chrome three, which the view reads off the MUI theme so that they track
 * the app rather than drifting from it.
 *
 * Optional, because the caller may not be able to supply a usable value — see
 * {@link terminalTheme}.
 */
export interface TerminalChrome {
  foreground?: string;
  background?: string;
  cursor?: string;
}

/**
 * The sixteen, plus the three chrome defaults each scheme falls back to.
 *
 * Tuned against the surface the view actually sits on — `background.sidebar`,
 * which is what `background.panel` resolves to — rather than against pure black
 * and white. In light that is `#f8fafc`, so the normal eight are the *dark*
 * end of each hue and the bright eight are the saturated ones; in dark it is
 * `#202634` and the relationship inverts. A palette copied from a black
 * terminal renders normal-weight text at roughly 2:1 against this background,
 * which is not a style disagreement, it is a §10 contrast failure.
 */
const PALETTES: Record<TerminalScheme, TerminalPalette> = {
  light: {
    foreground: "#0f172a",
    background: "#f8fafc",
    cursor: "#4f46e5",
    cursorAccent: "#f8fafc",
    // Kept translucent so the glyphs under a selection stay legible; xterm
    // composites this over the cell rather than replacing it.
    selectionBackground: "rgba(79, 70, 229, 0.25)",
    black: "#1e293b",
    red: "#b91c1c",
    green: "#15803d",
    yellow: "#a16207",
    blue: "#1d4ed8",
    magenta: "#7e22ce",
    cyan: "#0e7490",
    // ANSI white on a near-white background is the one slot that cannot be
    // literal: it is what "dim" text arrives as, so it is a light slate that is
    // still readable rather than #ffffff, which would be invisible.
    white: "#94a3b8",
    brightBlack: "#64748b",
    brightRed: "#dc2626",
    brightGreen: "#16a34a",
    brightYellow: "#ca8a04",
    brightBlue: "#2563eb",
    brightMagenta: "#9333ea",
    brightCyan: "#0891b2",
    brightWhite: "#475569",
  },
  dark: {
    foreground: "#f1f3f7",
    background: "#202634",
    cursor: "#8b85f4",
    cursorAccent: "#202634",
    selectionBackground: "rgba(139, 133, 244, 0.3)",
    black: "#3b4254",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#cbd5e1",
    brightBlack: "#8592a3",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fcd34d",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#f8fafc",
  },
};

/**
 * `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(…)` or `rgba(…)` — the forms xterm can
 * parse.
 *
 * The guard exists because of a specific, silent failure. This app sets
 * `cssVariables` on the MUI theme, so a palette value can be the *string*
 * `var(--mui-palette-background-sidebar)` — `background.panel` literally is
 * one, by design, so that it tracks `background.sidebar`. Handing that to xterm
 * produces no error anyone sees: the colour is dropped and xterm's own default
 * takes the slot, which in practice is a white terminal in dark mode.
 */
const isColorLiteral = (value: string | undefined): value is string =>
  typeof value === "string" &&
  (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim()) ||
    /^rgba?\(/i.test(value.trim()));

/**
 * The palette for a scheme, with the app's own foreground, background and
 * cursor laid over it where the caller could supply parseable ones.
 *
 * Splitting it this way is what makes the toggle work *and* keeps the terminal
 * on the app's palette: the sixteen are the terminal's own vocabulary and have
 * no equivalent in the theme, while the three chrome colours do — and those are
 * the ones a reader notices disagreeing with the panel they sit in.
 */
export const terminalTheme = (
  scheme: TerminalScheme,
  chrome: TerminalChrome = {},
): TerminalPalette => {
  const base = PALETTES[scheme];
  const background = isColorLiteral(chrome.background)
    ? chrome.background
    : base.background;
  return {
    ...base,
    foreground: isColorLiteral(chrome.foreground)
      ? chrome.foreground
      : base.foreground,
    background,
    cursor: isColorLiteral(chrome.cursor) ? chrome.cursor : base.cursor,
    // The block cursor's own glyph colour: it has to be the background it is
    // drawn over, or the character under the cursor disappears into it.
    cursorAccent: background,
  };
};

/**
 * Which scheme is showing, from what `useColorScheme` reports.
 *
 * Three states collapse to two, and the third is the one worth naming:
 * `undefined` is the render before MUI's script has told us anything, which
 * happens on the server and on the first client pass. It resolves to `light`
 * because that is what the server rendered — guessing dark there is a flash of
 * the wrong terminal on every launch, corrected a frame later.
 *
 * `system` defers to `systemMode`, which is the pattern `CommandProvider` and
 * `PublicShell` already use; reading `prefers-color-scheme` directly would
 * ignore the in-app toggle, which DESIGN.md §19.1 bans for exactly that reason.
 */
export const resolveTerminalScheme = (
  mode: string | undefined,
  systemMode: string | undefined,
): TerminalScheme => {
  const resolved = mode === "system" ? systemMode : mode;
  return resolved === "dark" ? "dark" : "light";
};
