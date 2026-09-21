/**
 * The packaging gate (docs/plans/desktop-app.md §5, §10.3, §11.3, §14.5).
 *
 * Runs as electron-builder's `afterPack` hook, against the directory that is
 * about to become the AppImage and the `.deb`, and throws — failing the build —
 * rather than warning. It is also a CLI, so the same checks can be run against
 * an *extracted* artifact:
 *
 *   node scripts/verify-package.mjs .dist/linux-unpacked
 *   node scripts/verify-package.mjs /tmp/squashfs-root
 *
 * Everything here is a claim that is false silently. A missing `.env` filter
 * ships a credential and the app runs perfectly. Dereferenced symlinks double
 * the download and the app runs perfectly. A dropped executable bit, an absent
 * `prisma/migrations`, a `public/sw.js` the web build left behind — none of them
 * announce themselves at package time, and two of them do not announce
 * themselves until a user's first launch. So each one is asserted rather than
 * assumed, in the same spirit as `assertDesktopBundle` and the post-hoc
 * `_prisma_migrations` count.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DESKTOP_BUILD_DIR, PWA_ARTIFACTS, assertDesktopBundle } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

const DOTENV_FILE = /^\.env($|\.)/;
const POSTGRES_BINARIES = ["initdb", "pg_ctl", "postgres"];
/** Below this a value is not a secret, it is a word. */
const SECRET_MIN_LENGTH = 12;
/**
 * Which `.env` keys carry a credential.
 *
 * By name rather than by shape, because the first version of this scanned every
 * value and flagged nine files for `http://localhost:3000` — `NEXTAUTH_URL` and
 * `PUBLIC_URL` are twenty-one characters of the least secret string in the
 * repository, and a gate that cries wolf gets turned off. What is worth failing
 * a build over is a secret, and a secret says so in its name.
 */
const SECRET_KEY = /SECRET|PASSWORD|PASSWD|TOKEN|_KEYS?$|API_KEY|CREDENTIAL|CLIENT_ID|DATABASE_URL|POSTGRES_URL/i;
/** Files larger than this are engine binaries and asset bundles, not `.env`s. */
const SCAN_MAX_BYTES = 1024 * 1024;

function walk(root, visit) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) visit(full, entry, "symlink");
    else if (entry.isDirectory()) {
      visit(full, entry, "dir");
      walk(full, visit);
    } else visit(full, entry, "file");
  }
}

function isExecutable(file) {
  return (fs.statSync(file).mode & 0o111) !== 0;
}

/**
 * Secret *values* from the working tree, so the scan catches a credential that
 * reached the package under a name nobody thought to filter.
 *
 * Belt and braces to the dotenv-file check, not a replacement for it: this half
 * needs a `.env` to compare against and is skipped without one, whereas "no
 * dotenv file may ship" holds on any machine.
 */
function workingTreeSecrets() {
  const values = new Map();
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    let contents;
    try {
      contents = fs.readFileSync(path.join(repoRoot, name), "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      const value = raw.trim().replace(/^(['"])(.*)\1$/, "$2");
      if (value.length >= SECRET_MIN_LENGTH && SECRET_KEY.test(key)) values.set(value, key);
    }
  }
  return values;
}

export function verifyPackage(appOutDir, { buildDir = DESKTOP_BUILD_DIR } = {}) {
  const checks = [];
  const check = (name, run) => {
    try {
      checks.push({ name, ok: true, detail: run() ?? "" });
    } catch (error) {
      checks.push({ name, ok: false, detail: error.message });
    }
  };

  const resources = path.join(appOutDir, "resources");
  if (!fs.existsSync(resources)) {
    throw new Error(`No resources directory at ${resources} — is ${appOutDir} a packed app?`);
  }
  const standalone = path.join(resources, buildDir, "standalone");

  // 1. The credential. §5's last bullet, and the reason this file exists.
  check("no dotenv file anywhere in the package", () => {
    const found = [];
    walk(appOutDir, (full, entry, kind) => {
      if (kind === "file" && DOTENV_FILE.test(entry.name)) found.push(path.relative(appOutDir, full));
    });
    if (found.length > 0) {
      throw new Error(
        `${found.length} dotenv file(s) would be distributed:\n  ${found.join("\n  ")}\n` +
          "`next build` traces the working tree's .env into <distDir>/standalone/.env " +
          "(plan §11.3). Re-run `pnpm stage`; do not ship this.",
      );
    }
    return "0 found";
  });

  check("no working-tree credential appears in any packaged file", () => {
    const secrets = workingTreeSecrets();
    if (secrets.size === 0) return "skipped: no credential in the working tree's .env to compare against";
    const hits = [];
    let scanned = 0;
    walk(resources, (full, _entry, kind) => {
      if (kind !== "file") return;
      const { size } = fs.statSync(full);
      if (size === 0 || size > SCAN_MAX_BYTES) return;
      scanned += 1;
      const contents = fs.readFileSync(full, "latin1");
      for (const [secret, key] of secrets) {
        if (contents.includes(secret)) {
          hits.push(`${path.relative(appOutDir, full)} holds ${key}`);
          return;
        }
      }
    });
    if (hits.length > 0) {
      throw new Error(`${hits.length} file(s) carry a credential from the working tree's .env:\n  ${hits.join("\n  ")}`);
    }
    return `${scanned} files scanned for ${secrets.size} credentials (${[...new Set(secrets.values())].join(", ")}), 0 hits`;
  });

  // 2. The right bundle, in the right place. §14.1.
  check("the desktop Next bundle is present and is a desktop build", () => {
    const entry = path.join(standalone, "server.js");
    if (!fs.existsSync(entry)) throw new Error(`Missing ${path.relative(appOutDir, entry)}`);
    assertDesktopBundle(standalone, buildDir);
    return path.relative(appOutDir, entry);
  });

  check("the web build's .next is absent", () => {
    for (const candidate of [path.join(resources, ".next"), path.join(standalone, ".next")]) {
      if (fs.existsSync(candidate)) {
        throw new Error(`${path.relative(appOutDir, candidate)} was packaged; that is the VPS bundle.`);
      }
    }
    return "absent";
  });

  check("static and public are real directories, not the launcher's symlinks", () => {
    for (const dir of [path.join(standalone, buildDir, "static"), path.join(standalone, "public")]) {
      const stats = fs.lstatSync(dir, { throwIfNoEntry: false });
      if (!stats) throw new Error(`Missing ${path.relative(appOutDir, dir)}`);
      if (!stats.isDirectory()) {
        throw new Error(
          `${path.relative(appOutDir, dir)} is a ${stats.isSymbolicLink() ? "symlink" : "file"}. ` +
            "`ensureStandaloneAssets` links these when running from the working tree; a package must copy them.",
        );
      }
    }
    return "both real";
  });

  // 3. The web build's service worker. §14.5 — `public/` is shared state.
  check("no service-worker artifact from the web build", () => {
    const found = [];
    walk(resources, (full, entry, kind) => {
      if (kind === "file" && PWA_ARTIFACTS.test(entry.name)) found.push(path.relative(appOutDir, full));
    });
    if (found.length > 0) {
      throw new Error(
        `${found.length} next-pwa artifact(s) were packaged:\n  ${found.join("\n  ")}\n` +
          "next-pwa writes these into the *source* public/ directory, so they belong to `pnpm build`.",
      );
    }
    return "0 found";
  });

  // 4. Migrations run on boot, so their whole toolchain ships. §4.4.
  check("prisma/migrations and the CLI that applies them", () => {
    const schema = path.join(resources, "prisma", "schema.prisma");
    const migrations = path.join(resources, "prisma", "migrations");
    const cli = path.join(resources, "node_modules", "prisma", "build", "index.js");
    for (const required of [schema, migrations, cli]) {
      if (!fs.existsSync(required)) throw new Error(`Missing ${path.relative(appOutDir, required)}`);
    }
    const packaged = fs
      .readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrations, entry.name, "migration.sql")))
      .length;
    if (packaged === 0) throw new Error("prisma/migrations is empty.");

    const inRepo = fs
      .readdirSync(path.join(repoRoot, "prisma", "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length;
    if (inRepo > 0 && packaged !== inRepo) {
      throw new Error(`${packaged} migrations packaged, ${inRepo} in the repository.`);
    }
    return `${packaged} migrations, CLI at ${path.relative(appOutDir, cli)}`;
  });

  check("the Prisma schema engine is present and executable", () => {
    const found = [];
    walk(path.join(resources, "node_modules"), (full, entry, kind) => {
      if (kind === "file" && entry.name.startsWith("schema-engine-")) found.push(full);
    });
    if (found.length === 0) {
      throw new Error("No schema-engine binary shipped; `migrate deploy` would fail at first launch.");
    }
    for (const binary of found) {
      if (!isExecutable(binary)) throw new Error(`${path.relative(appOutDir, binary)} is not executable.`);
    }
    return found.map((file) => path.basename(file)).join(", ");
  });

  /**
   * The strongest of these, and the one that came from being wrong: staging the
   * CLI by copying `node_modules/prisma` and `node_modules/@prisma` out of a
   * pnpm store produces a tree where every file the other checks look for is
   * present and the CLI dies on its first `require`. Only running it says so.
   *
   * A closed environment and an empty working directory, for the reason
   * `runMigrations` uses them (§11.3): from a directory containing no `.env`,
   * and with none inherited, there is nothing for Prisma's dotenv to find and no
   * way for this to touch a database.
   */
  check("the packaged Prisma CLI runs", () => {
    const cli = path.join(resources, "node_modules", "prisma", "build", "index.js");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "verify-prisma-"));
    try {
      const result = spawnSync(process.execPath, [cli, "version"], {
        cwd,
        timeout: 60_000,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? os.homedir(),
          TMPDIR: os.tmpdir(),
          PRISMA_HIDE_UPDATE_MESSAGE: "1",
          CHECKPOINT_DISABLE: "1",
        },
      });
      if (result.status !== 0) {
        throw new Error(
          `\`prisma version\` exited with ${result.status}:\n${(result.stderr || result.stdout || "").trim().split("\n").slice(0, 6).join("\n")}`,
        );
      }
      // The CLI prints the engine path *relative to its working directory*, so
      // it has to be resolved against that cwd before it can be compared —
      // comparing the printed string directly passes from one directory and
      // fails from another, which is worse than not checking.
      const engine = /^Schema Engine\s*:.*\(at (.+?)\)\s*$/m.exec(result.stdout)?.[1];
      const resolved = engine ? path.resolve(cwd, engine) : null;
      if (!resolved?.startsWith(resources + path.sep)) {
        throw new Error(`The CLI resolved its schema engine outside the package: ${resolved ?? "not reported"}`);
      }
      return /^prisma\s*:\s*(.+)$/m.exec(result.stdout)?.[1]?.trim() ?? "ran";
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  // 4b. The in-app terminal's MCP server (docs/plans/in-app-terminal.md §2.2).
  //
  //     Two checks rather than one, and the second is the point. That the file
  //     is present proves the staging step ran; that it *loads* proves the
  //     thing the plan was actually unsure about — `@prisma/client` is left
  //     external, so it has to resolve by walking up from the bundle's own
  //     directory, and a bundle written one directory too high resolves nothing
  //     and dies at spawn time with ERR_MODULE_NOT_FOUND. That failure would
  //     otherwise surface as "Claude Code cannot see any posts", in the app,
  //     for the user, with nothing in the package to explain it.
  check("the in-app terminal's MCP server is packaged inside the standalone tree", () => {
    const bundle = path.join(resources, buildDir, "standalone", "mcp", "content-server.mjs");
    if (!fs.existsSync(bundle)) {
      throw new Error(`No MCP server bundle at ${path.relative(resources, bundle)}. Did \`stage:resources\` run?`);
    }
    const client = path.join(resources, buildDir, "standalone", "node_modules", "@prisma", "client");
    if (!fs.existsSync(client)) {
      throw new Error("The standalone tree has no @prisma/client for the bundle to resolve.");
    }
    return `${(fs.statSync(bundle).size / 1024 / 1024).toFixed(1)} MB`;
  });

  check("the packaged MCP server loads and resolves its Prisma client", () => {
    const bundle = path.join(resources, buildDir, "standalone", "mcp", "content-server.mjs");
    // No MCP_AUTHOR_ID: the server refuses *by design* before it opens a
    // transport (`mcp/content-server.ts` exits 1 on a missing author), and that
    // refusal is the cheapest proof the whole module graph loaded. Asking it to
    // connect would need a database; asking it to refuse needs nothing.
    //
    // `MCP_AUTHOR_ID: ""` is set explicitly rather than left unset, and the cwd
    // is a scratch directory, because otherwise this check is not deterministic.
    // `@prisma/client` loads a `.env` at import — from the process cwd, and from
    // beside whatever `schema.prisma` it finds walking *up* from its own
    // location — so an author can arrive from a file nobody here named. Measured
    // while writing this: the same bundle run from a scratch cwd inside the
    // repository picked the developer's `MCP_AUTHOR_ID` up and got all the way
    // to opening a database connection. An empty string is already *present* in
    // the environment, so a dotenv loader will not overwrite it, and the refusal
    // we are looking for is the one that happens.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "verify-mcp-"));
    try {
      const result = spawnSync(process.execPath, [bundle], {
        cwd,
        timeout: 60_000,
        encoding: "utf8",
        input: "",
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? os.homedir(),
          TMPDIR: os.tmpdir(),
          ELECTRON_RUN_AS_NODE: "1",
          MCP_AUTHOR_ID: "",
        },
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      if (/ERR_MODULE_NOT_FOUND|Cannot find (module|package)/.test(output)) {
        throw new Error(
          `The bundle could not resolve a dependency from its own directory:\n${output.trim().split("\n").slice(0, 6).join("\n")}`,
        );
      }
      if (!/MCP_AUTHOR_ID is required/.test(output)) {
        throw new Error(
          `Expected the author refusal, got:\n${output.trim().split("\n").slice(0, 6).join("\n") || "(no output)"}`,
        );
      }
      return "loads, refuses without an author";
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  // 5. The 14 symlinks. §10.3 — the one packaging risk the plan named in advance.
  const native = findNativeDir(resources);
  check("the embedded Postgres shared-library symlinks survived as symlinks", () => {
    if (!native) throw new Error("No @embedded-postgres/*/native directory was packaged at all.");
    const manifest = JSON.parse(fs.readFileSync(path.join(native, "pg-symlinks.json"), "utf8"));
    const packageDir = path.resolve(native, "..");
    const missing = [];
    const dereferenced = [];
    for (const link of manifest) {
      const target = path.resolve(packageDir, link.target);
      const stats = fs.lstatSync(target, { throwIfNoEntry: false });
      if (!stats) missing.push(link.target);
      else if (!stats.isSymbolicLink()) dereferenced.push(link.target);
      else if (!fs.existsSync(target)) missing.push(`${link.target} (dangling)`);
    }
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} of ${manifest.length} symlinks are missing:\n  ${missing.join("\n  ")}\n` +
          "Postgres dies at launch with `error while loading shared libraries: libicui18n.so.60` (plan §10.3).",
      );
    }
    if (dereferenced.length > 0) {
      throw new Error(
        `${dereferenced.length} of ${manifest.length} symlinks were copied as real files:\n  ` +
          dereferenced.join("\n  ") +
          "\nThe app would work and be roughly twice the size it should be (plan §10.3).",
      );
    }
    return `${manifest.length} symlinks, all intact`;
  });

  check("the embedded Postgres binaries are present and executable", () => {
    if (!native) throw new Error("No @embedded-postgres/*/native directory was packaged at all.");
    const report = [];
    for (const binary of POSTGRES_BINARIES) {
      const file = path.join(native, "bin", binary);
      if (!fs.existsSync(file)) throw new Error(`Missing ${binary}`);
      if (!isExecutable(file)) throw new Error(`${binary} lost its executable bit.`);
      report.push(`${binary} ${(fs.statSync(file).mode & 0o777).toString(8)}`);
    }
    return report.join(", ");
  });

  // 6. Chromium's sandbox helper. §11.5: the development workaround must not ship.
  check("chrome-sandbox is packaged", () => {
    const helper = path.join(appOutDir, "chrome-sandbox");
    if (!fs.existsSync(helper)) {
      throw new Error("chrome-sandbox is missing; the packaged app could only run with --no-sandbox.");
    }
    // Not setuid here, and cannot be: electron-builder runs unprivileged. The
    // .deb's postinst chmods it to 4755 at install time; an AppImage is mounted
    // nosuid and relies on the kernel's user namespaces instead.
    return `present, mode ${(fs.statSync(helper).mode & 0o7777).toString(8)}`;
  });

  const failed = checks.filter((entry) => !entry.ok);
  const report = checks
    .map((entry) => `  ${entry.ok ? "ok  " : "FAIL"} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`)
    .join("\n");
  if (failed.length > 0) {
    throw new Error(`Package verification failed (${failed.length}/${checks.length}):\n${report}`);
  }
  return report;
}

function findNativeDir(resources) {
  const roots = [
    path.join(resources, "app", "node_modules", "@embedded-postgres"),
    path.join(resources, "node_modules", "@embedded-postgres"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const platform of fs.readdirSync(root)) {
      const native = path.join(root, platform, "native");
      if (fs.existsSync(path.join(native, "pg-symlinks.json"))) return native;
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/verify-package.mjs <packed-app-dir>");
    process.exit(2);
  }
  try {
    console.warn(`[verify] ${path.resolve(target)}\n${verifyPackage(path.resolve(target))}`);
  } catch (error) {
    console.error(`[verify] ${error.message}`);
    process.exit(1);
  }
}
