/**
 * The terminal's palette (docs/plans/in-app-terminal.md §6.5).
 *
 * This file is standing in for `pnpm check:theme`. That checker reads `.css`,
 * `.css.ts` and the editor's `--ed-*` contract, and the terminal's palette is
 * none of those — it is a JavaScript object, because xterm.js parses colour
 * values rather than resolving CSS variables. So the property the checker
 * exists to defend (DESIGN.md §19: a colour that differs between the schemes
 * must be *expressed* so that it changes with the scheme) is asserted here
 * instead.
 */
import {
  resolveTerminalScheme,
  type TerminalPalette,
  terminalTheme,
} from "../terminalTheme";

const SCHEMES = ["light", "dark"] as const;

describe("the palette", () => {
  it("fills every slot in both schemes", () => {
    // An omitted slot is not a missing colour, it is xterm's own VT100 default
    // arriving in one cell of an otherwise themed terminal.
    for (const scheme of SCHEMES) {
      for (const [slot, value] of Object.entries(terminalTheme(scheme))) {
        expect(`${slot}=${value}`).toMatch(/=(#[0-9a-f]{3,8}|rgba?\()/i);
      }
    }
  });

  it("gives every slot a different answer per scheme", () => {
    // The whole of §19 in one assertion: a slot that is the same string in both
    // is a colour that does not respond to the toggle, which is the defect the
    // CSS checker catches everywhere it can see.
    const light = terminalTheme("light");
    const dark = terminalTheme("dark");
    for (const slot of Object.keys(light) as (keyof TerminalPalette)[]) {
      expect(`${slot}: ${light[slot]}`).not.toBe(`${slot}: ${dark[slot]}`);
    }
  });
});

describe("the chrome three", () => {
  it("takes the app's colours when they are parseable", () => {
    const theme = terminalTheme("dark", {
      foreground: "#123456",
      background: "#abcdef",
      cursor: "rgb(1, 2, 3)",
    });
    expect(theme.foreground).toBe("#123456");
    expect(theme.background).toBe("#abcdef");
    expect(theme.cursor).toBe("rgb(1, 2, 3)");
  });

  it("draws the block cursor's glyph in the background it sits on", () => {
    // Otherwise the character under the cursor is painted over itself.
    expect(terminalTheme("light", { background: "#111111" }).cursorAccent)
      .toBe("#111111");
  });

  it("refuses a CSS variable rather than letting xterm drop it", () => {
    // `background.panel` in this app *is* a `var(...)`, deliberately, so this
    // is the value a call site actually reaches for. xterm fails to parse it
    // without complaining and substitutes its own default, which is a white
    // terminal in dark mode.
    const theme = terminalTheme("dark", {
      background: "var(--mui-palette-background-sidebar)",
      foreground: "var(--mui-palette-text-primary)",
    });
    expect(theme.background).toBe(terminalTheme("dark").background);
    expect(theme.foreground).toBe(terminalTheme("dark").foreground);
  });

  it("ignores anything else that is not a colour", () => {
    for (const junk of ["", "  ", "inherit", "currentColor", "#xyzxyz"]) {
      expect(terminalTheme("light", { cursor: junk }).cursor)
        .toBe(terminalTheme("light").cursor);
    }
  });

  it("leaves the sixteen alone", () => {
    // The ANSI colours are the terminal's own vocabulary and have no equivalent
    // in the app's palette, so nothing the caller passes may reach them.
    const overridden = terminalTheme("light", { foreground: "#000000" });
    expect(overridden.red).toBe(terminalTheme("light").red);
    expect(overridden.brightWhite).toBe(terminalTheme("light").brightWhite);
  });
});

describe("resolveTerminalScheme", () => {
  it("reads the explicit modes", () => {
    expect(resolveTerminalScheme("dark", undefined)).toBe("dark");
    expect(resolveTerminalScheme("light", "dark")).toBe("light");
  });

  it("defers to the system only when the mode says to", () => {
    expect(resolveTerminalScheme("system", "dark")).toBe("dark");
    expect(resolveTerminalScheme("system", "light")).toBe("light");
  });

  it("answers light before anything has been reported", () => {
    // The server rendered light, so light is what the first client pass has to
    // agree with; guessing dark is a flash of the wrong terminal.
    expect(resolveTerminalScheme(undefined, undefined)).toBe("light");
    expect(resolveTerminalScheme("system", undefined)).toBe("light");
  });
});
