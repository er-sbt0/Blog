/**
 * The application menu, and the audit that decides what it may bind.
 *
 * Phase 7 of docs/plans/desktop-app.md (§6, §8 item 7). Two halves live here,
 * and the second is the reason the first is import-free:
 *
 * - `buildMenuTemplate` returns a plain `Menu.buildFromTemplate` template. No
 *   electron import, so the whole menu is inspectable from a spec — which
 *   matters on a build nobody has ever seen a screenshot of (§11.4).
 * - `APP_SHORTCUTS` is the inventory of every modifier chord the *web app*
 *   already binds, and `collisions()` is what stops a menu accelerator from
 *   shadowing one.
 *
 * **An accelerator registered in the menu never reaches the page.** That is the
 * whole hazard: Chromium hands the keystroke to the native menu, the menu runs
 * its item, and the renderer's listener is simply never called. So a menu that
 * claims ⌘K takes the command palette away, and one that claims ⌘S takes the
 * editor's save away — silently, with the menu item looking like it works.
 *
 * `registerAccelerator: false` is the way out where both are wanted: the chord
 * is *displayed* beside the item and left unbound, so the item still works by
 * click and the page keeps the key. Three View items use it deliberately
 * (§ "zoom", below), and the entire Edit menu does — see `EDIT_ROLES`.
 *
 * Linux only, per §8's first-release decision, so `CmdOrCtrl` is always Ctrl
 * here. Chords whose freedom depends on the platform are marked in
 * `APP_SHORTCUTS` and the notes below say which.
 */

/**
 * Every modifier chord the app binds, from an audit of `src/` and
 * `packages/editor/src/` plus what Lexical registers on the editor's behalf.
 *
 * Recorded rather than remembered, because the menu is the one place in this
 * repo that can take a key away from the app without anything failing. A chord
 * added here is a chord the menu may no longer register, and the spec is what
 * enforces that.
 *
 * `absorbsShift` marks a handler that tests the modifier and the key but *not*
 * `shiftKey`, so it fires for the shifted chord too. That is not hypothetical
 * tidiness: `TextFormatToggles.tsx:168` has no shift guard, which makes
 * `Mod+Shift+E` inline-code inside the editor even though nothing declares it —
 * and `Mod+Shift+E` is the obvious accelerator for "Export". It would have
 * looked free.
 */
export const APP_SHORTCUTS = [
  { chord: "Mod+K", what: "command palette (and the editor's insert-link dialog)", absorbsShift: true, where: "src/components/CommandPalette/CommandPalette.tsx:105, packages/editor/src/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx:158" },
  { chord: "Mod+\\", what: "toggle the sidebar", where: "src/components/Layout/SideBar/hooks/useKeyboardShortcuts.ts:28" },
  { chord: "Mod+/", what: "focus the inline Copilot bar", where: "src/components/CopilotPanel/InlineCopilotBar.tsx:136" },
  { chord: "Mod+1", what: "right rail: agent changes", where: "src/components/Layout/RightRail/index.tsx:91" },
  { chord: "Mod+2", what: "right rail: outline", where: "src/components/Layout/RightRail/index.tsx:91" },
  { chord: "Mod+3", what: "right rail: properties", where: "src/components/Layout/RightRail/index.tsx:91" },
  { chord: "Mod+4", what: "right rail: revisions", where: "src/components/Layout/RightRail/index.tsx:91" },
  // docs/plans/in-app-terminal.md §4.8, and the entry below is only half of what
  // that section decides.
  //
  // The other half cannot be written as a row here, so it is written as a
  // sentence: **a focused terminal consumes the keyboard wholesale.** `Ctrl+C`
  // has to reach the PTY — it is the interrupt, and a terminal that cannot
  // interrupt is not one — and `Ctrl+C` is also `Mod+C` two rows below, the
  // notes canvas and Lexical's rich clipboard. There is no way to have both, so
  // xterm takes everything while it has focus and the app's own handlers are
  // the ones that yield.
  //
  // What that means for this file is that the inventory *understates* what is
  // taken whenever the terminal has focus, in the direction that is safe: every
  // chord listed here is still listed, so the menu still may not register it.
  // Copy and paste inside the terminal are xterm's own `Ctrl+Shift+C` / `V`,
  // which nothing in the app binds and the Edit menu only displays.
  // The one exception to "every chord": `Mod+5` is reserved out of xterm and
  // let through, because a focused terminal that owns `Escape`, `Tab` and the
  // other view chords otherwise leaves a keyboard-only user with no way out of
  // the view at all — a keyboard trap (WCAG 2.1.2). The chord that opens the
  // terminal closes it; see `TERMINAL_VIEW_CHORD` in `TerminalView.tsx`.
  { chord: "Mod+5", what: "right rail: terminal (and while it has focus, every chord except this one — see above)", where: "src/components/Layout/RightRail/index.tsx:91" },
  { chord: "Mod+A", what: "select all rows / notes / editor content", where: "src/components/posts/components/PostsListView/PostsListView.tsx:449" },
  { chord: "Mod+C", what: "copy (notes canvas, and Lexical's rich clipboard)", where: "src/components/NotesCanvas/hooks/useNotesSelection.ts:315" },
  { chord: "Mod+X", what: "cut (notes canvas, and Lexical's rich clipboard)", where: "src/components/NotesCanvas/hooks/useNotesSelection.ts:318" },
  { chord: "Mod+V", what: "paste (notes canvas, and Lexical's rich clipboard)", where: "src/components/NotesCanvas/hooks/useNotesSelection.ts:321" },
  { chord: "Mod+S", what: "save the document", where: "packages/editor/src/plugins/SavePlugin/index.tsx:16" },
  { chord: "Mod+E", what: "inline code — no shift guard, so it takes Mod+Shift+E too", absorbsShift: true, where: "packages/editor/src/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx:168" },
  { chord: "Mod+Shift+H", what: "highlight", where: "packages/editor/src/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx:164" },
  { chord: "Mod+Shift+S", what: "strikethrough", where: "packages/editor/src/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx:172" },
  { chord: "Mod+B", what: "bold (Lexical; no shift guard)", absorbsShift: true, where: "lexical/LexicalUtils.ts:1185" },
  { chord: "Mod+I", what: "italic (Lexical; no shift guard)", absorbsShift: true, where: "lexical/LexicalUtils.ts:1189" },
  { chord: "Mod+U", what: "underline (Lexical; no shift guard)", absorbsShift: true, where: "lexical/LexicalUtils.ts:1193" },
  { chord: "Mod+Z", what: "undo (Lexical)", where: "lexical/LexicalUtils.ts:1255" },
  { chord: "Mod+Shift+Z", what: "redo (Lexical)", where: "lexical/LexicalUtils.ts:1259" },
  { chord: "Ctrl+Y", what: "redo, non-Apple spelling (Lexical)", where: "lexical/LexicalUtils.ts:1259" },
  // Ctrl, not Mod: `useCanvasZoomShortcuts` tests `ctrlKey` alone, so on this
  // Linux-only build these three are taken whenever a notes canvas has focus.
  // The View menu shows them and does not register them, which is the only way
  // both can be true.
  { chord: "Ctrl+0", what: "reset canvas zoom", where: "src/hooks/useCanvasZoomShortcuts.ts:56" },
  { chord: "Ctrl+=", what: "canvas zoom in", where: "src/hooks/useCanvasZoomShortcuts.ts:50" },
  { chord: "Ctrl+-", what: "canvas zoom out", where: "src/hooks/useCanvasZoomShortcuts.ts:53" },
];

/**
 * One spelling per chord, so `CmdOrCtrl+Shift+E`, `Ctrl+Shift+E` and
 * `shift+cmd+E` compare equal.
 *
 * Electron accepts several aliases for the same physical key and the ordering
 * of modifiers is free-form, so comparing accelerator strings literally would
 * miss exactly the collisions this module exists to catch.
 */
const KEY_ALIASES = {
  plus: "=",
  add: "=",
  numadd: "=",
  "=": "=",
  minus: "-",
  numsub: "-",
  "-": "-",
  num0: "0",
  esc: "escape",
  return: "enter",
};

export function normalizeAccelerator(accelerator) {
  const parts = String(accelerator).split("+").map((part) => part.trim().toLowerCase());
  const modifiers = new Set();
  let key = "";
  for (const part of parts) {
    if (["cmdorctrl", "commandorcontrol", "cmd", "command", "ctrl", "control", "mod"].includes(part)) {
      modifiers.add("mod");
    } else if (part === "shift") modifiers.add("shift");
    else if (["alt", "option"].includes(part)) modifiers.add("alt");
    else if (["super", "meta"].includes(part)) modifiers.add("super");
    else key = KEY_ALIASES[part] ?? part;
  }
  const order = ["mod", "alt", "shift", "super"].filter((name) => modifiers.has(name));
  return [...order, key].join("+");
}

/** Every item in a template, flattened, so submenus are audited too. */
export function flattenMenu(template) {
  const items = [];
  for (const item of template) {
    items.push(item);
    if (Array.isArray(item.submenu)) items.push(...flattenMenu(item.submenu));
  }
  return items;
}

/**
 * Which of a template's *registered* accelerators shadow an in-app chord.
 *
 * Label-only items (`registerAccelerator: false`) are excluded by construction:
 * they never reach Chromium's accelerator table, so they cannot take a key from
 * the page. That is the distinction the whole audit turns on, and collapsing it
 * would make three legitimate View items look like bugs.
 */
export function collisions(template) {
  const taken = new Map();
  for (const shortcut of APP_SHORTCUTS) {
    const normalized = normalizeAccelerator(shortcut.chord);
    taken.set(normalized, shortcut);
    if (shortcut.absorbsShift && !normalized.includes("shift+")) {
      const [mods, key] = [normalized.slice(0, normalized.lastIndexOf("+") + 1), normalized.slice(normalized.lastIndexOf("+") + 1)];
      taken.set(`${mods}shift+${key}`, shortcut);
    }
  }

  const found = [];
  for (const item of flattenMenu(template)) {
    if (!item.accelerator || item.registerAccelerator === false) continue;
    const hit = taken.get(normalizeAccelerator(item.accelerator));
    if (hit) found.push({ label: item.label, accelerator: item.accelerator, shadows: hit });
  }
  return found;
}

/**
 * The Edit menu, as labels rather than as bindings.
 *
 * Every one of these roles works by click. None of them registers its
 * accelerator, and that is not caution — it is required:
 *
 * - `selectAll` would take `Mod+A` from the posts list, the sidebar and the
 *   notes canvas, all three of which mean something more specific by it than
 *   "select every character on the page".
 * - `copy`/`cut`/`paste` would take Lexical's clipboard handlers, which write
 *   `application/x-lexical-editor` alongside the plain text. The role's native
 *   copy does not, so a copy-paste between two posts would silently lose every
 *   node type the HTML fallback cannot express.
 * - `undo`/`redo` would route around Lexical's own history stack.
 *
 * On Linux — the only platform this build targets (§8) — Chromium handles all
 * of these natively inside the renderer anyway, so leaving them unregistered
 * costs nothing. On macOS it would, and that is a note for whoever adds a
 * second platform: `registerAccelerator` is ignored there.
 */
const EDIT_ROLES = [
  { role: "undo", accelerator: "CmdOrCtrl+Z" },
  { role: "redo", accelerator: "CmdOrCtrl+Shift+Z" },
  { type: "separator" },
  { role: "cut", accelerator: "CmdOrCtrl+X" },
  { role: "copy", accelerator: "CmdOrCtrl+C" },
  { role: "paste", accelerator: "CmdOrCtrl+V" },
  { role: "pasteAndMatchStyle", accelerator: "CmdOrCtrl+Shift+V" },
  { role: "delete" },
  { type: "separator" },
  { role: "selectAll", accelerator: "CmdOrCtrl+A" },
];

/**
 * `actions` is one function per menu item the shell implements itself. Passed in
 * rather than imported so this module stays import-free and a spec can hand it
 * counters.
 */
export function buildMenuTemplate(actions) {
  return [
    {
      label: "&File",
      submenu: [
        // Ctrl+N, Ctrl+P, Ctrl+O, Ctrl+W and Ctrl+Q are all unbound in the app
        // — checked, not assumed; `collisions()` is the check and the spec runs
        // it. Ctrl+Shift+O is free on Linux; on macOS, Lexical claims Ctrl+O
        // (open line break), so a second platform should re-run the audit.
        { label: "New Post", accelerator: "CmdOrCtrl+N", click: actions.newPost },
        { type: "separator" },
        { label: "Export as PDF…", accelerator: "CmdOrCtrl+P", click: actions.exportPdf },
        { type: "separator" },
        { label: "Import Backup…", accelerator: "CmdOrCtrl+O", click: actions.importBundle },
        { label: "Export Backup…", accelerator: "CmdOrCtrl+Shift+O", click: actions.exportBundle },
        { type: "separator" },
        { role: "close", label: "Close Window", accelerator: "CmdOrCtrl+W" },
        { role: "quit", label: "Quit", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    { label: "&Edit", submenu: EDIT_ROLES.map((item) => ({ ...item, registerAccelerator: false })) },
    {
      label: "&View",
      submenu: [
        { role: "reload", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
        // F12 rather than Ctrl+Shift+I. Both are free, and one accelerator per
        // item is all Electron takes; F12 is the one that does not look like a
        // chord the app might want later.
        { role: "toggleDevTools", accelerator: "F12" },
        { type: "separator" },
        // Label-only, all three: `useCanvasZoomShortcuts` binds Ctrl+0 / Ctrl+=
        // / Ctrl+- on the notes canvas. Registering them would make those keys
        // zoom the whole window instead of the canvas, which is the wrong
        // answer in the one place the user is most likely to press them.
        { role: "resetZoom", accelerator: "CmdOrCtrl+0", registerAccelerator: false },
        { role: "zoomIn", accelerator: "CmdOrCtrl+=", registerAccelerator: false },
        { role: "zoomOut", accelerator: "CmdOrCtrl+-", registerAccelerator: false },
        { type: "separator" },
        { role: "togglefullscreen", accelerator: "F11" },
      ],
    },
    {
      label: "&Window",
      submenu: [
        { role: "minimize", accelerator: "CmdOrCtrl+M" },
        // No accelerator: the window manager owns maximise on Linux, and the
        // menu item exists to be discoverable rather than to claim a chord.
        { label: "Maximize / Restore", click: actions.toggleMaximize },
      ],
    },
    {
      label: "&Help",
      submenu: [
        { label: "About Blog", click: actions.about },
        { type: "separator" },
        // The backup story at one-machine scale is "the blob directory plus the
        // cluster" (§6). Being able to open that directory is most of it.
        { label: "Open Data Folder", click: actions.openDataFolder },
        { label: "Copy Boot Log", click: actions.copyBootLog },
      ],
    },
  ];
}
