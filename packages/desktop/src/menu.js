import { app, clipboard, dialog, Menu, shell } from "electron";
import { buildMenuTemplate, collisions } from "./menuTemplate.js";
import { exportBundle, importBundle } from "./bundles.js";
import { exportDocumentPdf, printableTarget } from "./pdf.js";

/**
 * The application menu, installed.
 *
 * Phase 7 of docs/plans/desktop-app.md. The template, the accelerators and the
 * audit that clears them live in `menuTemplate.js`, which imports nothing; this
 * is the part that needs Electron. Splitting them that way is what makes the
 * menu testable at all — see `__tests__/menuTemplate.test.ts`, which is the
 * only place the claim "no accelerator here shadows an in-app binding" is
 * actually checked, since nobody can open this menu and look (§11.4).
 *
 * The one thing worth stating that the template cannot: **every action here is
 * something the shell already had the right to do.** Navigating the window,
 * printing what it is showing, and posting a file to `/api/import` with the
 * session cookie are all things the window itself can do. Nothing in phase 7
 * adds an authorization path, and nothing in it changed `src/`.
 */

/**
 * Wrap a menu action so a rejection becomes a dialog.
 *
 * An unhandled rejection in a click handler is invisible: the menu closes, the
 * thing does not happen, and the only trace is a line in a terminal the user
 * does not have. Loud failure, quiet success — the refusals are what need
 * saying, and the file the user just named appearing where they named it is its
 * own confirmation.
 *
 * `busy` is per action rather than global: holding Ctrl+P should not queue four
 * printers, but it should not block a backup either.
 */
function guard(label, log, action) {
  let busy = false;
  return async (...args) => {
    if (busy) return;
    busy = true;
    try {
      await action(...args);
    } catch (error) {
      log(`${label} failed: ${error?.message ?? error}`);
      dialog.showMessageBox({
        type: "error",
        title: label,
        message: `${label} failed.`,
        detail: String(error?.stack || error?.message || error),
        buttons: ["OK"],
        noLink: true,
      });
    } finally {
      busy = false;
    }
  };
}

export function installMenu({ getWindow, origin, dataDir, bootLog, log, cookie }) {
  const documentsDir = app.getPath("documents");

  const actions = {
    newPost: guard("New post", log, async () => {
      // A navigation rather than a command: the renderer is behind
      // `contextIsolation` with no preload bridge, so the shell has no way to
      // reach the command registry. `/new` is the app's own entry point for
      // this and does the same thing the UI's button does.
      await getWindow()?.loadURL(`${origin}/new`);
    }),

    exportPdf: guard("Export as PDF", log, async () => {
      const window = getWindow();
      const id = printableTarget(window, origin);
      if (!id) {
        await dialog.showMessageBox(window, {
          type: "info",
          title: "Export as PDF",
          message: "Open a post first.",
          detail:
            "PDF export prints the post the window is showing, and this window is not " +
            "showing one. Open a post (its address will be /edit/… or /view/…) and try again.",
          buttons: ["OK"],
          noLink: true,
        });
        return;
      }
      await exportDocumentPdf({ origin, id, parent: window, defaultDir: documentsDir, log });
    }),

    exportBundle: guard("Export backup", log, async () => {
      await exportBundle({
        origin,
        cookie: cookie(),
        parent: getWindow(),
        defaultDir: documentsDir,
        log,
      });
    }),

    importBundle: guard("Import backup", log, async () => {
      const window = getWindow();
      const result = await importBundle({ origin, cookie: cookie(), parent: window, log });
      if (!result) return;
      // The one affordance here that reports rather than merely succeeding:
      // `/api/import` skips anything already present, so "imported nothing
      // because every id was already there" and "worked" look identical
      // otherwise. See `describeImport`.
      await dialog.showMessageBox(window, {
        type: result.ok ? "info" : "warning",
        title: "Import Backup",
        message: result.message,
        detail: result.detail,
        buttons: ["OK"],
        noLink: true,
      });
      window?.webContents.reload();
    }),

    toggleMaximize: () => {
      const window = getWindow();
      if (!window) return;
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    },

    openDataFolder: guard("Open data folder", log, async () => {
      const failure = await shell.openPath(dataDir);
      if (failure) throw new Error(failure);
    }),

    copyBootLog: () => clipboard.writeText(bootLog.join("\n")),

    about: async () => {
      await dialog.showMessageBox(getWindow(), {
        type: "info",
        title: "About Blog",
        message: `Blog ${app.getVersion()}`,
        detail: [
          "The blog platform as a desktop application: an embedded PostgreSQL",
          "cluster and the application server, in one window.",
          "",
          `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
          `Serving ${origin}`,
          `Data ${dataDir}`,
        ].join("\n"),
        buttons: ["OK"],
        noLink: true,
      });
    },
  };

  const template = buildMenuTemplate(actions);

  // The spec is the gate; this is the backstop, in the relationship
  // `preflight.js` has to `verify-package.mjs`. It costs nothing and it catches
  // the case the spec cannot: a template edited without the spec being run.
  const shadowed = collisions(template);
  if (shadowed.length > 0) {
    throw new Error(
      "These menu accelerators would take a key away from the app:\n" +
        shadowed
          .map((hit) => `  ${hit.accelerator} (${hit.label}) shadows ${hit.shadows.what}`)
          .join("\n"),
    );
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  log(`application menu installed (${template.length} top-level menus)`);
}
