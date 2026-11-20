/**
 * The real `GraphRenderer` (docs/plans/archive/agent-block.md §4.2, phase 5): a
 * hidden GeoGebra applet, loaded from `public/geogebra` exactly as the Graph
 * dialog loads it — `deployggb.js`, then `GGBApplet` with the `web3d`
 * codebase and the same `suite` app — but off-screen, and without toolbar,
 * menu or input bar. Not the leaner `graphing` app: it refuses geometry
 * commands (`Polygon`, `Segment` are "Unknown command" there), and the suite
 * saves a `.ggb` whose sub-app is `graphing` anyway, which is what the
 * dialog's Update exports as SVG.
 *
 * Nothing imports this file statically. `agentGraph.ts` reaches it through a
 * dynamic `import()` the first time a graph is plotted, so a page that never
 * plots one — every page on the VPS — never loads it or the applet.
 *
 * What the spike (§12) established, and this file relies on:
 *
 * - The applet evaluates, exports and saves while `visibility: hidden` and
 *   off-screen; `exportSVG` straight after `evalCommand` is already painted.
 * - Cold start is about 0.6 s from local files, and a reset between plots
 *   (`setBase64` of the empty construction captured at load) about 50 ms, so
 *   one applet per window is loaded once and reused. Calls are queued: there
 *   is one applet, and a plot is a reset plus a sequence of commands.
 * - `evalCommand`'s boolean does not separate a rejected command from a void
 *   one (`SetValue`, `ZoomIn` answer `false` and work). A rejected command
 *   raises GeoGebra's error dialog inside the applet's own frame, so that is
 *   the signal, and its message is the tool error. The dialog is not there
 *   synchronously, and one `setTimeout(0)` was measured to be not always
 *   enough (an error then surfaced against the *next* command), so a `false`
 *   is followed by a short poll — measured at about 5 ms, allowed 250 — and a
 *   `true` by nothing.
 */
import type { GraphPlotResult, GraphRenderer } from "./agentGraph";

interface GeoGebraApi {
  evalCommand(command: string): boolean;
  getBase64(): string;
  setBase64(value: string, callback?: () => void): void;
  getXML(): string;
  getAllObjectNames(): string[];
  exportSVG(callback: (svg: string) => void): void;
  setSize(width: number, height: number): void;
  setPerspective(perspective: string): void;
}

type GGBAppletConstructor = new (
  parameters: Record<string, unknown>,
  version: string,
) => {
  inject(element: HTMLElement): void;
  setHTML5Codebase(path: string): void;
};

declare global {
  interface Window {
    GGBApplet?: GGBAppletConstructor;
  }
}

const SCRIPT_SRC = "/geogebra/deployggb.js";
const CODEBASE = "/geogebra/HTML5/5.0/web3d/";
const APPLET_ID = "agentGraphApplet";
const LOAD_TIMEOUT_MS = 45_000;
/** How long a command that answered `false` is given to raise its error. */
const ERROR_WAIT_MS = 250;
/** Labels in GeoGebra's error dialog that are buttons or the title, not the message. */
const DIALOG_CHROME = new Set(["Error", "OK", "Close", "Show Online Help"]);

interface Applet {
  api: GeoGebraApi;
  host: HTMLElement;
  /** The empty construction, captured at load: what every plot starts from. */
  blank: string;
}

let applet: Promise<Applet> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(): Promise<void> {
  if (window.GGBApplet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // The Graph dialog may have loaded it already (through `next/script`), or
    // be loading it now; one more copy of the deploy script is harmless, a
    // missing one is not.
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("could not load GeoGebra"));
    document.head.appendChild(script);
  });
}

async function inject(): Promise<Applet> {
  await loadScript();
  const GGBApplet = window.GGBApplet;
  if (!GGBApplet) throw new Error("GeoGebra did not load");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.dataset.agentGraph = "";
  // Off-screen *and* hidden: never seen, never focusable, never hit-tested —
  // and still laid out, which the applet needs to size its view and paint.
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:1600px;" +
    "height:1600px;visibility:hidden;pointer-events:none;overflow:hidden";
  const mount = document.createElement("div");
  host.appendChild(mount);
  document.body.appendChild(host);

  try {
    const api = await new Promise<GeoGebraApi>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("GeoGebra took too long to start")),
        LOAD_TIMEOUT_MS,
      );
      const parameters = {
        id: APPLET_ID,
        appName: "suite",
        language: "en",
        width: 720,
        height: 480,
        showToolBar: false,
        showMenuBar: false,
        showAlgebraInput: false,
        showResetIcon: false,
        showZoomButtons: false,
        showFullscreenButton: false,
        enableRightClick: false,
        enableShiftDragZoom: false,
        enableLabelDrags: false,
        showTutorialLink: false,
        preventFocus: true,
        // On, deliberately: the error dialog is how a rejected command is
        // told apart from a void one. It opens inside this hidden frame.
        errorDialogsActive: true,
        appletOnLoad(loaded: GeoGebraApi) {
          clearTimeout(timer);
          resolve(loaded);
        },
      };
      const instance = new GGBApplet(parameters, "5.0");
      instance.setHTML5Codebase(CODEBASE);
      instance.inject(mount);
    });
    return { api, host, blank: api.getBase64() };
  } catch (error) {
    host.remove();
    throw error;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The error a command raised, waiting up to `ERROR_WAIT_MS` for it; or null. */
async function awaitError(host: HTMLElement): Promise<string | null> {
  const start = performance.now();
  for (;;) {
    await sleep(5);
    const error = takeError(host);
    if (error !== null || performance.now() - start >= ERROR_WAIT_MS) return error;
  }
}

/** The message of an error dialog the applet raised, removing it; or null. */
function takeError(host: HTMLElement): string | null {
  const dialogs = [...host.querySelectorAll<HTMLElement>(".dialogComponent")];
  if (dialogs.length === 0) return null;
  const message = [...dialogs[0].querySelectorAll<HTMLElement>(".gwt-Label")]
    .map((label) => label.textContent?.trim() ?? "")
    .filter((text) => text && !DIALOG_CHROME.has(text))
    .join(" ");
  for (const dialog of dialogs) dialog.remove();
  return message || "GeoGebra rejected it";
}

async function plotOnce(
  { api, host, blank }: Applet,
  commands: readonly string[],
  size: { width: number; height: number },
): Promise<GraphPlotResult> {
  await new Promise<void>((resolve) => api.setBase64(blank, resolve));
  takeError(host);
  api.setPerspective("G");
  api.setSize(size.width, size.height);
  for (const [index, command] of commands.entries()) {
    let defined: boolean;
    try {
      defined = api.evalCommand(command);
    } catch (error) {
      return { ok: false, index, error: error instanceof Error ? error.message : String(error) };
    }
    if (defined) continue;
    const error = await awaitError(host);
    if (error !== null) return { ok: false, index, error };
  }
  const svg = await new Promise<string>((resolve) => api.exportSVG(resolve));
  return {
    ok: true,
    plot: {
      svg,
      ggb: api.getBase64(),
      xml: api.getXML(),
      objects: api.getAllObjectNames(),
    },
  };
}

export async function geogebraRenderer(): Promise<GraphRenderer> {
  return {
    plot(commands, size) {
      const run = queue.then(async () => {
        if (!applet) {
          applet = inject();
          // A failed start is retried by the next call rather than cached.
          applet.catch(() => {
            applet = null;
          });
        }
        return plotOnce(await applet, commands, size);
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
