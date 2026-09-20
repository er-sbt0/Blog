import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

/** The one database the desktop build uses inside its own cluster. */
export const APP_DATABASE = "blog";

/**
 * `start()` resolves off a line on the postmaster's stderr and rejects with no
 * argument if the process dies first, so an un-timed await can hang forever and
 * a failed one arrives as `undefined`. Both are wrapped here.
 */
const START_TIMEOUT_MS = 30_000;

/**
 * Bring up the cluster, creating it on first launch only.
 *
 * `initdb` cost 353 ms in the phase-1 spike and every start after it 13 ms
 * (§10.1), which is why these are two branches rather than one idempotent call:
 * the first-run path is the one that needs a splash screen, and telling them
 * apart is what makes the boot log say which happened.
 */
export async function startCluster({ dataDir, socketDir, port, password, log }) {
  // PG_VERSION rather than the directory: Electron's `userData` may already
  // exist, and a data directory that exists but was never initialised would
  // otherwise be started rather than created.
  const initialised = fs.existsSync(path.join(dataDir, "PG_VERSION"));

  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: "postgres",
    password,
    authMethod: "scram-sha-256",
    persistent: true,
    // We connect over TCP on loopback, but the postmaster creates a Unix socket
    // anyway and inherits the data directory for it unless told otherwise —
    // which is how the spike hit Postgres's 107-byte socket path cap (§10.4).
    postgresFlags: ["-k", socketDir],
    onLog: (message) => log(`[postgres] ${String(message).trimEnd()}`),
    onError: (error) => log(`[postgres] ${error instanceof Error ? error.message : String(error)}`),
  });

  if (!initialised) {
    const started = Date.now();
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    await cluster.initialise();
    log(`cluster created in ${Date.now() - started} ms (first launch)`);
  }

  const started = Date.now();
  await withTimeout(
    cluster.start(),
    START_TIMEOUT_MS,
    `Postgres did not report itself ready within ${START_TIMEOUT_MS / 1000} s. ` +
      `A stale postmaster may still hold ${dataDir} — check for a postmaster.pid there.`,
  );
  log(`cluster started on 127.0.0.1:${port} in ${Date.now() - started} ms`);

  return cluster;
}

/** A connected `pg` client on `database`, over loopback TCP. */
async function connect(cluster, database) {
  const client = cluster.getPgClient(database, "127.0.0.1");
  await client.connect();
  return client;
}

/** Create the application database if this is the first launch. */
export async function ensureDatabase(cluster, name = APP_DATABASE) {
  const client = await connect(cluster, "postgres");
  try {
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
      return "created";
    }
    return "present";
  } finally {
    await client.end();
  }
}

export function databaseUrl({ port, password, database = APP_DATABASE }) {
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}?schema=public`;
}

/**
 * Apply `prisma/migrations` to our cluster.
 *
 * Three things here are defences rather than plumbing, because the failure this
 * guards against — reaching the developer's database on 5432 — is unrecoverable:
 *
 * - `DATABASE_URL` is passed explicitly, and Prisma's dotenv does not overwrite
 *   a variable that is already set.
 * - The child runs in an empty scratch directory. Prisma looks for `.env` beside
 *   the schema and in the working directory; from a directory containing neither
 *   there is nothing to find. Its environment is built from nothing rather than
 *   spread from ours, so an ambient `DATABASE_URL` cannot arrive either.
 * - The result is verified against our own cluster afterwards (`countMigrations`).
 *   A migration run that went elsewhere leaves `_prisma_migrations` here empty,
 *   which is the only evidence that would actually show it.
 *
 * The CLI is run through Electron's own Node (`ELECTRON_RUN_AS_NODE`) rather than
 * the `.bin` shim, so it does not depend on whatever `node` the app was launched
 * with — and so the packaged build (phase 6) works the same way.
 */
export async function runMigrations({ appRoot, url, log }) {
  assertLocalUrl(url);

  const cli = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  const schema = path.join(appRoot, "prisma", "schema.prisma");
  for (const required of [cli, schema]) {
    if (!fs.existsSync(required)) {
      throw new Error(`Missing ${required}. Run \`pnpm install\` at the repository root.`);
    }
  }

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "blog-desktop-migrate-"));
  const started = Date.now();
  try {
    await run(process.execPath, [cli, "migrate", "deploy", "--schema", schema], {
      cwd,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        DATABASE_URL: url,
        // A closed environment, not a copy of ours. Prisma needs a home for its
        // caches and a PATH for the engine lookup; nothing else is its business.
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? os.homedir(),
        TMPDIR: os.tmpdir(),
        LANG: process.env.LANG ?? "C.UTF-8",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
        CHECKPOINT_DISABLE: "1",
      },
      label: "prisma",
      log,
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  log(`migrations applied in ${Date.now() - started} ms`);
}

/** How many migrations our cluster has recorded as finished. */
export async function countMigrations(cluster, database = APP_DATABASE) {
  const client = await connect(cluster, database);
  try {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    return rows[0].n;
  } finally {
    await client.end();
  }
}

/**
 * The phase-2 stand-in for a real local session (§4.2).
 *
 * Phase 3 replaces this with a NextAuth provider gated on `DESKTOP=1`; until
 * then the row exists so that the workspace has an author to belong to and the
 * server-rendering pages have something to render. One row is the whole point —
 * a desktop install has exactly one user, and `User.email` is unique.
 */
export async function seedLocalUser(cluster, { name, email, database = APP_DATABASE }) {
  const client = await connect(cluster, database);
  try {
    const existing = await client.query('SELECT id, email FROM "User" LIMIT 1');
    if (existing.rows.length > 0) return { ...existing.rows[0], seeded: false };

    // `name`, `email` and `updatedAt` are the NOT NULL columns without a database
    // default — `@updatedAt` and `@default(uuid())` are Prisma-side, so a plain
    // INSERT has to supply both. Everything else the schema defaults.
    const { rows } = await client.query(
      'INSERT INTO "User" (id, name, email, "updatedAt") VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id, email',
      [name, email],
    );
    return { ...rows[0], seeded: true };
  } finally {
    await client.end();
  }
}

/**
 * Prove the Next server connected to *our* cluster and not to something it found
 * in an inherited environment.
 *
 * Any backend on this database other than the one asking is the Next server: the
 * cluster is private to this process tree and nothing else knows the port. It is
 * the only check available that looks at where the server actually went rather
 * than at what we asked for — and given `.next/standalone` ships a traced `.env`
 * naming the developer's database, asking is not enough.
 *
 * Retried, because Prisma opens its pool lazily: the health probe forces one
 * connection, but the pool can be a moment behind the response.
 */
export async function assertServerUsesOurCluster(cluster, { attempts = 5, delayMs = 400 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = await connect(cluster, APP_DATABASE);
    try {
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
      );
      if (rows[0].n > 0) return rows[0].n;
    } finally {
      await client.end();
    }
    if (attempt < attempts) await delay(delayMs);
  }
  throw new Error(
    "The Next server answered /api/health but has no connection to the embedded cluster. " +
      "It is talking to some other database — most likely the one named in the `.env` that " +
      "`next build` traced into .next/standalone. Nothing has been written to this cluster.",
  );
}

/** Reject anything that is not our own loopback cluster, before we hand it over. */
export function assertLocalUrl(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing a DATABASE_URL pointing at ${host}; the desktop build is local only.`);
  }
  if (parsed.port === "5432" || parsed.port === "55432" || parsed.port === "55433") {
    throw new Error(
      `Refusing a DATABASE_URL on port ${parsed.port}. That is not this app's cluster — ` +
        "5432 is the development container holding real data.",
    );
  }
  return url;
}

function run(command, args, { cwd, env, label, log }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", (chunk) => log(`[${label}] ${chunk.toString().trimEnd()}`));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      log(`[${label}] ${chunk.toString().trimEnd()}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`\`${label}\` exited with code ${code}.\n${stderr.trim()}`));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        // `start()` rejects with no argument when the postmaster exits early.
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });
}
