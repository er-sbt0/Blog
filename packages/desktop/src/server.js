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
 * Where `pnpm build:desktop` puts its output.
 *
 * A *second* build directory rather than a second server flag, and that is
 * phase 5's architecture decision (§5). Two things about a desktop build can
 * only be settled while the bundle is being written: `next-pwa` injects the
 * service-worker registration into the client entry from a webpack plugin, and
 * `NEXT_PUBLIC_*` is inlined as a string literal, so no runtime variable can
 * ever reach a client component. One build, `DESKTOP=1 BUILD_DIR=.next-desktop
 * next build`, decides both — and the plain `pnpm build` that produces the VPS
 * bundle is left exactly as it was, in `.next`, rather than being made
 * conditional on something.
 *
 * Overridable so a developer can point the shell at another output without
 * editing this file. `.gitignore` already covers any `.next-` prefixed
 * directory, so a second output does not have to be added to it.
 */
export const DESKTOP_BUILD_DIR = process.env.BUILD_DIR || ".next-desktop";

/**
 * Build artifacts of `next-pwa` that live in the *source* `public/` directory.
 *
 * `dest: "public"` in `next.config.ts` means the web build writes its service
 * worker into the working tree rather than into its own output, so `public/` is
 * shared state between the two builds and a desktop bundle assembled from it
 * would serve a `/sw.js` the web build left behind. Nothing in a desktop build
 * registers one — that is settled at build time, and is the acceptance check —
 * but serving the file at all is a loose end, so the bridge below leaves these
 * out. Phase 6's copy step wants the same list.
 *
 * They are all `.gitignore`d, which is the other way to see that they are
 * output and not content.
 */
export const PWA_ARTIFACTS =
  /^(sw\.js(\.map)?|workbox-[^/]+\.js(\.map)?|worker-[^/]+\.js(\.map)?|fallback-[^/]+\.js(\.map)?)$/;

/**
 * Prove the bundle about to be served is a desktop build.
 *
 * Asking is not proving (§11.3's rule, applied to the build rather than to the
 * database). A bundle from `pnpm build` starts and serves perfectly well; what
 * it does is register a service worker over an ephemeral loopback port, keep
 * `/api/mcp` listening for bearer tokens, and render a Logout button that
 * cannot be undone. All three are *absences*, so none of them would show up as
 * an error — the app would simply be wrong, quietly, in the way §5 exists to
 * prevent.
 *
 * `required-server-files.json` carries the resolved `nextConfig`, including the
 * `env` block `next.config.ts` derives from `DESKTOP`. So this reads the flag
 * out of the artifact itself rather than trusting the directory it was found in.
 *
 * It sits under the bundle's own `distDir` — `standalone/.next-desktop/…`, not
 * `standalone/.next/…` — because `output: "standalone"` reproduces the dist
 * directory by name inside the copy.
 */
export function assertDesktopBundle(standalone, buildDir = DESKTOP_BUILD_DIR) {
  const manifest = path.join(standalone, buildDir, "required-server-files.json");
  let config;
  try {
    config = JSON.parse(fs.readFileSync(manifest, "utf8"))?.config;
  } catch (error) {
    throw new Error(
      `Could not read ${manifest} to confirm this is a desktop build: ${error.message}`,
    );
  }
  if (config?.env?.NEXT_PUBLIC_DESKTOP !== "1") {
    throw new Error(
      `The build at ${standalone} is not a desktop build.\n` +
        "It was produced by `pnpm build`, which leaves the service worker on, " +
        "`/api/mcp` serving and the sign-out button in the UI (plan §5).\n" +
        "Run `pnpm build:desktop` at the repository root.",
    );
  }
}

/**
 * Make the standalone output self-sufficient enough to serve.
 *
 * The standalone server resolves static assets relative to its own directory, so
 * `.next/static` and `public/` have to sit beside it — and `next build` does not
 * put them there. The Dockerfile's lines 63–64 are what supplies them in
 * production; this is the development-from-the-working-tree equivalent, and it
 * symlinks rather than copies so a rebuild is picked up without re-running this.
 *
 * `public/` is bridged entry by entry rather than as one link, because it is the
 * one directory the two builds share — see PWA_ARTIFACTS. The link farm is
 * rebuilt every launch so a file added to `public/` is not invisible until
 * someone deletes a stale directory.
 *
 * Packaging (phase 6) must copy, not link, and must also *not* ship
 * `.next/standalone/.env` — see DENIED_ENV above. A locally built bundle contains
 * the developer's real credentials; `.dockerignore` keeps them out of the image
 * and nothing yet keeps them out of an installer.
 */
export function ensureStandaloneAssets(appRoot, log, buildDir = DESKTOP_BUILD_DIR) {
  const standalone = path.join(appRoot, buildDir, "standalone");
  const entry = path.join(standalone, "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `No desktop build found at ${entry}.\n` +
        "Run `pnpm build:desktop` at the repository root first — the shell serves the " +
        "standalone output, it does not build it.\n" +
        "(`pnpm build` writes .next, which is the VPS bundle and deliberately not this one.)",
    );
  }

  assertDesktopBundle(standalone, buildDir);

  const staticSource = path.join(appRoot, buildDir, "static");
  const staticTarget = path.join(standalone, buildDir, "static");
  if (!fs.existsSync(staticTarget)) {
    if (!fs.existsSync(staticSource)) {
      throw new Error(`Expected ${staticSource} to exist after \`pnpm build:desktop\`.`);
    }
    fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
    fs.symlinkSync(staticSource, staticTarget, "dir");
    log(`linked ${path.relative(appRoot, staticTarget)} -> ${path.relative(appRoot, staticSource)}`);
  }

  const publicSource = path.join(appRoot, "public");
  const publicTarget = path.join(standalone, "public");
  if (!fs.existsSync(publicSource)) {
    throw new Error(`Expected ${publicSource} to exist.`);
  }
  const skipped = bridgePublic(publicSource, publicTarget);
  log(
    `bridged public/ (${skipped.linked} entries` +
      (skipped.excluded.length ? `, excluding ${skipped.excluded.join(", ")}` : "") +
      ")",
  );

  return { standalone, entry, buildDir };
}

/**
 * One symlink per entry of `public/`, minus the web build's PWA output.
 *
 * Recreated rather than reconciled: the directory holds nothing but symlinks we
 * made, so throwing it away is cheaper than working out what changed, and it
 * cannot drift. An earlier single `public -> ../../public` link is replaced the
 * same way.
 */
function bridgePublic(source, target) {
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink()) fs.unlinkSync(target);
  else if (existing) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const excluded = [];
  let linked = 0;
  for (const name of fs.readdirSync(source)) {
    if (PWA_ARTIFACTS.test(name)) {
      excluded.push(name);
      continue;
    }
    fs.symlinkSync(path.join(source, name), path.join(target, name));
    linked += 1;
  }
  return { linked, excluded };
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
    // The origin this server answers on — which is *not* the same question as
    // "where is this site published", and phase 5's audit (§5) turned on the
    // difference. Three readers want the first: `src/app/api/utils.ts`
    // self-fetches `${PUBLIC_URL}/api/embed` to render `/view` and `/embed`, and
    // would otherwise fall back to `http://localhost:3000` — which on this
    // machine is usually a stale `next start` of somebody else's build. The root
    // layout's `metadataBase` wants it too. Two readers want the second and get
    // `null` instead: `robots.ts` and `sitemap.ts` go through `publicSiteUrl()`
    // in `src/lib/desktop.ts`, which refuses to advertise a loopback port to a
    // crawler. Setting this to `""` would have broken the first three to serve
    // the last two.
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
    // §4.2's gate, and since phase 5 it is read. Server-side it turns off the
    // remote MCP endpoint and `/api/revalidate` (`refuseOnDesktop` in
    // `src/lib/api-utils.ts`), empties the sitemap and closes robots.
    //
    // It is set here *and* at build time, and that is not redundancy: the build
    // (`pnpm build:desktop`) is what disables the service worker and inlines
    // `NEXT_PUBLIC_DESKTOP` for client components, neither of which a runtime
    // variable can reach. `assertDesktopBundle` above is what stops the two from
    // disagreeing — a bundle from `pnpm build` is refused before it is served,
    // rather than running with this flag set and half the strippings missing.
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
