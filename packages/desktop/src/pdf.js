import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { documentIdFromUrl, pdfFileName } from "./fileTargets.js";

/**
 * PDF export, which on desktop is a main-process feature rather than a route.
 *
 * §6 names this as something the desktop build makes possible again, and the
 * plan is careful about why: **`src/app/api/pdf/` does not exist.** CLAUDE.md
 * lists it, phase 1 established that it is gone, and there is no `puppeteer`
 * dependency to bring it back. What Electron supplies instead is its own
 * Chromium, so `webContents.printToPDF` needs neither a headless browser nor
 * `BROWSERLESS_URL` — and it needs no new route, no new authorization surface
 * and no change under `src/`.
 *
 * The source is `/view/<id>`, the existing read-only render. That choice is
 * what keeps authorization where it already is: the page is served by the same
 * server, to the same session, through the same `findDocument` the browser
 * would get. A private post belonging to somebody else renders as "Post not
 * found" here exactly as it would in a tab, and this module has no way to ask
 * for anything the window could not already show.
 *
 * Two things this has to get right, both named in the phase brief:
 *
 * - **It must render as the signed-in user.** The hidden window uses
 *   `session.defaultSession` — the same jar phase 3 minted the NextAuth cookie
 *   into — so it is the author, not an anonymous reader. A partitioned session
 *   would have produced a perfectly valid PDF of the signed-out page.
 * - **It must not silently write a blank page.** `did-finish-load` fires before
 *   images have decoded and before MathLive's fonts have loaded, so printing on
 *   it alone yields a document that is subtly short of its own content — and a
 *   PDF with the right filename and the wrong contents is the failure that gets
 *   noticed months later. `SETTLE` below waits for the real thing and
 *   *reports what it found*, so an empty render is an error rather than a file.
 */

/**
 * Run in the page, after `did-finish-load`, to decide whether there is anything
 * worth printing.
 *
 * Returns a report rather than a boolean: the caller puts the character count
 * and the image count in the log, which is the only evidence anyone has that a
 * given PDF was not blank (§11.4 — nobody can see this window).
 */
const SETTLE = `(async () => {
  const container = document.querySelector(".document-container.document-view");
  if (!container) {
    return { ok: false, reason: "no rendered document on the page", title: document.title };
  }

  // The reader's theme is per-viewer state this window has never had, so a
  // fresh profile can come up dark on a dark desktop. A printed page is white.
  document.documentElement.classList.remove("dark");

  // Pin every top-level element to the layout it has on screen.
  //
  // \`globals.css\` line 311 carries, inside its \`@media print\` block:
  //   body > *:not(.editor-container) { display: none !important; }
  // and on /view the content is \`.document-container.document-view\`, several
  // wrappers below a body child that is neither. So the print render of this
  // page is **empty** — a 947-byte PDF with a correct title and no content,
  // which is exactly the silent failure this module was told to avoid. It is
  // not a desktop bug: the rule was written for /embed, the one route that
  // mounts \`PrintTrigger\` and whose \`EmbedDocument\` *is* the
  // \`.editor-container\`. Printing /view from a browser is blank today too.
  //
  // An inline declaration with \`!important\` outranks an author \`!important\`
  // rule, and reading the screen value first means nothing is guessed — a flex
  // wrapper stays flex, and anything genuinely hidden stays hidden.
  for (const child of document.body.children) {
    child.style.setProperty("display", getComputedStyle(child).display, "important");
  }

  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.complete ? null : new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  })));

  // Math is static markup (MathNode.exportDOM bakes it in), but its glyphs are
  // web fonts that only begin loading once that markup is laid out. fonts.ready
  // is what says the layout it will be printed with is the one on screen.
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  // Height stable across two frames a beat apart: the catch-all for anything
  // that lays out late — a table reflowing, a code card collapsing, an image
  // that only got its intrinsic size once decoded.
  const height = () => container.scrollHeight;
  let previous = -1;
  for (let attempt = 0; attempt < 20 && previous !== height(); attempt += 1) {
    previous = height();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const text = container.innerText.replace(/\\s+/g, " ").trim();
  const broken = images.filter((img) => img.naturalWidth === 0).length;
  return {
    ok: text.length > 0 || images.length > broken,
    reason: "the rendered document is empty",
    title: document.title,
    chars: text.length,
    images: images.length,
    broken,
    height: height(),
    sample: text.slice(0, 120),
  };
})()`;

/**
 * Chrome the reader wants and a PDF does not.
 *
 * Not a `@media print` block, because this window exists only to be printed —
 * there is no screen rendering of it for a media query to keep correct. Every
 * selector here is an *action*: a copy button, a tab strip, a snackbar. Nothing
 * that carries content is hidden, which is what lets the print-media
 * measurement below run *after* this is injected and still mean something.
 */
const PRINT_CSS = `
  button, [role="tablist"], .MuiSnackbar-root, .MuiBackdrop-root, .MuiTooltip-popper { display: none !important; }
  :root { color-scheme: light; }
  body { background: #fff !important; }
`;

/**
 * Which post to print: the one the window is showing.
 *
 * There is no other honest answer. The shell cannot see the pane tree — that is
 * renderer state behind `contextIsolation` with no preload bridge — so the URL
 * is the whole of what it knows, and a menu item that printed some *other*
 * document would be worse than one that says it cannot tell.
 */
export function printableTarget(window, origin) {
  const url = window?.webContents?.getURL?.();
  return url ? documentIdFromUrl(url, origin) : null;
}

/**
 * Measure the content the way the PDF will see it: under print media.
 *
 * The settle report says the document rendered. It is measured on screen, and
 * that turned out not to be the same question — `globals.css`'s `@media print`
 * block hid the whole page and produced a 947-byte PDF with the right title and
 * nothing in it. Nothing in the screen DOM shows that, and nothing in
 * `printToPDF`'s return value does either: Chromium reports success and hands
 * back a valid, empty document.
 *
 * So the check is made in the medium that matters, through the one API that can
 * switch it: `Emulation.setEmulatedMedia`, over the debugger Electron already
 * exposes. Returns the content height, or `null` when the protocol is
 * unavailable — an inability to check is not a reason to refuse to print, and
 * the log says which of the two happened.
 */
async function measureInPrintMedia(contents, log) {
  try {
    contents.debugger.attach("1.3");
  } catch (error) {
    log(`could not verify the print layout (${error.message}); printing anyway`);
    return null;
  }
  try {
    await contents.debugger.sendCommand("Emulation.setEmulatedMedia", { media: "print" });
    const height = await contents.executeJavaScript(
      `(() => {
         const el = document.querySelector(".document-container.document-view");
         return el ? Math.round(el.getBoundingClientRect().height) : 0;
       })()`,
      true,
    );
    log(`content height under print media: ${height}px`);
    return height;
  } finally {
    await contents.debugger
      .sendCommand("Emulation.setEmulatedMedia", { media: "" })
      .catch(() => {});
    contents.debugger.detach();
  }
}

export async function exportDocumentPdf({ origin, id, parent, defaultDir, log }) {
  const printer = new BrowserWindow({
    show: false,
    // A4 at 96 dpi, near enough: the layout is responsive, and rendering it at
    // a phone width would print a phone's line breaks.
    width: 1000,
    height: 1400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // A window that is never shown is a window Chromium is entitled to
      // throttle, and a throttled renderer settles slowly or not at all.
      backgroundThrottling: false,
    },
  });

  try {
    await printer.loadURL(`${origin}/view/${id}`);
    const report = await printer.webContents.executeJavaScript(SETTLE, true);
    if (!report?.ok) {
      throw new Error(
        `There is nothing to print at /view/${id}: ${report?.reason ?? "the page did not render"}.`,
      );
    }
    log(
      `pdf source settled: ${report.chars} characters, ${report.images} image(s)` +
        (report.broken ? `, ${report.broken} that did not load` : "") +
        `, ${report.height}px tall`,
    );

    const target = await dialog.showSaveDialog(parent ?? printer, {
      title: "Export as PDF",
      defaultPath: path.join(defaultDir, pdfFileName(report.title, id)),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (target.canceled || !target.filePath) return null;

    await printer.webContents.insertCSS(PRINT_CSS);

    const printHeight = await measureInPrintMedia(printer.webContents, log);
    if (printHeight === 0) {
      throw new Error(
        "The page renders on screen but is empty under print media — something in the " +
          "app's `@media print` rules is hiding it. Refusing to write a blank PDF.",
      );
    }

    const data = await printer.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      generateDocumentOutline: true,
    });
    if (data.length === 0) throw new Error("Chromium produced an empty PDF.");

    await fs.writeFile(target.filePath, data);
    log(`wrote ${target.filePath} (${data.length} bytes)`);
    return { path: target.filePath, bytes: data.length, report };
  } finally {
    // `destroy`, not `close`: nothing is listening for this window's lifecycle
    // and a `beforeunload` in the page must not be able to keep it alive.
    if (!printer.isDestroyed()) printer.destroy();
  }
}
