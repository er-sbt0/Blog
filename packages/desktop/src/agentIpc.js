import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";

/**
 * The main process's half of `window.desktop.agent` (docs/plans/agent-block.md
 * §4.3, phase 0). Thin, as `pty.js` is to `terminal.js`: the session lives in
 * `agent.js`; this file owns `ipcMain` and the one thing that is new here — a
 * tool call that leaves the main process, is executed by the renderer against
 * the live editor, and comes back.
 *
 * The narrowness argument `preload.cjs` asks for:
 *
 * - **The renderer names no directory.** The cwd is chosen in this process —
 *   in phase 0 the terminal's own workspace directory, and from phase 1 a
 *   main-process folder dialog — and handed back for display. A script in the
 *   renderer cannot point a session at a directory of its choosing.
 * - **The renderer chooses no argv, environment or tools.** It passes a
 *   prompt, which is text to a model, not a command line. Which tools exist,
 *   and that phase 0 has no Bash, is decided in `agent.js`.
 * - **Ids are minted here and checked against their owner.** A session id and
 *   a tool-call id are both `randomUUID()`s from this process, every message
 *   naming one is dropped unless it comes from the WebContents the session
 *   belongs to, and a result can answer only a call that is pending.
 */

export function installAgent({ workspace, log }) {
  /** sessionId -> { owner, session } */
  const sessions = new Map();
  /** callId -> { owner, resolve, timer } */
  const pending = new Map();

  function send(owner, channel, payload) {
    if (!owner.isDestroyed()) owner.send(channel, payload);
  }

  /** The bridge's `executeTool`: one call to the renderer, one answer back. */
  function callRenderer(agent, owner, sessionId, name, input) {
    if (!agent.DOC_TOOLS.includes(name)) {
      return Promise.resolve({ ok: false, error: `Unknown doc tool ${name}.` });
    }
    if (owner.isDestroyed()) {
      return Promise.resolve({ ok: false, error: "The post's window is closed." });
    }
    const callId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(callId);
        resolve({ ok: false, error: "The editor did not answer in time." });
      }, agent.TOOL_TIMEOUT_MS);
      pending.set(callId, { owner, resolve, timer });
      send(owner, "agent:tool-call", { callId, sessionId, name, input });
    });
  }

  ipcMain.handle("agent:start", async (event, options) => {
    const prompt = typeof options?.prompt === "string" ? options.prompt.trim() : "";
    if (!prompt) return { ok: false, error: "A prompt is required." };
    const owner = event.sender;
    const cwd = workspace;
    let session;
    try {
      const agent = await loadAgent();
      session = agent.createAgentSession({
        cwd,
        prompt,
        executeTool: (name, input) => callRenderer(agent, owner, session.sessionId, name, input),
        onEvent: (payload) => {
          if (payload.type === "closed") sessions.delete(payload.sessionId);
          send(owner, "agent:event", payload);
        },
        log,
      });
    } catch (error) {
      console.error("[desktop] could not start an agent session", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    sessions.set(session.sessionId, { owner, session });
    log(`agent: started ${session.sessionId} in ${cwd}`);
    return { ok: true, sessionId: session.sessionId, cwd };
  });

  ipcMain.handle("agent:interrupt", (event, sessionId) => {
    const entry = sessions.get(sessionId);
    if (!entry || entry.owner !== event.sender) return false;
    entry.session.interrupt();
    return true;
  });

  ipcMain.on("agent:tool-result", (event, callId, result) => {
    const call = typeof callId === "string" ? pending.get(callId) : undefined;
    if (!call || call.owner !== event.sender) return;
    pending.delete(callId);
    clearTimeout(call.timer);
    // Structured-cloned on the way in, so it is plain data; anything that is
    // not an object is the renderer failing, and says so to the model.
    call.resolve(
      result && typeof result === "object"
        ? result
        : { ok: false, error: "The editor returned no result." },
    );
  });

  return {
    /**
     * Abort every session and give the channels back. As `pty.js`:
     * `ipcMain.handle` throws on a second registration for a channel.
     */
    dispose() {
      for (const { session } of sessions.values()) session.close();
      sessions.clear();
      for (const call of pending.values()) {
        clearTimeout(call.timer);
        call.resolve({ ok: false, error: "The app is closing." });
      }
      pending.clear();
      ipcMain.removeHandler("agent:start");
      ipcMain.removeHandler("agent:interrupt");
      ipcMain.removeAllListeners("agent:tool-result");
    },
  };
}

/**
 * `agent.js`, and the SDK behind it, loaded at the first start rather than at
 * import — the rule `loadPtySpawn` sets for `node-pty`. The SDK is plain
 * JavaScript, but it is 1.3 MB of it plus a peer graph, and a module that
 * failed to load at the top of `main.js` would stop the app booting at all.
 * Deferred, the same failure costs the agent and nothing else.
 */
let agentModule = null;
function loadAgent() {
  agentModule ??= import("./agent.js").catch((error) => {
    agentModule = null;
    throw error;
  });
  return agentModule;
}
