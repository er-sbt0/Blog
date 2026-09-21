const { contextBridge, ipcRenderer } = require("electron");

/**
 * The first privileged renderer API this application has ever had.
 *
 * docs/plans/in-app-terminal.md §2.1. Until this file existed, the window was
 * created with `contextIsolation: true, nodeIntegration: false` and **no
 * preload script at all** — the renderer had no privileged API, not a reduced
 * one, none — and two places in the shell are written around that absence and
 * say so (`pdf.js:129`, `menu.js:64`). So this is a security surface rather
 * than a wiring detail, and it is sharpened by the fact that the AppImage runs
 * `--no-sandbox` (docs/plans/desktop-app.md §15.5) over a renderer that
 * displays stored SVG: a bridge is reachable by any script the renderer loads.
 *
 * The narrowness argument, stated once here because this is the file it is
 * about. What is exposed is not "run a program" — it is *write to the session
 * that exists*, resize it, subscribe to it, restart it. Two properties of
 * `pty.js` are what make that possible, and both are §4.1 and §4.7 rather than
 * luck: the child's argv is fixed in the main process, so there is no `spawn`
 * to expose; and there is one session per window, so there is no session id to
 * guess or enumerate. Nothing here takes a command, a path, or an environment.
 *
 * The honest statement of the cost, from §2.1: after this lands, adding the
 * next capability to the bridge is an argument about that capability rather
 * than an argument about whether the shell has a bridge at all. Anything added
 * to `window.desktop` should have to make that argument.
 *
 * **CommonJS, and `.cjs` rather than `.js` on purpose.** A preload script is
 * sandboxed by default under `contextIsolation`, and a sandboxed preload has no
 * ES module loader — but `--no-sandbox` is exactly the configuration the
 * packaged AppImage runs, and an *unsandboxed* preload does go through Node's
 * loader, which reads this package's `"type": "module"` and would refuse
 * `require`. The extension is what makes the file mean the same thing in both
 * cases; a `.js` here would work in `pnpm desktop` and fail only in the
 * packaged build, which is the worst available split.
 *
 * Channel names are repeated from `pty.js` rather than imported: a sandboxed
 * preload cannot import an ES module from the shell, and inventing a bundle
 * step to share four strings would cost more than the repetition.
 */

/**
 * Subscribe, and hand back the unsubscribe.
 *
 * `IpcRendererEvent` is never passed through. It carries `sender`, `ports` and
 * `senderId` — a handle back onto the IPC machinery — and handing it to a
 * renderer callback would quietly widen this bridge from "a string of terminal
 * output" to "the IPC surface", which is the opposite of the argument above.
 * Only the payload crosses.
 *
 * The unsubscribe is returned rather than left to a `removeListener` spelling
 * on the renderer's side, because the listener is a closure this file made and
 * the renderer has no other way to name it — and a rail view that mounts and
 * unmounts as the user switches between five views (§4.7) would otherwise
 * accumulate one listener per visit.
 */
function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * Only the two numbers, copied out by hand.
 *
 * Everything crossing IPC is structured-cloned, and a caller that passes an
 * xterm `IDisposable`, a DOM element or a React ref — all of which have the
 * `cols`/`rows` pair hanging off them somewhere — would otherwise get an
 * opaque "object could not be cloned" rather than a resize. The main process
 * validates these again (`sanitizeSize` in `terminal.js`); this is about the
 * message being sendable at all, not about trusting it.
 */
function size(value) {
  return { cols: value?.cols, rows: value?.rows };
}

contextBridge.exposeInMainWorld("desktop", {
  terminal: {
    /** `{ available: true, running, command, cwd }` or `{ available: false, reason, searched }`. */
    status: () => ipcRenderer.invoke("terminal:status"),
    /** Start the session if there is not one; resolves to the same status shape. */
    start: (value) => ipcRenderer.invoke("terminal:start", size(value)),
    /** Kill whatever is running and start again — what the exited view offers. */
    restart: (value) => ipcRenderer.invoke("terminal:restart", size(value)),
    write: (data) => ipcRenderer.send("terminal:write", data),
    resize: (value) => ipcRenderer.send("terminal:resize", size(value)),
    /** `(chunk: string) => void`. Returns an unsubscribe. */
    onData: (callback) => subscribe("terminal:data", callback),
    /** `({ code, signal }) => void`. Returns an unsubscribe. */
    onExit: (callback) => subscribe("terminal:exit", callback),
  },
});
