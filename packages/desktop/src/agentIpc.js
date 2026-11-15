import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { CONTEXT_LIMITS, DOC_TOOLS, TOOL_TIMEOUT_MS } from "./agentProtocol.js";
import { createSessionStore, isSessionId } from "./agentSessions.js";

/**
 * The main process's half of `window.desktop.agent` (docs/plans/agent-block.md
 * §4.3). Thin, as `pty.js` is to `terminal.js`: a session lives in `agent.js`;
 * this file owns `ipcMain`, the folder dialog, the session→owner map and the
 * tool-call round trip to the renderer.
 *
 * The narrowness argument `preload.cjs` asks for:
 *
 * - **The renderer names no directory.** `agent:start` opens a main-process
 *   folder dialog and the session runs wherever the *author* pointed it; the
 *   path goes back only for display. A resume reads the folder from main's own
 *   record (`agentSessions.js`), never from the block, so a script that edits a
 *   post's stored `cwd` moves a label and nothing else.
 * - **The renderer chooses no argv, environment or tools.** It sends a prompt
 *   and a context of capped strings (`sanitizeContext`), which are text for a
 *   model, not a command line. Which tools exist — and that phase 1 has no Bash
 *   — is decided in `agent.js`.
 * - **Ids are minted here and checked against their owner.** Session ids and
 *   tool-call ids are `randomUUID()`s from this process; every message naming
 *   one is refused unless it comes from the WebContents that owns it; a result
 *   can answer only a call that is pending.
 *
 * One honest widening, for phase 2 to weigh: a block that is reopened claims
 * its session on first send (the owner of a restored session is whichever
 * window sends first). Anything that can read the post can therefore resume its
 * session in the folder the author chose for it. In phase 1 that session has
 * the doc tools and nothing else; once phase 2 gives it a shell, the same claim
 * needs the permission cards in front of it.
 */

export function installAgent({ workspace, sessionsFile, log }) {
  const store = createSessionStore(sessionsFile);
  /** sessionId -> { owner, session } */
  const sessions = new Map();
  /** callId -> { owner, resolve, timer } */
  const pending = new Map();
  /** Owners whose `destroyed` we already listen for. */
  const watched = new WeakSet();

  function send(owner, channel, payload) {
    if (!owner.isDestroyed()) owner.send(channel, payload);
  }

  /** A window that goes away takes its sessions with it, mid-turn or not. */
  function watch(owner) {
    if (watched.has(owner)) return;
    watched.add(owner);
    owner.once("destroyed", () => {
      for (const [id, entry] of sessions) {
        if (entry.owner !== owner) continue;
        entry.session.close();
        sessions.delete(id);
      }
    });
  }

  /** The bridge's `executeTool`: one call to the renderer, one answer back. */
  function callRenderer(owner, sessionId, name, input) {
    if (!DOC_TOOLS.includes(name)) {
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
      }, TOOL_TIMEOUT_MS);
      pending.set(callId, { owner, resolve, timer });
      send(owner, "agent:tool-call", { callId, sessionId, name, input });
    });
  }

  async function createSession({ owner, sessionId, resume, cwd }) {
    const agent = await loadAgent();
    // `entry` is read when a call arrives, so a session re-claimed by another
    // window (see the file comment) sends its calls to the window that has it.
    const entry = { owner, session: null };
    entry.session = agent.createAgentSession({
      ...(sessionId ? { sessionId } : {}),
      resume,
      cwd,
      executeTool: (name, input) =>
        callRenderer(entry.owner, entry.session.sessionId, name, input),
      onEvent: (payload) => send(entry.owner, "agent:event", payload),
      log,
    });
    sessions.set(entry.session.sessionId, entry);
    watch(owner);
    return entry;
  }

  const promptOf = (options) => {
    const prompt = typeof options?.prompt === "string" ? options.prompt.trim() : "";
    if (!prompt) return { error: "A prompt is required." };
    if (prompt.length > CONTEXT_LIMITS.prompt) return { error: "That prompt is too long." };
    return { prompt };
  };

  ipcMain.handle("agent:start", async (event, options) => {
    const { prompt, error } = promptOf(options);
    if (error) return { ok: false, error };
    const owner = event.sender;

    const window = BrowserWindow.fromWebContents(owner);
    const picked = await dialog.showOpenDialog(window ?? undefined, {
      title: "Choose the agent's working folder",
      buttonLabel: "Use this folder",
      defaultPath: workspace,
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, cancelled: true, error: "No folder was chosen." };
    }
    let cwd;
    try {
      cwd = fs.realpathSync(picked.filePaths[0]);
    } catch (cause) {
      return { ok: false, error: `That folder cannot be opened: ${cause.message}` };
    }

    let entry;
    try {
      entry = await createSession({ owner, resume: false, cwd });
    } catch (cause) {
      console.error("[desktop] could not start an agent session", cause);
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
    const { sessionId } = entry.session;
    try {
      store.remember(sessionId, cwd);
    } catch (cause) {
      // Costs this block its resume after a restart, nothing now.
      console.error("[desktop] could not record the agent session", cause);
    }
    const sent = entry.session.send(prompt, options?.context);
    if (!sent.ok) return sent;
    log(`agent: started ${sessionId} in ${cwd}`);
    return { ok: true, sessionId, cwd };
  });

  ipcMain.handle("agent:send", async (event, sessionId, options) => {
    if (!isSessionId(sessionId)) return { ok: false, error: "Unknown agent session." };
    const { prompt, error } = promptOf(options);
    if (error) return { ok: false, error };
    const owner = event.sender;

    let entry = sessions.get(sessionId);
    if (entry && entry.owner !== owner) {
      if (!entry.owner.isDestroyed() && entry.session.running) {
        return { ok: false, error: "This session is running in another window." };
      }
      entry.owner = owner;
      watch(owner);
    }
    if (!entry) {
      const cwd = store.lookup(sessionId);
      if (!cwd) {
        return {
          ok: false,
          error:
            "This app has no record of that session's folder — it was started " +
            "on another machine, or the record is gone. Add a new /agent block.",
        };
      }
      if (!fs.existsSync(cwd)) {
        return { ok: false, error: `The session's folder no longer exists: ${cwd}` };
      }
      try {
        entry = await createSession({ owner, sessionId, resume: true, cwd });
      } catch (cause) {
        console.error("[desktop] could not resume an agent session", cause);
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
      log(`agent: resumed ${sessionId} in ${cwd}`);
    }
    return entry.session.send(prompt, options?.context);
  });

  ipcMain.handle("agent:interrupt", (event, sessionId) => {
    const entry = sessions.get(sessionId);
    if (!entry || entry.owner !== event.sender) return false;
    return entry.session.interrupt();
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
      ipcMain.removeHandler("agent:send");
      ipcMain.removeHandler("agent:interrupt");
      ipcMain.removeAllListeners("agent:tool-result");
    },
  };
}

/**
 * `agent.js`, and the SDK and generated schema behind it, loaded at the first
 * start rather than at import — the rule `loadPtySpawn` sets for `node-pty`.
 * A module that failed to load at the top of `main.js` would stop the app
 * booting at all; deferred, the same failure costs the agent and nothing else.
 * A missing `src/generated/docSchema.mjs` lands here, with its own message.
 */
let agentModule = null;
function loadAgent() {
  agentModule ??= import("./agent.js").catch((error) => {
    agentModule = null;
    if (error?.code === "ERR_MODULE_NOT_FOUND" && /docSchema/.test(String(error.message))) {
      throw new Error(
        "The agent's doc-tool schema was not built. Run `pnpm desktop` (which " +
          "builds it) or `pnpm --filter @blog/desktop build:agent-schema`.",
      );
    }
    throw error;
  });
  return agentModule;
}
