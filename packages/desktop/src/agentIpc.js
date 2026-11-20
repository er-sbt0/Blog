import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { BrowserWindow, dialog, ipcMain } from "electron";
import {
  addGrants,
  createCanUseTool,
  createPermissionBroker,
  describeResume,
  isGrant,
  MAX_GRANTS,
  reconcileGrants,
} from "./agentPermissions.js";
import { CONTEXT_LIMITS, DOC_SERVER, DOC_TOOLS, toolTimeoutMs } from "./agentProtocol.js";
import { createSessionStore, isSessionId } from "./agentSessions.js";
import { prepareImageInput } from "./agentFiles.js";
import { claudeConfigDir, readTranscript } from "./agentTranscript.js";

/**
 * The main process's half of `window.desktop.agent` (docs/plans/archive/agent-block.md
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
 *   model, not a command line. Which tools exist is decided in `agent.js`,
 *   and the renderer cannot widen them: it can answer a card main sent and
 *   narrow a session's grants, nothing else.
 * - **Ids are minted here and checked against their owner.** Session ids and
 *   tool-call ids are `randomUUID()`s from this process; every message naming
 *   one is refused unless it comes from the WebContents that owns it; a result
 *   can answer only a call that is pending.
 *
 * ### Permissions (phase 2)
 *
 * The third round trip. `canUseTool` (built in `agentPermissions.js`) asks the
 * broker, which mints a request id, sends the card to the window that owns the
 * session on the session's event stream, and accepts an answer
 * (`agent:permission-answer`) only from that window and only for a pending id.
 * Unanswered is **deny**: after `PERMISSION_TIMEOUT_MS`, on an interrupt, when
 * the window closes, and when its page navigates away (a reload loses the card,
 * so the question must not outlive it).
 *
 * "Always" is enforced here, not in the block: the session's grants live on
 * its entry and in `agent-sessions.json`, every turn gets them as
 * `allowedTools`, and a send can only *narrow* them to what the block still
 * claims (`reconcileGrants`).
 *
 * ### Claiming a session
 *
 * A block that is reopened claims its session on first send — the owner of a
 * restored session is whichever window sends first, so anything that can read
 * the post could resume its session in the folder the author chose. Phase 1
 * accepted that because the session had only the doc tools. Now that it can
 * reach a shell, **a claim costs a confirmation**: a session restored from
 * `agent-sessions.json`, or taken over by a different window, runs its next
 * turn only after a "Resume this session in <cwd>?" card is allowed. The card
 * is the same broker round trip as a tool's, so a decline, a timeout and an
 * interrupt all leave the turn unrun.
 *
 * ### Lifecycle (phase 6)
 *
 * A turn's writes go to the editor holding its block, so a turn whose page is
 * gone has nowhere to write. Closing the window aborts its sessions; a
 * **reload** or navigation of the main frame — and a renderer crash —
 * interrupts every running turn the page owned and denies its cards. The
 * session stays: the reloaded block re-attaches to it on mount, and its next
 * prompt resumes it in the same window with no confirmation. Re-attaching a
 * *running* turn instead was considered and not done: the turn's log and
 * cards lived in the page that went, so a re-attached block would show a turn
 * already half over with none of its history, and the denied cards would have
 * stopped it at its next tool call anyway.
 *
 * ### The transcript (phase 6)
 *
 * `agent:transcript` reads the session's own `<sessionId>.jsonl`
 * (`agentTranscript.js`) from main's record of its folder, for the block's
 * "Full transcript" link. The renderer names the session and nothing else. A
 * session another live window holds is refused; one no window holds (a
 * restored record) is readable by the window that asks — the same claim a
 * resume makes, minus the shell, and without a card, because what it hands
 * back is what that session already did in this author's folder.
 *
 * What none of this defends against, said plainly: a card is answered by the
 * renderer, so a script running in it can answer one as easily as it can type
 * a prompt. The cards keep the *author* from being surprised; the folder
 * dialog, which is native and main-owned, is what keeps a script from choosing
 * where a shell runs.
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

  const broker = createPermissionBroker({
    notify: (owner, payload) => send(owner, "agent:event", payload),
  });

  /** A window that goes away takes its sessions with it, mid-turn or not. */
  function watch(owner) {
    if (watched.has(owner)) return;
    watched.add(owner);
    owner.once("destroyed", () => {
      broker.denyOwner(owner, "closed");
      for (const [id, entry] of sessions) {
        if (entry.owner !== owner) continue;
        entry.session.close();
        sessions.delete(id);
      }
    });
    // A reload or a navigation drops the page holding the cards. Electron 44
    // passes a details object; the positional form is the older spelling.
    owner.on("did-start-navigation", (details, _url, isInPlace, isMainFrame) => {
      const sameDocument = details?.isSameDocument ?? isInPlace;
      const mainFrame = details?.isMainFrame ?? isMainFrame;
      if (mainFrame && !sameDocument) pageGone(owner);
    });
    owner.on("render-process-gone", () => pageGone(owner));
  }

  /**
   * The page holding `owner`'s blocks went — a reload, a navigation, a crash.
   * Its cards are denied and its running turns interrupted (see the file
   * comment); the sessions themselves stay, so the reloaded blocks resume.
   */
  function pageGone(owner) {
    broker.denyOwner(owner, "closed");
    for (const entry of sessions.values()) {
      if (entry.owner === owner && entry.session.running) entry.session.interrupt();
    }
  }

  function persistGrants(entry) {
    try {
      store.setGrants(entry.session.sessionId, entry.grants);
    } catch (cause) {
      // Costs the grant its survival across a restart, nothing now.
      console.error("[desktop] could not record the agent session's grants", cause);
    }
  }

  /**
   * The bridge's `executeTool`: one call to the renderer, one answer back.
   *
   * `cwd` is the session entry's — main's record, never anything the renderer
   * sent. `insert_image { path }` is read here against it (`agentFiles.js`),
   * and the renderer receives the bytes, never the path.
   */
  async function callRenderer(owner, sessionId, name, input, cwd) {
    if (!DOC_TOOLS.includes(name)) {
      return { ok: false, error: `Unknown doc tool ${name}.` };
    }
    if (owner.isDestroyed()) {
      return { ok: false, error: "The post's window is closed." };
    }
    if (name === "insert_image") {
      const prepared = await prepareImageInput(input, cwd);
      if (!prepared.ok) return prepared;
      input = prepared.input;
      if (owner.isDestroyed()) return { ok: false, error: "The post's window is closed." };
    }
    const callId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(callId);
        resolve({ ok: false, error: "The editor did not answer in time." });
      }, toolTimeoutMs(name));
      pending.set(callId, { owner, resolve, timer });
      send(owner, "agent:tool-call", { callId, sessionId, name, input });
    });
  }

  async function createSession({ owner, sessionId, resume, cwd, grants, confirmed }) {
    const agent = await loadAgent();
    // `entry` is read when a call arrives, so a session re-claimed by another
    // window (see the file comment) sends its calls to the window that has it.
    const entry = { owner, session: null, cwd, grants, confirmed };
    const canUseTool = createCanUseTool({
      docServer: DOC_SERVER,
      ask: (card, signal) =>
        broker.request({ owner: entry.owner, sessionId: entry.session.sessionId, card, signal }),
      onGrant: (granted) => {
        entry.grants = addGrants(entry.grants, granted);
        persistGrants(entry);
        send(entry.owner, "agent:event", {
          sessionId: entry.session.sessionId,
          type: "grants",
          grants: entry.grants,
        });
      },
    });
    entry.session = agent.createAgentSession({
      ...(sessionId ? { sessionId } : {}),
      resume,
      cwd,
      executeTool: (name, input) =>
        callRenderer(entry.owner, entry.session.sessionId, name, input, entry.cwd),
      onEvent: (payload) => send(entry.owner, "agent:event", payload),
      log,
      canUseTool,
      grants: () => entry.grants,
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

  /** The grants a block still shows. Only ever used to narrow main's record. */
  const claimsOf = (options) =>
    Array.isArray(options?.grants) ? options.grants.filter(isGrant).slice(0, MAX_GRANTS) : [];

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
      // The folder dialog the author just answered is this session's
      // confirmation; it starts with no grants.
      entry = await createSession({ owner, resume: false, cwd, grants: [], confirmed: true });
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
      entry.confirmed = false;
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
        entry = await createSession({
          owner,
          sessionId,
          resume: true,
          cwd,
          grants: store.grantsOf(sessionId),
          confirmed: false,
        });
      } catch (cause) {
        console.error("[desktop] could not resume an agent session", cause);
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
      log(`agent: resumed ${sessionId} in ${cwd}`);
    }
    if (entry.session.running) {
      return { ok: false, error: "The agent is still working on the last prompt." };
    }

    // Narrow to what the block still shows; tell it if that differs from what
    // it claimed, so it never displays a grant main is not applying.
    const claims = claimsOf(options);
    const narrowed = reconcileGrants(entry.grants, claims);
    if (narrowed.length !== entry.grants.length) {
      entry.grants = narrowed;
      persistGrants(entry);
    }
    if (narrowed.length !== claims.length || narrowed.some((grant, i) => grant !== claims[i])) {
      send(owner, "agent:event", { sessionId, type: "grants", grants: narrowed });
    }

    const gate = entry.confirmed
      ? undefined
      : async (signal) => {
        const { decision } = await broker.request({
          owner: entry.owner,
          sessionId,
          card: describeResume(entry.cwd),
          signal,
        });
        if (decision !== "allow") return false;
        entry.confirmed = true;
        return true;
      };
    return entry.session.send(prompt, options?.context, { gate });
  });

  ipcMain.handle("agent:interrupt", (event, sessionId) => {
    const entry = sessions.get(sessionId);
    if (!entry || entry.owner !== event.sender) return false;
    // Cards first: a turn blocked on one would otherwise wait for an answer
    // nobody will give before it noticed the interrupt.
    broker.denySession(sessionId, "interrupted");
    return entry.session.interrupt();
  });

  ipcMain.handle("agent:transcript", async (event, sessionId) => {
    if (!isSessionId(sessionId)) return { ok: false, error: "Unknown agent session." };
    const entry = sessions.get(sessionId);
    if (entry && entry.owner !== event.sender && !entry.owner.isDestroyed()) {
      return { ok: false, error: "This session is open in another window." };
    }
    // Main's record, never the block's `cwd` (see the file comment).
    const cwd = entry?.cwd ?? store.lookup(sessionId);
    if (!cwd) {
      return {
        ok: false,
        error: "This app has no record of that session's folder — it was " +
          "started on another machine, or the record is gone.",
      };
    }
    return readTranscript({ configDir: claudeConfigDir(process.env), cwd, sessionId });
  });

  ipcMain.on("agent:permission-answer", (event, requestId, decision) => {
    broker.answer(event.sender, requestId, decision);
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
      broker.denyAll("closed");
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
      ipcMain.removeHandler("agent:transcript");
      ipcMain.removeAllListeners("agent:tool-result");
      ipcMain.removeAllListeners("agent:permission-answer");
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
