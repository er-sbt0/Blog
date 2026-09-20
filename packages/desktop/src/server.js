import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Environment variables from the app's own `.env` that a desktop build must not
 * inherit, whatever they say.
 *
 * This is not paranoia about the developer's machine; it is a property of how
 * `next build` works. The build traces `.env` into `.next/standalone/.env`, and
 * `@next/env` then applies it at server start to every variable the process does
 * not already define. So "we did not configure OAuth" is not the same as "OAuth
 * is not configured": `configuredProviders()` in `src/lib/auth.ts` registers
 * GitHub the moment both halves are present, and they would be. Likewise
 * `isStorageConfigured()` would point the blob store at whatever MinIO the
 * developer runs, instead of at the filesystem store `BLOB_DIR` selects — and
 * since phase 4 the store *refuses* a configuration naming both, an inherited
 * `S3_ENDPOINT` would now be a loud failure on every image rather than a quiet
 * misdirection. Blanking them is what keeps the selection unambiguous.
 *
 * The plan's §4.2 says a desktop build "configures no OAuth provider without
 * modification". That is true of a clean environment and false of a bundle built
 * from a working tree, which is the only kind that exists today.
 *
 * `""` rather than deletion, deliberately: deleting is what lets `@next/env` fill
 * the gap, and every reader in the app uses `||` so an empty string reads as
 * absent (see the docblock on `isStorageConfigured`).
 */
const DENIED_ENV = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "CHANGES_DATABASE_URL",
  "POSTGRES_URL",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
];

/** The little the child needs from the surrounding shell. */
const PASSTHROUGH_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"];

/**
 * Make `.next/standalone` self-sufficient enough to serve.
 *
 * The standalone server resolves static assets relative to its own directory, so
 * `.next/static` and `public/` have to sit beside it — and `next build` does not
 * put them there. The Dockerfile's lines 63–64 are what supplies them in
 * production; this is the development-from-the-working-tree equivalent, and it
 * symlinks rather than copies so a rebuild is picked up without re-running this.
 *
 * Packaging (phase 6) must copy, not link, and must also *not* ship
 * `.next/standalone/.env` — see DENIED_ENV above. A locally built bundle contains
 * the developer's real credentials; `.dockerignore` keeps them out of the image
 * and nothing yet keeps them out of an installer.
 */
export function ensureStandaloneAssets(appRoot, log) {
  const standalone = path.join(appRoot, ".next", "standalone");
  const entry = path.join(standalone, "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `No Next build found at ${entry}.\n` +
        "Run `pnpm build` at the repository root first — the desktop shell serves the " +
        "standalone output, it does not build it.",
    );
  }

  const bridged = [
    [path.join(appRoot, ".next", "static"), path.join(standalone, ".next", "static")],
    [path.join(appRoot, "public"), path.join(standalone, "public")],
  ];

  for (const [source, target] of bridged) {
    if (fs.existsSync(target)) continue;
    if (!fs.existsSync(source)) {
      throw new Error(`Expected ${source} to exist after \`pnpm build\`.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target, "dir");
    log(`linked ${path.relative(appRoot, target)} -> ${path.relative(appRoot, source)}`);
  }

  return { standalone, entry };
}

/**
 * The variable names `next build` traced into the bundle.
 *
 * Read rather than hardcoded so the deny list cannot silently fall behind a `.env`
 * that grows. Anything found here that we have not set deliberately is blanked;
 * the alternative is inheriting a value chosen for a different deployment.
 */
export function tracedEnvKeys(standalone) {
  const keys = new Set();
  for (const file of [".env", ".env.production", ".env.local", ".env.production.local"]) {
    let contents;
    try {
      contents = fs.readFileSync(path.join(standalone, file), "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (match) keys.add(match[1]);
    }
  }
  return keys;
}

/**
 * The child's environment, built up rather than inherited.
 *
 * Order matters: the deliberate values go in last so that neither the passthrough
 * list nor the blanking can overwrite one.
 */
export function buildServerEnv({
  standalone,
  port,
  url,
  databaseUrl,
  nextAuthSecret,
  uploadsDir,
  blobDir,
}) {
  const env = { ELECTRON_RUN_AS_NODE: "1" };

  for (const key of PASSTHROUGH_ENV) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.HOME ??= os.homedir();
  env.TMPDIR ??= os.tmpdir();

  // Blank anything the bundle could otherwise supply — but never the handful of
  // variables the child needs from the shell, which a `.env` is free to mention.
  for (const key of [...DENIED_ENV, ...tracedEnvKeys(standalone)]) {
    if (!PASSTHROUGH_ENV.includes(key)) env[key] = "";
  }

  Object.assign(env, {
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: databaseUrl,
    NEXTAUTH_URL: url,
    NEXTAUTH_SECRET: nextAuthSecret,
    // Everything that describes "where this site is" answers with the loopback
    // origin rather than an empty string. §5 leaves the audit of what reads
    // PUBLIC_URL to phase 5; giving it a defined value costs nothing now.
    PUBLIC_URL: url,
    UPLOADS_DIR: uploadsDir,
    // §4.3, phase 4. Naming the directory is what *selects* the filesystem blob
    // store — `src/lib/storage.ts` will not infer it from S3 being absent,
    // because absent S3 is also what a misconfigured VPS looks like. The S3_*
    // keys above are blanked, which the store requires: configuring both is
    // refused rather than resolved by precedence.
    //
    // Passed explicitly for the reason the whole environment is built up rather
    // than inherited (§11.3) — a variable left to inheritance is one the
    // developer's `.env` gets to decide, and for this one that would mean the
    // desktop app writing its images into the repository's working tree.
    BLOB_DIR: blobDir,
    // §4.2's gate. Nothing reads it until phase 3 registers the local provider;
    // it is set now so that the two phases do not also have to agree on a name.
    DESKTOP: "1",
  });

  return env;
}

/**
 * Run `.next/standalone/server.js` as a child process.
 *
 * A child rather than an in-process import, per §3.1: `server.js` expects to own
 * `PORT`/`HOSTNAME` and to be the process that exits, and a crashed server can
 * then be restarted without taking the window with it. It runs under Electron's
 * own Node via `ELECTRON_RUN_AS_NODE`, so a packaged build needs no separate
 * runtime.
 */
export function startNextServer({ standalone, entry, env, log, onExit }) {
  const child = spawn(process.execPath, [entry], {
    cwd: standalone,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => log(`[next] ${chunk.toString().trimEnd()}`));
  child.stderr.on("data", (chunk) => log(`[next] ${chunk.toString().trimEnd()}`));
  child.on("exit", (code, signal) => onExit(code, signal));
  return child;
}

/**
 * Phase 2's acceptance check.
 *
 * `/api/health` runs `SELECT 1` through Prisma, so a 200 from it is the whole
 * chain proving itself in one request: Electron started the server, the server
 * loaded the Prisma client, and the client reached the embedded cluster. Nothing
 * short of it demonstrates more than that a port is open.
 */
export async function waitForHealth({ url, timeoutMs = 60_000, intervalMs = 250, log, abortWhen }) {
  const deadline = Date.now() + timeoutMs;
  const started = Date.now();
  let lastError = "no response yet";

  while (Date.now() < deadline) {
    // A server that has already exited is never going to answer, and waiting out
    // the full timeout for it turns a crash into a hang.
    const aborted = abortWhen?.();
    if (aborted) throw new Error(aborted);
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status === "ok") {
        const elapsed = Date.now() - started;
        log(`health ok in ${elapsed} ms (db: ${body.db})`);
        return elapsed;
      }
      lastError = `HTTP ${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `The Next server did not become healthy within ${timeoutMs / 1000} s. Last attempt: ${lastError}`,
  );
}

/** SIGTERM, then SIGKILL if it is still there. A survivor holds the port. */
export function stopNextServer(child, { graceMs = 5_000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => child.kill("SIGKILL"), graceMs);
    child.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
