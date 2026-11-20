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
 * **`sessions` is the second capability, and makes its own argument**
 * (docs/plans/remote-claude.md §2.2, §4.2). It cannot reuse the terminal's
 * "the argv is fixed" — an ssh destination is user input and does become an
 * argv element. What keeps it narrow instead:
 *
 * - The renderer passes a host **id**, never an alias. The main process reads
 *   the alias from the server, which answers only for a host the signed-in
 *   author already added in Settings, and validates it again before spawning
 *   (`isValidHost` in `remoteSessions.js`, `--` before it, no shell). So a
 *   compromised renderer can re-sync a host the user chose; it cannot name a
 *   new one, or choose what an existing one runs.
 * - The ssh options and both remote scripts are constants in the main process.
 *   Nothing that crosses this bridge reaches a command line, and the read
 *   script refuses any path outside `~/.claude/projects`.
 * - The answer is `{ ok, derived }` or `{ ok: false, error }` — a count or
 *   ssh's message, never transcript bytes. Those reach the renderer only
 *   through the authorized `/api/remote-sessions` routes, like any other data.
 *
 * **`agent` is the third capability** (docs/plans/agent-block.md §4.3). It
 * starts a Claude Agent SDK session, which is a `claude` with the user's
 * privileges, so its argument has to be at least as strong as the terminal's:
 *
 * - The renderer sends a **prompt** and a **context** — text for a model,
 *   never an argv element, an environment or a path. Both are copied out here
 *   field by field (`turn` below) and capped again in main. The cwd is chosen
 *   in a main-process folder dialog when `start` runs and only handed back for
 *   display; a resume reads it from main's own record, never from the block.
 *   So a script in the renderer cannot point a session at a directory of its
 *   choosing. Which tools the session has is fixed in `agent.js`.
 * - Session ids and tool-call ids are minted in the main process, and every
 *   message naming one is checked against the WebContents that owns it
 *   (`agentIpc.js`). A `toolResult` can only answer a call that is pending.
 * - What comes back is a narrow projection of the SDK's stream — text, tool
 *   names with a one-line description, a result — and doc-tool calls whose
 *   names main defined. The renderer executes those against the editor holding
 *   the session's block; main never writes a document.
 * - **`insert_image { path }` reads the disk in main, not here** (phase 3).
 *   Main resolves the path against its own record of the session's folder,
 *   follows symlinks and re-checks containment, caps the size and sniffs the
 *   type (`agentFiles.js`); the tool call that reaches the renderer carries
 *   the bytes and their type, never a path. No new method: it is the existing
 *   `onToolCall`.
 * - **Permissions add one call, `answerPermission(requestId, decision)`, and no
 *   new subscription** (phase 2). The card arrives as a `permission` event on
 *   the session's existing `onEvent` stream. The answer is one of three fixed
 *   strings for an id main minted: main ignores it unless the id is pending,
 *   the card was sent to *this* window, and the card offered that choice. It
 *   cannot name a tool, a command or a rule — "always" grants exactly the rule
 *   main derived from the CLI's suggestion and showed on the card — so the
 *   most a renderer can do with it is say yes to a question main asked, which
 *   it could already do by typing a prompt. Grants the block shows go back on
 *   each send as `grants`, and main uses them only to *narrow* its own record:
 *   a grant main did not record is dropped, never applied.
 *
 * Channel names are repeated from `pty.js` and `remoteSessionsIpc.js` rather
 * than imported: a sandboxed preload cannot import an ES module from the
 * shell, and inventing a bundle step to share a handful of strings would cost
 * more than the repetition.
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

/**
 * A turn's prompt, context and the grants the block shows (strings, at most
 * 50; main validates each and only narrows by them), copied out by hand for
 * the reason `size` is:
 * only these fields, as strings (the selection as the plain JSON object
 * `captureSelection` makes), so nothing else the caller hung on the object
 * crosses — and nothing that cannot be cloned turns a send into an exception.
 */
function turn(value) {
  const context = value?.context ?? {};
  const grants = Array.isArray(value?.grants)
    ? value.grants.filter((grant) => typeof grant === "string").slice(0, 50)
    : [];
  let selection = null;
  try {
    selection = context.selection ? JSON.parse(JSON.stringify(context.selection)) : null;
  } catch {
    selection = null;
  }
  return {
    prompt: typeof value?.prompt === "string" ? value.prompt : "",
    grants,
    context: {
      title: typeof context.title === "string" ? context.title : "",
      blockId: typeof context.blockId === "string" ? context.blockId : "",
      outline: typeof context.outline === "string" ? context.outline : "",
      selection,
    },
  };
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
  sessions: {
    /**
     * Sync one host the user added. Resolves to `{ ok: true, derived }` or
     * `{ ok: false, error }`; never rejects. A second call for a host already
     * syncing gets the same answer as the first.
     */
    sync: (hostId) => ipcRenderer.invoke("sessions:sync", hostId),
    /** `({ hostId, done, total }) => void`, bytes read so far. Returns an unsubscribe. */
    onProgress: (callback) => subscribe("sessions:progress", callback),
  },
  agent: {
    /**
     * Choose a folder (a main-process dialog) and run the first turn. Resolves
     * to `{ ok: true, sessionId, cwd }` or `{ ok: false, error, cancelled? }`.
     */
    start: (options) => ipcRenderer.invoke("agent:start", turn(options)),
    /** A follow-up turn of a session; resumes it if main no longer holds it. */
    send: (sessionId, options) => ipcRenderer.invoke("agent:send", sessionId, turn(options)),
    /** Interrupt the current turn of a session this window owns. */
    interrupt: (sessionId) => ipcRenderer.invoke("agent:interrupt", sessionId),
    /**
     * `(event) => void` for one session. Returns an unsubscribe. Filtered here
     * rather than by channel, so main has one channel to send on.
     */
    onEvent: (sessionId, callback) =>
      typeof callback === "function"
        ? subscribe("agent:event", (event) => {
            if (event?.sessionId === sessionId) callback(event);
          })
        : () => {},
    /** `({ callId, sessionId, name, input }) => void`. Returns an unsubscribe. */
    onToolCall: (callback) => subscribe("agent:tool-call", callback),
    /** Answer a pending tool call. The result is structured-cloned as plain data. */
    toolResult: (callId, result) => ipcRenderer.send("agent:tool-result", callId, result),
    /**
     * Answer a permission card: `"allow"`, `"always"` or `"deny"`. Only the two
     * strings cross; main checks both (see the file comment).
     */
    answerPermission: (requestId, decision) =>
      ipcRenderer.send(
        "agent:permission-answer",
        typeof requestId === "string" ? requestId : "",
        typeof decision === "string" ? decision : "",
      ),
  },
});
