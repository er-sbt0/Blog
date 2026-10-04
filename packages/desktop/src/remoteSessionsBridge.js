/**
 * The decisions behind `sessions:sync`, the bridge call that starts a sync of a
 * remote host (docs/plans/remote-claude.md §4.2, phase 3).
 *
 * Import-free, for the reason `terminal.js` is: `remoteSessionsIpc.js` owns
 * `ipcMain` and cannot be loaded by a spec, so everything a spec could pin —
 * what counts as a host id, how a route's answer becomes a value or an error,
 * one sync per host, and what crosses back over IPC — lives on this side.
 */

/** The shape `requireRemoteHost` accepts. Anything else is refused before any I/O. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHostId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Where every call this bridge makes goes. Nothing else on the server is reachable from here. */
export const API_PREFIX = "/api/remote-sessions";

/**
 * A route's answer as a value: the `data` of a 2xx, or an Error carrying the
 * `{ error: { title, subtitle } }` that `ApiError` writes. A body that is not
 * JSON (a proxy page, a crash) still produces an error that names the status.
 *
 * @param {{ ok: boolean, status: number, json(): Promise<unknown> }} response
 */
export async function unwrapApiResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok && body && typeof body === "object" && "data" in body) return body.data;
  const error = body && typeof body === "object" ? body.error : null;
  const message =
    (typeof error?.subtitle === "string" && error.subtitle) ||
    (typeof error?.title === "string" && error.title) ||
    `request failed with status ${response.status}`;
  throw new Error(message);
}

/**
 * `syncHost`'s poster, and the alias lookup beside it, as the signed-in local
 * author. The cookie is a getter rather than a value because the sign-out
 * watcher in `main.js` can mint a new session mid-launch (as `bundles.js` does).
 * The cookie is passed explicitly rather than trusting the main process's
 * `fetch` to share Chromium's jar.
 *
 * @param {{ origin: string, cookie: () => string | null, fetch: typeof fetch }} options
 */
export function createApiClient({ origin, cookie, fetch }) {
  const call = async (method, path, body) => {
    const headers = { cookie: cookie() ?? "" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${origin}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return unwrapApiResponse(response);
  };
  return {
    post: (path, body) => call("POST", path, body),
    /** The stored alias for a host id. `syncHost` validates it again before it reaches an argv. */
    alias: async (hostId) => {
      if (!isHostId(hostId)) throw new Error("not a host id");
      const host = await call("GET", `/hosts/${hostId}`);
      return host?.alias;
    },
  };
}

/**
 * At most one run per key. A second call while the first is in flight gets the
 * same promise rather than a second ssh beside the first, which would ingest
 * the same ranges twice and race on `finish`.
 */
export function createSingleFlight() {
  const running = new Map();
  return {
    run(key, task) {
      const existing = running.get(key);
      if (existing) return existing;
      const promise = Promise.resolve()
        .then(task)
        .finally(() => running.delete(key));
      running.set(key, promise);
      return promise;
    },
    has: (key) => running.has(key),
  };
}

/**
 * What crosses back over IPC: plain data, never a rejection. A rejected
 * `ipcMain.handle` reaches the renderer as "Error invoking remote method …"
 * with the main process's stack folded in, which is neither what the user
 * should read nor something the renderer should hold. The message is ssh's
 * stderr or the server's subtitle, truncated as `syncHost` truncates it.
 */
export async function settleSync(promise) {
  try {
    const result = await promise;
    return { ok: true, derived: Number(result?.derived ?? 0) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 2000) };
  }
}
