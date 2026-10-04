import { ipcMain } from "electron";
import { syncHost } from "./remoteSessions.js";
import { createApiClient, createSingleFlight, isHostId, settleSync } from "./remoteSessionsBridge.js";

/**
 * The main process's half of `window.desktop.sessions` (docs/plans/remote-claude.md
 * §4.2, phase 3). Thin on purpose, as `pty.js` is to `terminal.js`: every
 * decision is in `remoteSessionsBridge.js` and `remoteSessions.js`, which a
 * spec can load; this file only owns `ipcMain`.
 *
 * The narrowness argument `preload.cjs` asks for:
 *
 * - The renderer names a host **id**, never an alias. The alias is read here
 *   from the server, which only answers for a host the signed-in author already
 *   added, and `syncHost` validates it again before it becomes an argv element.
 * - The ssh options and both remote scripts are constants in `remoteSessions.js`.
 *   Nothing the renderer sends reaches a command line.
 *
 * ssh is spawned here rather than from the Next child because this process's
 * environment is open and the child's is closed (§2.3): `runRemote` passes no
 * `env`, so ssh inherits `process.env` as the shell was launched with it —
 * `SSH_AUTH_SOCK` included — and `main.js` never rewrites `process.env`.
 */
export function installRemoteSessions({ origin, cookie, log }) {
  const api = createApiClient({ origin, cookie, fetch: globalThis.fetch });
  const flights = createSingleFlight();

  async function sync(sender, hostId) {
    const started = Date.now();
    const host = await api.alias(hostId);
    const result = await syncHost({
      host,
      hostId,
      post: api.post,
      onProgress: ({ done, total }) => {
        if (!sender.isDestroyed()) sender.send("sessions:progress", { hostId, done, total });
      },
    });
    log(`sessions: synced host ${hostId} in ${Date.now() - started} ms`);
    return result;
  }

  ipcMain.handle("sessions:sync", (event, hostId) => {
    if (!isHostId(hostId)) return { ok: false, error: "Not a host id." };
    return flights.run(hostId, () => settleSync(sync(event.sender, hostId)));
  });

  return {
    /** As `pty.js`: `ipcMain.handle` throws on a second registration, so give the channel back. */
    dispose() {
      ipcMain.removeHandler("sessions:sync");
    },
  };
}
