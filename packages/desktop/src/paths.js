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
    secrets: path.join(userData, "secrets.json"),
    // Phase 7. Separate from `secrets.json` on purpose: this file is disposable
    // — a corrupt or missing one costs a default-sized window — while losing
    // the secrets locks the app out of its own database. Nothing should be
    // tempted to make one write atomic on the other's behalf.
    windowState: path.join(userData, "window-state.json"),
    // Postgres caps a Unix socket path at 107 bytes and §10.4 of the plan hit
    // that cap by letting the socket live inside a deep data directory. We
    // connect over TCP on loopback regardless, so the socket only has to exist;
    // giving it a short, explicit home is the whole fix. Per-uid so two accounts
    // on one machine do not fight over the directory's permissions.
    socketDir: path.join(os.tmpdir(), `blog-desktop-pg-${os.userInfo().uid}`),
  };

  for (const dir of [paths.userData, paths.uploads, paths.blobs, paths.socketDir]) {
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
