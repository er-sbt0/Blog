import fs from "node:fs";
import os from "node:os";
import { ipcMain } from "electron";
import {
  CLAUDE_ARGV,
  DEFAULT_SIZE,
  buildTerminalEnv,
  resolveClaudeBinary,
  sanitizeSize,
} from "./terminal.js";
import { buildMcpConfig, writeMcpConfig } from "./mcpConfig.js";

/**
 * The main process's half of the terminal: one PTY, and the IPC surface the
 * renderer drives it through.
 *
 * docs/plans/in-app-terminal.md §4.1, §4.2, §4.6, §4.7. This is the file that
 * owns `node-pty` and `ipcMain`, which is why it holds almost no decisions —
 * argv, binary resolution, the child's environment and the validation of every
 * number crossing the bridge all live in `terminal.js`, import-free and
 * specced, because a spec cannot load this module at all: `node-pty` is a
 * native addon built against Electron's ABI and will not open under plain Node.
 *
 * **This is a privileged surface, and it is the first one this app has ever
 * had** (§2.1). Two things make it narrower than "a bridge to a subprocess",
 * and both are §4.1's doing rather than luck:
 *
 * - The child's argv is fixed in this process (`CLAUDE_ARGV`), so there is no
 *   `spawn` to reach. The renderer cannot choose what runs; it can only write
 *   bytes to the one thing that does.
 * - There is one session per window (§4.7) and therefore **no session id
 *   anywhere in the API**. Nothing to guess, nothing to enumerate.
 *
 * What is left is still bytes going to a process with the user's privileges, so
 * every argument that arrives here is validated rather than forwarded, and
 * every message is checked against the WebContents that started the session.
 * The renderer is ours, but the renderer also displays stored SVG and the
 * AppImage runs `--no-sandbox` (docs/plans/desktop-app.md §15.5), so "our own
 * page sent it" is not a fact this file may assume.
 *
 * Channel names are string literals here and again in `preload.cjs` rather than
 * a shared constant: a preload script is sandboxed and cannot import an ES
 * module from the shell, and a fabricated bridge for the sake of sharing four
 * strings would be a worse trade than repeating them.
 */

/**
 * How long output is allowed to accumulate before it is sent as one message.
 *
 * A PTY emits a `data` event per read, and a command that prints a large file
 * produces thousands of them a second. One IPC message each would put the main
 * process's event loop — the loop that also owns the window — under a load that
 * has nothing to do with what is on screen, and xterm.js repaints from its own
 * buffer regardless of how the bytes arrived. Small enough that typing still
 * echoes as one frame.
 */
const FLUSH_MS = 4;

/**
 * Register the terminal's IPC handlers and own the session they drive.
 *
 * `serverEntry` may be absent, and that is a normal case rather than a failure:
 * the bundled MCP server is built by a separate step (§2.2), and watch mode has
 * no standalone tree at all. A terminal with no `.mcp.json` is still Claude
 * Code, only without a view of the library, so it is logged and started.
 */
export function installTerminal({
  workspace,
  databaseUrl,
  authorId,
  serverEntry,
  execPath,
  log,
}) {
  /** The one session, or null. `{ child, owner, disposables }`. */
  let session = null;
  /** Written once per launch, on the first start rather than at boot. */
  let mcpWritten = false;
  let pending = "";
  let flushTimer = null;

  function currentBinary() {
    // Resolved on every ask rather than cached at boot. The whole point of
    // §4.5's empty state is that it names an install command, and a user who
    // follows it would otherwise have to restart the app for the shell to
    // notice — which is exactly the moment an empty state stops being helpful
    // and starts looking broken.
    return resolveClaudeBinary({ env: process.env, home: os.homedir(), isExecutable });
  }

  function status() {
    const resolved = currentBinary();
    if (!resolved.command) {
      return { available: false, reason: resolved.reason, searched: resolved.searched };
    }
    return {
      available: true,
      running: session !== null,
      command: resolved.command,
      cwd: workspace,
    };
  }

  /**
   * The generated `.mcp.json` (§4.4), written before the first spawn.
   *
   * Deliberately quiet, and for the reason `reconcileDocumentBlobs` is quiet:
   * this is bookkeeping around a thing the user asked for, and a failure to
   * write a config file must not turn "open the terminal" into an error dialog.
   * The consequence of skipping it is legible on its own — the agent reports it
   * has no tools.
   */
  function ensureMcpConfig() {
    if (mcpWritten) return;
    mcpWritten = true;
    if (!serverEntry || !fs.existsSync(serverEntry)) {
      log(
        `terminal: no MCP server bundle at ${serverEntry ?? "(unset)"} — ` +
          "starting without a view of the library",
      );
      return;
    }
    try {
      const file = writeMcpConfig(
        workspace,
        buildMcpConfig({ execPath, serverEntry, databaseUrl, authorId }),
      );
      log(`terminal: wrote ${file}`);
    } catch (error) {
      console.error("[desktop] could not write the terminal's .mcp.json", error);
    }
  }

  function flush() {
    flushTimer = null;
    const chunk = pending;
    pending = "";
    if (chunk === "" || !session) return;
    if (session.owner.isDestroyed()) return;
    session.owner.send("terminal:data", chunk);
  }

  function emit(chunk) {
    pending += chunk;
    if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_MS);
  }

  async function start(event, options) {
    const resolved = currentBinary();
    if (!resolved.command) {
      return { available: false, reason: resolved.reason, searched: resolved.searched };
    }
    // Idempotent: the view is mounted and unmounted as the rail switches
    // between its five views (§4.7), and a second mount must find the session
    // that is already running rather than start a second one beside it.
    if (session) return status();

    ensureMcpConfig();

    const spawn = await loadPtySpawn();
    const size = sanitizeSize(options) ?? DEFAULT_SIZE;
    const child = spawn(resolved.command, CLAUDE_ARGV, {
      name: "xterm-256color",
      cols: size.cols,
      rows: size.rows,
      cwd: workspace,
      env: buildTerminalEnv(process.env, { home: os.homedir(), workspace }),
    });

    const owner = event.sender;
    const disposables = [
      child.onData((chunk) => emit(chunk)),
      child.onExit(({ exitCode, signal }) => {
        log(`terminal: claude exited (code ${exitCode}, signal ${signal ?? "none"})`);
        flush();
        session = null;
        if (!owner.isDestroyed()) {
          owner.send("terminal:exit", { code: exitCode, signal: signal ?? null });
        }
      }),
    ];

    session = { child, owner, disposables };
    log(`terminal: started ${resolved.command} in ${workspace} (${size.cols}x${size.rows})`);
    return status();
  }

  /**
   * Whether a message may act on the session.
   *
   * The session belongs to the WebContents that started it, so a message from
   * anything else — another window, a devtools context, a frame the page
   * embedded — is dropped rather than forwarded. There is one window today;
   * this is what stops that from being load-bearing.
   */
  function owns(event) {
    return session !== null && event.sender === session.owner;
  }

  function kill() {
    if (!session) return;
    const { child, disposables } = session;
    session = null;
    for (const disposable of disposables) disposable.dispose();
    clearTimeout(flushTimer);
    flushTimer = null;
    pending = "";
    try {
      // SIGHUP, node-pty's default: the signal a closing terminal sends, which
      // is what this is. §9's third open question is what that does to a turn
      // in flight, and the mitigating fact is worth stating where the kill
      // happens — `apply_ops` *proposes* rather than commits
      // (docs/plans/archive/agent-gating.md), so the worst outcome of killing a
      // `claude` mid-write is a malformed pending proposal the author can
      // decline. It is not damage to a document.
      child.kill();
    } catch (error) {
      console.error("[desktop] could not kill the terminal's child", error);
    }
  }

  ipcMain.handle("terminal:status", () => status());
  ipcMain.handle("terminal:start", (event, options) => start(event, options));
  ipcMain.handle("terminal:restart", (event, options) => {
    kill();
    return start(event, options);
  });

  ipcMain.on("terminal:write", (event, data) => {
    // A string, and only a string. `node-pty` also accepts a Buffer, and
    // accepting one here would mean the renderer choosing how its bytes are
    // decoded on the way to a process running as the user.
    if (!owns(event) || typeof data !== "string") return;
    session.child.write(data);
  });

  ipcMain.on("terminal:resize", (event, options) => {
    if (!owns(event)) return;
    const size = sanitizeSize(options);
    // `null` means the renderer sent something that is not a measurement —
    // ignored rather than defaulted, so a resize event fired before the rail
    // has laid out cannot snap a working terminal back to 80x24.
    if (!size) return;
    try {
      session.child.resize(size.cols, size.rows);
    } catch (error) {
      // The child can exit between the renderer measuring and this arriving.
      console.error("[desktop] could not resize the terminal", error);
    }
  });

  return {
    /**
     * Tear the session down and give the channels back.
     *
     * Called from `shutdown()` beside the Next child and the cluster. The
     * handlers are removed as well as the child killed, because `ipcMain.handle`
     * throws on a second registration for the same channel — so leaving them
     * behind would turn a future re-install into a crash at boot.
     */
    dispose() {
      kill();
      for (const channel of ["terminal:status", "terminal:start", "terminal:restart"]) {
        ipcMain.removeHandler(channel);
      }
      for (const channel of ["terminal:write", "terminal:resize"]) {
        ipcMain.removeAllListeners(channel);
      }
    },
  };
}

/**
 * `node-pty`, loaded at the first spawn rather than at import.
 *
 * It is a native addon built against Electron's ABI (§4.2, and §6.1 is the
 * phase-1 risk this is), and a plain `pnpm install` rebuilds it against Node's
 * instead — which is what `pnpm rebuild:native` in this package exists to undo.
 * Imported at the top of this file, a module that will not open would throw
 * while `main.js` was still being evaluated, before `boot()` ran, and the app
 * would not start at all. Deferred, the same failure costs the terminal and
 * nothing else: the `start` call rejects, and the window is already up to say
 * so.
 *
 * `spawn` is read off the namespace *and* off `default`, because `node-pty` is
 * CommonJS: whether Node's interop surfaces `exports.spawn` as a named export
 * depends on its static analysis of a file we do not control, and the fallback
 * costs one `??`.
 */
let ptySpawn = null;
async function loadPtySpawn() {
  if (!ptySpawn) {
    const loaded = await import("node-pty");
    ptySpawn = loaded.spawn ?? loaded.default?.spawn;
    if (typeof ptySpawn !== "function") {
      throw new Error("node-pty loaded but exposes no spawn().");
    }
  }
  return ptySpawn;
}

/**
 * Whether a path is a file this process may execute.
 *
 * `statSync` as well as `access`, because a *directory* named `claude` on
 * `PATH` satisfies `X_OK` — that is what the execute bit means on a directory —
 * and spawning it fails with an EACCES that says nothing about why.
 */
function isExecutable(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}
