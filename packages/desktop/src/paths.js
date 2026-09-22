import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the Next build, the Prisma CLI and `prisma/` are read from.
 *
 * Phase 2 runs from the working tree, so that is the repository three levels up
 * from this file. A packaged build (phase 6) ships the same set under
 * `extraResources` — the Dockerfile's lines 62–71 are already the list — and
 * then this is `process.resourcesPath` instead. The caller passes which,
 * because this module deliberately does not import electron: everything here is
 * plain Node so it can be exercised without a window.
 */
export function resolveAppRoot({ packaged, resourcesPath }) {
  return packaged ? resourcesPath : path.resolve(here, "..", "..", "..");
}

/**
 * Which data directory this launch uses, in precedence order.
 *
 * One library, whichever way the app was started: watch mode and the built app
 * read the same cluster by default, because the alternative — a development run
 * on its own empty database — answers a question nobody was asking. You start
 * the app in watch mode *to work on the app*, and an app with no posts in it is
 * not the app.
 *
 * What that costs is real and is worth stating: the shell applies
 * `prisma migrate deploy` on every boot, so a watch-mode launch applies whatever
 * migrations are in the working tree to the library you actually keep. That is
 * the reason `--data-dir` exists — a migration you are still writing belongs
 * against a copy — and it is also why `assertDataDirFree` below is worth the
 * three lines it takes.
 *
 * `--data-dir`, not `--user-data-dir`: the second is one of Chromium's own
 * switches, and passing it would move the browser profile as a side effect of
 * asking for a database.
 *
 * `~` is expanded here rather than left to the shell, which does not expand it
 * after an `=` — so `--data-dir=~/blog` would otherwise create a directory
 * literally named `~` in the working directory, and the app would look empty
 * for a reason nothing on screen could explain.
 */
export function resolveUserData({ argv, env, defaultDir }) {
  const flag = readDataDirFlag(argv ?? []);
  if (flag) return { dir: expandHome(flag), source: "--data-dir" };
  if (env?.DESKTOP_USER_DATA) {
    return { dir: expandHome(env.DESKTOP_USER_DATA), source: "DESKTOP_USER_DATA" };
  }
  return { dir: defaultDir, source: "default" };
}

function readDataDirFlag(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--data-dir") return argv[i + 1] || null;
    if (arg.startsWith("--data-dir=")) return arg.slice("--data-dir=".length) || null;
  }
  return null;
}

function expandHome(value) {
  const expanded = value === "~" || value.startsWith("~/")
    ? path.join(os.homedir(), value.slice(1))
    : value;
  return path.resolve(expanded);
}

/**
 * Refuse a data directory another instance is already serving.
 *
 * Sharing one library between the built app and a watch-mode run is the default,
 * and two postmasters on one `pgdata` is what that makes easy to try. Postgres
 * does refuse it — but it refuses 30 seconds later, inside a start we are
 * waiting on, with a message about a lock file rather than about the other
 * window that is open on screen right now.
 *
 * The pid is checked rather than the file, because the file outlives a crash:
 * signal 0 tests for existence without delivering anything, and EPERM means a
 * live process owned by somebody else, which is still a live process.
 */
export function assertDataDirFree(pgdata, { label = "--data-dir" } = {}) {
  const pid = Number.parseInt(readFirstLine(path.join(pgdata, "postmaster.pid")) ?? "", 10);
  if (!Number.isInteger(pid) || pid <= 0) return;

  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code !== "EPERM") return; // ESRCH: stale file from a crash.
  }

  throw new Error(
    `Another instance of the app is already using ${path.dirname(pgdata)} ` +
      `(postgres pid ${pid}).\n` +
      "One data directory holds one cluster, so the two cannot run at once. Quit the " +
      `other window, or start this one against a different library with ${label}=<dir>.`,
  );
}

function readFirstLine(file) {
  try {
    return fs.readFileSync(file, "utf8").split("\n")[0].trim();
  } catch {
    return null;
  }
}

/**
 * Every path the desktop build owns, under Electron's `userData`.
 *
 * `uploads` and `blobs` are both wired into the server's environment —
 * `UPLOADS_DIR` and, since phase 4, `BLOB_DIR`. The second is not merely a
 * location: naming it is what selects the filesystem blob store over S3 (§4.3),
 * so this directory is the desktop build's answer to "where do the images go".
 */
export function desktopPaths(userData) {
  const paths = {
    userData,
    pgdata: path.join(userData, "pgdata"),
    uploads: path.join(userData, "uploads"),
    blobs: path.join(userData, "blobs"),
    // The terminal's working directory (docs/plans/in-app-terminal.md §4.6).
    // It holds the generated `.mcp.json` — which is what lets Claude Code see
    // the library at all, since posts are rows in Postgres and there is no file
    // representation to `cd` into — and nothing else the shell puts there. The
    // user's own scratch files are welcome in it, which is why `mcpConfig.js`
    // merges rather than overwrites and why `terminal.js` refuses an empty
    // `PATH` entry: this is a directory the app writes to and does not own.
    workspace: path.join(userData, "workspace"),
    secrets: path.join(userData, "secrets.json"),
    // Phase 7. Separate from `secrets.json` on purpose: this file is disposable
    // — a corrupt or missing one costs a default-sized window — while losing
    // the secrets locks the app out of its own database. Nothing should be
    // tempted to make one write atomic on the other's behalf.
    windowState: path.join(userData, "window-state.json"),
    // The port the window's origin is built from. Disposable like the window
    // state and for the same reason it is worth keeping at all — see
    // {@link stableHttpPort}.
    httpPort: path.join(userData, "http-port.json"),
    // Postgres caps a Unix socket path at 107 bytes and §10.4 of the plan hit
    // that cap by letting the socket live inside a deep data directory. We
    // connect over TCP on loopback regardless, so the socket only has to exist;
    // giving it a short, explicit home is the whole fix. Per-uid so two accounts
    // on one machine do not fight over the directory's permissions.
    socketDir: path.join(os.tmpdir(), `blog-desktop-pg-${os.userInfo().uid}`),
  };

  for (const dir of [
    paths.userData,
    paths.uploads,
    paths.blobs,
    paths.workspace,
    paths.socketDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

/**
 * The two secrets that must survive a restart, generated on first launch.
 *
 * The cluster's password is set by `initdb` and cannot be re-derived, so losing
 * this file locks us out of our own database; `NEXTAUTH_SECRET` losing its value
 * would invalidate every session. Both are machine-local, hence 0600 and no
 * attempt at anything stronger — an attacker who can read this file can read
 * `pgdata/` beside it.
 */
export function loadSecrets(secretsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    if (parsed.pgPassword && parsed.nextAuthSecret) return parsed;
  } catch {
    // Missing or unreadable: fall through and mint a fresh pair.
  }

  const secrets = {
    pgPassword: randomBytes(24).toString("base64url"),
    nextAuthSecret: randomBytes(32).toString("base64"),
  };
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

/**
 * The remembered window geometry, read defensively.
 *
 * Everything that decides what to *do* with it is in `windowState.js`, which is
 * import-free and specced; this is the two lines of I/O that module refuses to
 * carry. A missing, truncated or hand-edited file reads as `null`, which every
 * caller treats as a first launch — the safe direction, because the alternative
 * is `NaN` reaching `BrowserWindow` and a window at an undefined position.
 */
export function loadWindowState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Persist it. Written to a sibling and renamed, because the last write happens
 * during `close` — the one moment the process is most likely to be interrupted,
 * and a half-written JSON file is indistinguishable from a corrupt one on the
 * next launch.
 */
export function saveWindowState(statePath, state) {
  if (!state) return;
  const partial = `${statePath}.tmp`;
  try {
    fs.writeFileSync(partial, JSON.stringify(state, null, 2));
    fs.renameSync(partial, statePath);
  } catch (error) {
    // Never fatal: forgetting where the window was is not a reason to fail a
    // quit, and the only alternative outcome is an app that will not close.
    console.error("[desktop] could not save the window state", error);
  }
}

/** Ports this build must never bind or connect to. */
const FORBIDDEN_PORTS = new Set([
  5432, // the developer's `postgres-blog` container, holding the real dev data
  55432, // the phase-1 spike's cluster
  55433,
]);

/**
 * A free loopback port, picked by letting the kernel choose one.
 *
 * Inherently a small race — the port is released before the caller binds it —
 * but the alternative is a fixed port, and a fixed port is how a desktop app
 * ends up talking to whatever else happens to be listening. See the guard in
 * `assertNotForbidden`.
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => {
        try {
          assertNotForbidden(port);
          resolve(port);
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}

export function assertNotForbidden(port) {
  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `Refusing to use port ${port}: it belongs to a database this app must not touch.`,
    );
  }
  return port;
}

// ── The window's origin ──────────────────────────────────────────────────────

/**
 * Why the HTTP port — unlike the cluster's — has to survive a restart.
 *
 * The window loads `http://127.0.0.1:<port>`, and every storage API the browser
 * offers is scoped to an *origin*, port included. With a fresh ephemeral port
 * each launch the renderer opens onto empty storage every time: `localStorage`
 * (the sidebar width and mode, the posts view type and density, the inline
 * Copilot bar's minimized state, every collapsed series and project) and
 * IndexedDB alike — which is the whole workspace record, so the restored tabs,
 * the panes, each document's rail view and its scroll position all go with it.
 * Nothing is corrupted; it is simply addressed to an origin that never comes
 * back, and 37 such directories had accumulated under `userData` by the time
 * this was noticed.
 *
 * So the port is remembered and re-bound. The cluster's port stays ephemeral
 * (see step 3 of `boot`) because nothing is keyed to it — a connection string
 * is built fresh each launch — and the only thing a stable one would buy is a
 * way to collide with someone else's Postgres.
 */
const STABLE_PORT_RANGE = { min: 61_000, max: 65_535 };

/** How many candidates to try before falling back to the kernel's choice. */
const STABLE_PORT_TRIES = 32;

/**
 * Whether a port read back off disk is one we are willing to bind.
 *
 * The file is ours, but it is a plain JSON file in the user's config directory
 * and a hand-edited or truncated one must read as "no port remembered" rather
 * than reaching `listen` — the same argument `loadWindowState` makes about
 * `NaN` reaching `BrowserWindow`. `FORBIDDEN_PORTS` is re-checked here because
 * a remembered port skips `freePort`, which is where that check normally sits.
 */
export function isStablePort(port) {
  return (
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65_535 &&
    !FORBIDDEN_PORTS.has(port)
  );
}

/** The remembered port, or `null` for anything we will not bind. */
export function readPortFile(file) {
  try {
    const { port } = JSON.parse(fs.readFileSync(file, "utf8"));
    return isStablePort(port) ? port : null;
  } catch {
    return null;
  }
}

function writePortFile(file, port) {
  const partial = `${file}.tmp`;
  try {
    fs.writeFileSync(partial, JSON.stringify({ port }, null, 2));
    fs.renameSync(partial, file);
  } catch (error) {
    // Not fatal, and deliberately not retried: the cost is that the *next*
    // launch picks a different port and starts from defaults again, which is
    // exactly where we were before this file existed.
    console.error("[desktop] could not remember the HTTP port", error);
  }
}

/** Whether we can bind `port` on loopback right now. */
function bindable(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/**
 * A port worth remembering.
 *
 * Above {@link STABLE_PORT_RANGE}.min rather than from the kernel's ephemeral
 * range, because the two uses pull opposite ways: an ephemeral port is one the
 * kernel is free to hand to an outgoing connection the moment we release it
 * (Linux's `ip_local_port_range` is 32768–60999 by default), and we want one
 * that is still ours in a week. Falls back to {@link freePort} rather than
 * failing — a launch that has to start from defaults beats a launch that does
 * not happen.
 */
async function pickStablePort() {
  const span = STABLE_PORT_RANGE.max - STABLE_PORT_RANGE.min + 1;
  for (let attempt = 0; attempt < STABLE_PORT_TRIES; attempt += 1) {
    const port = STABLE_PORT_RANGE.min + (randomBytes(2).readUInt16BE(0) % span);
    if (!isStablePort(port)) continue;
    if (await bindable(port)) return port;
  }
  return assertNotForbidden(await freePort());
}

/**
 * The port this launch should serve on: the one the last launch used, if it is
 * still free, and otherwise a fresh one that is then remembered.
 *
 * Re-binding carries the same race `freePort` does — the probe closes before
 * the server opens — and for the same reason: there is no way to hand a bound
 * socket to a child process that expects to bind `PORT` itself. Two of our own
 * windows cannot race here, because `assertDataDirFree` has already refused the
 * second one by the time this runs.
 *
 * @param {string} file
 * @param {(line: string) => void} [log]
 */
export async function stableHttpPort(file, log = () => {}) {
  const remembered = readPortFile(file);
  if (remembered !== null) {
    if (await bindable(remembered)) return remembered;
    log(
      `port ${remembered} is in use by something else; picking another — ` +
        "this window's saved layout and preferences will start from defaults",
    );
  }
  const port = await pickStablePort();
  writePortFile(file, port);
  return port;
}
