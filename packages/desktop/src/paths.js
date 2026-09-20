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
 * `blobs` and `uploads` are created here but only `uploads` is wired up
 * (`UPLOADS_DIR`); the filesystem blob store is phase 4 (§4.3). Creating the
 * directory now means phase 4 is an adapter and not also a path decision.
 */
export function desktopPaths(userData) {
  const paths = {
    userData,
    pgdata: path.join(userData, "pgdata"),
    uploads: path.join(userData, "uploads"),
    blobs: path.join(userData, "blobs"),
    secrets: path.join(userData, "secrets.json"),
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
