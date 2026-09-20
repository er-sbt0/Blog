import {
  APP_SHORTCUTS,
  buildMenuTemplate,
  collisions,
  flattenMenu,
  normalizeAccelerator,
} from "../menuTemplate.js";

/**
 * The application menu (docs/plans/desktop-app.md §8 item 7, phase 7).
 *
 * The thing being defended is specific: **a menu accelerator that is registered
 * never reaches the page.** Chromium gives the keystroke to the native menu,
 * the menu runs its item, and the renderer's listener is not called. So a File
 * menu that takes ⌘K takes the command palette away, one that takes ⌘S takes
 * the editor's save away, and an Edit menu with a `selectAll` role takes ⌘A
 * away from the posts list, the sidebar and the notes canvas — all silently,
 * with the menu item itself looking like it works.
 *
 * Nobody can open this menu and check (§11.4 — no screenshots on this host, in
 * any phase), so the audit is encoded rather than performed: `APP_SHORTCUTS` is
 * the inventory, and these tests are what make adding an item that shadows one
 * a failing spec instead of a bug report six weeks later.
 */

/**
 * The template is plain data — `Menu.buildFromTemplate`'s shape, minus
 * electron. Spelled out here rather than inferred, because TypeScript reads the
 * builder's return as a union of fifteen differently-shaped object literals and
 * every property access on it would need a narrowing that says nothing.
 */
type TemplateItem = {
  label?: string;
  role?: string;
  type?: string;
  accelerator?: string;
  registerAccelerator?: boolean;
  click?: unknown;
  submenu?: TemplateItem[];
};

const actions = Object.fromEntries(
  ["newPost", "exportPdf", "exportBundle", "importBundle", "toggleMaximize", "openDataFolder", "copyBootLog", "about"]
    .map((name) => [name, () => name]),
);

const template = buildMenuTemplate(actions) as unknown as TemplateItem[];
const items = flattenMenu(template) as unknown as TemplateItem[];
const menu = (label: string) => template.find((entry) => entry.label === label)!;

describe("normalizeAccelerator", () => {
  it("collapses every spelling of the platform modifier", () => {
    const expected = "mod+k";
    for (const spelling of ["CmdOrCtrl+K", "CommandOrControl+k", "Ctrl+K", "Cmd+K", "Command+K", "Control+K"]) {
      expect(normalizeAccelerator(spelling)).toBe(expected);
    }
  });

  it("does not care in which order the modifiers were written", () => {
    expect(normalizeAccelerator("Shift+CmdOrCtrl+O")).toBe(normalizeAccelerator("CmdOrCtrl+Shift+O"));
  });

  /**
   * Electron accepts several names for one physical key, and the app's own
   * handler reads `event.key`. `Ctrl+Plus` and `Ctrl+=` are the same press, and
   * comparing the strings literally would have declared the zoom collision
   * resolved by spelling it differently.
   */
  it("folds the aliases Electron accepts for one key", () => {
    expect(normalizeAccelerator("CmdOrCtrl+Plus")).toBe(normalizeAccelerator("CmdOrCtrl+="));
    expect(normalizeAccelerator("CmdOrCtrl+numadd")).toBe(normalizeAccelerator("CmdOrCtrl+="));
    expect(normalizeAccelerator("CmdOrCtrl+Minus")).toBe(normalizeAccelerator("CmdOrCtrl+-"));
  });

  it("keeps an unmodified function key as itself", () => {
    expect(normalizeAccelerator("F11")).toBe("f11");
  });
});

describe("the menu's shape", () => {
  it("is File / Edit / View / Window / Help", () => {
    expect(template.map((menu) => menu.label)).toEqual([
      "&File",
      "&Edit",
      "&View",
      "&Window",
      "&Help",
    ]);
  });

  it("gives every item something to do — a role, a click, or a separator", () => {
    for (const item of items) {
      if (item.type === "separator" || Array.isArray(item.submenu)) continue;
      expect(item.role ?? item.click, `"${item.label}" does nothing`).toBeTruthy();
    }
  });

  it("wires each shell action exactly once", () => {
    const clicks = items.filter((item) => item.click).map((item) => item.click);
    expect(new Set(clicks).size).toBe(clicks.length);
    expect(clicks.length).toBe(Object.keys(actions).length);
  });

  it("carries the four affordances phase 7 exists to add", () => {
    const labels = items.map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Export as PDF…", "Import Backup…", "Export Backup…", "Open Data Folder"]),
    );
  });
});

describe("accelerators", () => {
  /**
   * The headline claim, and the one that has to survive every future edit to
   * the template: nothing the menu *registers* is a chord the app is listening
   * for.
   */
  it("shadows nothing the app binds", () => {
    expect(collisions(template)).toEqual([]);
  });

  it("does not bind the same chord to two items", () => {
    const registered = items
      .filter((item) => item.accelerator && item.registerAccelerator !== false)
      .map((item) => normalizeAccelerator(item.accelerator!));
    expect(new Set(registered).size).toBe(registered.length);
  });

  /**
   * The Edit menu is labels, not bindings — all of it.
   *
   * `selectAll` would take ⌘A from three different in-app meanings, and
   * `copy`/`cut`/`paste` would take Lexical's clipboard handlers, which write
   * `application/x-lexical-editor` alongside the plain text. The native role
   * does not, so a copy between two posts would quietly degrade to whatever the
   * HTML fallback can express. On Linux — the only platform this build targets
   * — Chromium handles all of them inside the renderer anyway, so unregistered
   * costs nothing.
   */
  it("registers nothing in the Edit menu", () => {
    const edit = menu("&Edit");
    const bound = edit.submenu!.filter(
      (item) => item.accelerator && item.registerAccelerator !== false,
    );
    expect(bound).toEqual([]);
    // But it still *shows* the chords, or the menu is lying about what works.
    expect(edit.submenu!.filter((item) => item.accelerator).length).toBeGreaterThan(5);
  });

  /**
   * The three zoom roles are the interesting case, because they look like plain
   * defaults and are not: `useCanvasZoomShortcuts` binds Ctrl+0 / Ctrl+= /
   * Ctrl+- on a notes canvas, and it tests `ctrlKey` alone — so on this
   * Linux-only build the menu would win in the one place the user is most
   * likely to press them.
   */
  it("shows the zoom chords without taking them from the notes canvas", () => {
    const view = menu("&View");
    for (const role of ["resetZoom", "zoomIn", "zoomOut"]) {
      const item = view.submenu!.find((entry) => entry.role === role)!;
      expect(item.accelerator, role).toBeTruthy();
      expect(item.registerAccelerator, role).toBe(false);
    }
  });

  /**
   * The safety net under the audit: if `registerAccelerator: false` were
   * dropped from a zoom item, `collisions()` must be the thing that notices.
   * A test that only ever sees a clean template proves nothing about the check.
   */
  it("detects a collision that is actually introduced", () => {
    const shadowing = [
      { label: "Bad", submenu: [{ label: "Palette", accelerator: "CmdOrCtrl+K", click: () => {} }] },
    ];
    expect(collisions(shadowing)).toHaveLength(1);
    expect(collisions(shadowing)[0].shadows.chord).toBe("Mod+K");
  });

  /**
   * `Mod+Shift+E` reads as free in any inventory of declared shortcuts, and it
   * is the obvious accelerator for "Export". It is not free: the inline-code
   * handler matches `code === "KeyE"` with no `shiftKey` guard, so it fires for
   * the shifted chord too. That is what `absorbsShift` is for, and it is why
   * Export Backup is on Ctrl+Shift+O instead.
   */
  it("treats a handler with no shift guard as owning the shifted chord too", () => {
    const shadowing = [
      { label: "Bad", submenu: [{ label: "Export", accelerator: "CmdOrCtrl+Shift+E", click: () => {} }] },
    ];
    expect(collisions(shadowing)[0].shadows.chord).toBe("Mod+E");
  });

  it("does not invent a collision for a shifted chord whose handler guards shift", () => {
    // Mod+S is save, and SavePlugin checks `!shiftKey`; Mod+Shift+S is
    // strikethrough, declared separately. Neither should match Mod+Alt+S.
    const fine = [{ label: "x", submenu: [{ label: "y", accelerator: "CmdOrCtrl+Alt+S", click: () => {} }] }];
    expect(collisions(fine)).toEqual([]);
  });
});

describe("APP_SHORTCUTS", () => {
  it("says where each chord comes from, so the audit can be re-run", () => {
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.where, shortcut.chord).toMatch(/\.(ts|tsx):\d+/);
      expect(shortcut.what, shortcut.chord).toBeTruthy();
    }
  });

  it("lists each chord once", () => {
    const chords = APP_SHORTCUTS.map((shortcut) => normalizeAccelerator(shortcut.chord));
    expect(new Set(chords).size).toBe(chords.length);
  });
});
