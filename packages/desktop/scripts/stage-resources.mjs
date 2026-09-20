/**
 * Assemble the tree that becomes `process.resourcesPath` in a packaged build.
 *
 * Phase 6 of docs/plans/desktop-app.md. The set is the Dockerfile's lines 62–71
 * — standalone server, static assets, `public/`, the Prisma CLI with its engines
 * and `prisma/` for `migrate deploy` — arranged so that `resolveAppRoot` in
 * `src/paths.js` finds them at exactly the paths it already looks for when it
 * is not packaged:
 *
 *   <resources>/.next-desktop/standalone/server.js     the server
 *   <resources>/.next-desktop/standalone/.next-desktop/static
 *   <resources>/.next-desktop/standalone/public
 *   <resources>/prisma/{schema.prisma,migrations}      what migrate deploy applies
 *   <resources>/node_modules/prisma                    the CLI that applies it
 *   <resources>/node_modules/@prisma/engines           the schema engine it runs
 *
 * Three things this does that a plain copy would not, each of which is a way the
 * packaged app is wrong rather than merely large:
 *
 * - **No `.env`, anywhere.** `next build` traces the working tree's `.env` into
 *   `<distDir>/standalone/.env`, so the bundle on this machine carries a real
 *   `GITHUB_CLIENT_SECRET`, a real `ANTHROPIC_API_KEY` and the
 *   `AI_CREDENTIAL_KEYS` that decrypt every stored provider key. `.dockerignore`
 *   is what keeps them out of the image; nothing kept them out of an installer
 *   until this (plan §5, §11.3). Filtered here, and checked again in
 *   `verify-package.mjs`, which is the gate — a filter that silently matched
 *   nothing would look identical to one that worked.
 * - **Symlinks stay symlinks, and none may leave the tree.** `.next-desktop/
 *   standalone/node_modules` is a pnpm store: a few thousand relative links into
 *   `.pnpm/`. Dereferencing them multiplies the bundle; rewriting them to
 *   absolute paths produces an app that works on this machine and nowhere else.
 *   `verbatimSymlinks` copies the link text as written, and every link is then
 *   resolved and required to land inside the staged tree.
 * - **The runtime leftovers are dropped.** `standalone/public` and
 *   `standalone/.next-desktop/static` are symlinks the development launcher makes
 *   (`ensureStandaloneAssets`), pointing at the working tree; a packaged app must
 *   carry real copies. And `standalone/.next-desktop/cache` is Next's fetch cache,
 *   written while the server ran against the developer's data.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DESKTOP_BUILD_DIR, PWA_ARTIFACTS, assertDesktopBundle } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

/** Any file `@next/env` would read. None of them may ship. */
const DOTENV_FILE = /^\.env($|\.)/;

const log = (message) => console.warn(`[stage] ${message}`);

/**
 * `fs.cp` with the two options that matter and a filter that records what it
 * dropped, so "excluded 1 .env" appears in the build log rather than being
 * inferred from an absence.
 */
async function copyTree(from, to, { skip } = {}) {
  const dropped = [];
  await fs.promises.cp(from, to, {
    recursive: true,
    // Copy a symlink as a symlink (`dereference: false`) and copy its *text*
    // rather than re-resolving it against the destination (`verbatimSymlinks`).
    // Without the second, Node rewrites every relative link to an absolute path
    // in the source tree, and the packaged app then reaches back into the
    // repository it was built from.
    dereference: false,
    verbatimSymlinks: true,
    force: true,
    filter: (source) => {
      if (skip?.(source)) {
        dropped.push(path.relative(from, source));
        return false;
      }
      return true;
    },
  });
  return dropped;
}

/** Every symlink in the staged tree, with where it actually points. */
function walkSymlinks(root, found = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const text = fs.readlinkSync(full);
      found.push({ full, text, resolved: path.resolve(path.dirname(full), text) });
    } else if (entry.isDirectory()) {
      walkSymlinks(full, found);
    }
  }
  return found;
}

function assertLinksStayInside(stage) {
  const links = walkSymlinks(stage);
  const escaping = links.filter(
    (link) => !link.resolved.startsWith(stage + path.sep) && link.resolved !== stage,
  );
  if (escaping.length > 0) {
    throw new Error(
      `${escaping.length} symlink(s) in the staged tree point outside it, so the packaged ` +
        "app would depend on this machine's working tree still being there.\n" +
        escaping
          .slice(0, 5)
          .map((link) => `  ${path.relative(stage, link.full)} -> ${link.text}`)
          .join("\n"),
    );
  }
  const dangling = links.filter((link) => !fs.existsSync(link.resolved));
  if (dangling.length > 0) {
    throw new Error(
      `${dangling.length} symlink(s) in the staged tree point at nothing.\n` +
        dangling
          .slice(0, 5)
          .map((link) => `  ${path.relative(stage, link.full)} -> ${link.text}`)
          .join("\n"),
    );
  }
  return links.length;
}

function assertNoDotenv(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (DOTENV_FILE.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  if (found.length > 0) {
    throw new Error(
      `${found.length} dotenv file(s) survived staging:\n` +
        found.map((file) => `  ${path.relative(root, file)}`).join("\n"),
    );
  }
}

/**
 * Stage the Prisma CLI by reproducing pnpm's store layout, not by flattening it.
 *
 * The obvious version of this — copy `node_modules/prisma` and
 * `node_modules/@prisma`, dereferencing as you go — produces a CLI that dies on
 * its first `require` with `Cannot find module '@prisma/config'`, and it took a
 * probe to find that rather than a reading of the code. Under pnpm a package's
 * dependencies are its *siblings* in `.pnpm/<name>@<version>/node_modules/`,
 * reached by relative symlinks; lift the package out of that directory and its
 * dependencies are simply gone. Dereferencing one level deeper does not help
 * either, because each of those has siblings of its own.
 *
 * So the store's shape is kept and only the reachable part of it is copied: start
 * at the `.pnpm` directory holding `prisma`, copy it with its links intact, then
 * follow every link that lands in another `.pnpm` directory and copy that too,
 * until nothing new turns up. What ships is a self-contained store plus the one
 * top-level symlink that names its entry point — which is exactly what
 * `cluster.js` already looks for at `<appRoot>/node_modules/prisma/build/index.js`.
 */
function stagePrismaCli(stageDir) {
  const store = path.join(repoRoot, "node_modules", ".pnpm");
  const entry = createRequire(path.join(repoRoot, "package.json")).resolve("prisma/package.json");
  const relative = path.relative(store, entry);
  if (relative.startsWith("..")) {
    throw new Error(
      `The Prisma CLI resolved to ${entry}, which is not inside ${store}.\n` +
        "This staging step assumes pnpm's isolated node_modules layout, which " +
        "`packageManager` in the root package.json pins.",
    );
  }
  const root = relative.split(path.sep)[0];

  const stagedStore = path.join(stageDir, "node_modules", ".pnpm");
  const copied = new Set();
  const pending = [root];
  while (pending.length > 0) {
    const name = pending.pop();
    if (copied.has(name)) continue;
    copied.add(name);
    const target = path.join(stagedStore, name);
    fs.cpSync(path.join(store, name), target, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      force: true,
    });
    for (const link of walkSymlinks(target)) {
      const inStore = path.relative(stagedStore, link.resolved);
      if (inStore.startsWith("..")) continue;
      const next = inStore.split(path.sep)[0];
      if (next && !copied.has(next)) pending.push(next);
    }
  }

  fs.mkdirSync(path.join(stageDir, "node_modules"), { recursive: true });
  fs.symlinkSync(
    path.join(".pnpm", root, "node_modules", "prisma"),
    path.join(stageDir, "node_modules", "prisma"),
  );
  return { root, closure: copied.size };
}

function bytes(dir) {
  let total = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

const mb = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;

export async function stage({ buildDir = DESKTOP_BUILD_DIR } = {}) {
  const started = Date.now();
  const stageDir = path.join(packageRoot, ".stage");
  const sourceStandalone = path.join(repoRoot, buildDir, "standalone");

  if (!fs.existsSync(path.join(sourceStandalone, "server.js"))) {
    throw new Error(
      `No desktop build at ${sourceStandalone}.\n` +
        "Run `pnpm build:desktop` at the repository root before packaging.",
    );
  }
  // The same refusal the launcher makes, made earlier: a VPS bundle packages
  // perfectly and is wrong silently (plan §14.1).
  assertDesktopBundle(sourceStandalone, buildDir);

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  // 1. The standalone server.
  const stagedStandalone = path.join(stageDir, buildDir, "standalone");
  const rebuilt = new Set([
    path.join(sourceStandalone, "public"),
    path.join(sourceStandalone, buildDir, "static"),
    path.join(sourceStandalone, buildDir, "cache"),
  ]);
  const dropped = await copyTree(sourceStandalone, stagedStandalone, {
    skip: (source) => DOTENV_FILE.test(path.basename(source)) || rebuilt.has(source),
  });
  log(`standalone copied, dropping ${dropped.length}: ${dropped.join(", ")}`);

  // 2. Static assets, as real files rather than the launcher's symlink.
  await copyTree(path.join(repoRoot, buildDir, "static"), path.join(stagedStandalone, buildDir, "static"));
  log(`${buildDir}/static copied`);

  // 3. `public/`, minus the *web* build's service worker. `next-pwa`'s
  //    `dest: "public"` writes into the source tree, so this directory is shared
  //    state between the two builds (plan §14.5) and a desktop package assembled
  //    from it would serve a `/sw.js` nothing registers.
  const publicSource = path.join(repoRoot, "public");
  const publicTarget = path.join(stagedStandalone, "public");
  fs.mkdirSync(publicTarget, { recursive: true });
  const excluded = [];
  for (const name of fs.readdirSync(publicSource)) {
    if (PWA_ARTIFACTS.test(name)) {
      excluded.push(name);
      continue;
    }
    await copyTree(path.join(publicSource, name), path.join(publicTarget, name));
  }
  log(`public/ copied, excluding ${excluded.length} PWA artifact(s): ${excluded.join(", ") || "none"}`);

  // 4. What `prisma migrate deploy` applies (§4.4).
  fs.mkdirSync(path.join(stageDir, "prisma"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "prisma", "schema.prisma"),
    path.join(stageDir, "prisma", "schema.prisma"),
  );
  await copyTree(
    path.join(repoRoot, "prisma", "migrations"),
    path.join(stageDir, "prisma", "migrations"),
  );
  const migrations = fs
    .readdirSync(path.join(stageDir, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
  log(`prisma/ copied (${migrations} migrations)`);

  // 5. The CLI that applies them, and the engines it shells out to.
  const staged = stagePrismaCli(stageDir);
  log(`prisma CLI staged: ${staged.root} plus ${staged.closure - 1} package(s) it reaches`);

  // 6. The two claims this script exists to make.
  assertNoDotenv(stageDir);
  const links = assertLinksStayInside(stageDir);

  log(
    `staged ${mb(bytes(stageDir))} to ${path.relative(repoRoot, stageDir)} ` +
      `(${links} symlinks, all internal) in ${Date.now() - started} ms`,
  );
  return stageDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  stage().catch((error) => {
    console.error(`[stage] ${error.message}`);
    process.exit(1);
  });
}
