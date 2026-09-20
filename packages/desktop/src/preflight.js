import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * The platform package holding the Postgres binaries, resolved the same way
 * `embedded-postgres` resolves it internally (`dist/binary.js`). Kept in step
 * with that switch deliberately: if this disagrees, preflight would check a
 * different tree from the one that actually launches.
 */
function platformPackage() {
  const arch = os.arch();
  const platform = os.platform();
  if (platform === "win32") return arch === "x64" ? "@embedded-postgres/windows-x64" : null;
  if (platform === "darwin") {
    if (arch === "arm64") return "@embedded-postgres/darwin-arm64";
    if (arch === "x64") return "@embedded-postgres/darwin-x64";
    return null;
  }
  if (platform === "linux") {
    const known = { x64: "linux-x64", arm64: "linux-arm64", arm: "linux-arm", ia32: "linux-ia32", ppc64: "linux-ppc64" };
    return known[arch] ? `@embedded-postgres/${known[arch]}` : null;
  }
  return null;
}

/**
 * The platform package is an *optional* dependency of `embedded-postgres`, not
 * of this package, so under pnpm's strict layout it is only visible from inside
 * `embedded-postgres` — a bare `import()` from here does not resolve it. Resolve
 * it from there, the same place `dist/binary.js` does.
 */
function resolvePlatformPackage(specifier) {
  const require = createRequire(import.meta.resolve("embedded-postgres"));
  return require.resolve(specifier);
}

/**
 * Prove the Postgres binaries can actually load before we try to start them.
 *
 * npm tarballs cannot carry symlinks, so `@embedded-postgres/<platform>`
 * recreates 14 of them in `native/lib/` from its own `pg-symlinks.json`, in a
 * `postinstall`. Anything that skips that step — `--ignore-scripts`, a pnpm
 * `allowBuilds` list that does not name the package, a packager that flattens
 * links — leaves a tree that looks complete and dies at launch with
 * `error while loading shared libraries: libicui18n.so.60`
 * (docs/plans/desktop-app.md §10.3).
 *
 * That message names a library nobody in this repo has heard of, arrives from a
 * child process, and is three steps from its cause. Checking here costs one
 * `lstat` per link and turns it into a sentence naming the fix.
 */
export async function preflightPostgresBinaries() {
  const specifier = platformPackage();
  if (!specifier) {
    throw new Error(
      `No embedded Postgres binaries exist for ${os.platform()}-${os.arch()}. ` +
        "The desktop build targets linux-x64 for its first release (docs/plans/desktop-app.md §1).",
    );
  }

  let binaries;
  try {
    binaries = await import(pathToFileURL(resolvePlatformPackage(specifier)));
  } catch (cause) {
    throw new Error(
      `Could not load ${specifier}. Run \`pnpm install\` at the repository root.\n${cause.message}`,
      { cause },
    );
  }

  // The binaries carry RUNPATH=$ORIGIN/../lib, so `lib` is always the sibling of
  // `bin` — deriving it from the binary path rather than from the package root
  // keeps this correct wherever the tree has been relocated to (§10.3).
  const nativeDir = path.resolve(path.dirname(binaries.postgres), "..");
  const packageRoot = path.resolve(nativeDir, "..");

  for (const binary of ["initdb", "pg_ctl", "postgres"]) {
    const file = path.join(nativeDir, "bin", binary);
    if (!fs.existsSync(file)) {
      throw new Error(`The embedded Postgres binary \`${binary}\` is missing at ${file}.`);
    }
  }

  const manifest = path.join(nativeDir, "pg-symlinks.json");
  let expected;
  try {
    expected = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch (cause) {
    throw new Error(`Could not read ${manifest}: ${cause.message}`, { cause });
  }

  const missing = expected
    .map((link) => path.resolve(packageRoot, link.target))
    .filter((target) => {
      try {
        // lstat, not stat: a dangling symlink is as broken as an absent one, and
        // `existsSync` follows links and would call it absent either way. This
        // distinguishes "never created" from "points at nothing".
        fs.lstatSync(target);
        return false;
      } catch {
        return true;
      }
    });

  if (missing.length > 0) {
    throw new Error(
      `${missing.length} of ${expected.length} shared-library symlinks are missing from ${specifier}.\n` +
        `First missing: ${missing[0]}\n\n` +
        "Postgres would die at launch with `error while loading shared libraries: libicui18n.so.60`.\n" +
        "Fix: pnpm-workspace.yaml must list this package under `allowBuilds` so its postinstall runs, then:\n" +
        `  cd ${packageRoot} && node scripts/hydrate-symlinks.js\n` +
        "or re-run `pnpm install` at the repository root. See docs/plans/desktop-app.md §10.3.",
    );
  }

  return { specifier, packageRoot, count: expected.length };
}
