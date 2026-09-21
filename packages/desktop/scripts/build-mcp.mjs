/**
 * Bundle the stdio MCP server so a packaged desktop build can spawn it.
 *
 * docs/plans/in-app-terminal.md §2.2 and §4.4. The `.mcp.json` this app
 * generates has to name a command that exists inside the installed
 * application, and the one the repository uses cannot be it:
 *
 *   node --import tsx --env-file=.env mcp/content-server.ts
 *
 * `mcp/content-server.ts` imports `@/lib/mcp/server` and `@/repositories/user`
 * — TypeScript, through the `@/*` alias, against `src/` — and a packaged build
 * ships neither `src/` nor `tsx`. That is the same rule `ops/README.md` states
 * for the production containers ("nothing in `prisma/scripts/` can run in the
 * `app` container"), arriving in a second place, and it is worth reading as a
 * general property of this repository rather than a fact about one file:
 * **anything that imports from `src/` runs only where the repository is.**
 *
 * ## Why the output lands inside the standalone tree
 *
 * `@prisma/client` is left external rather than bundled — it is a generated
 * package with a native query engine beside it, and a copy inlined here would
 * be a second client drifting from the one the server uses against the same
 * schema. External means it has to *resolve* at runtime, and Node resolves it
 * by walking up from the file's own directory. Measured, before this script
 * was written: the bundle runs from the repository root and dies with
 * `ERR_MODULE_NOT_FOUND` from a directory that has no `node_modules` above it.
 *
 * So the bundle is written into `<standalone>/mcp/`, where the standalone
 * bundle's own `node_modules/@prisma/client` is directly above it. That is also
 * the honest arrangement: the MCP server and the Next server then hold the same
 * client, generated once.
 *
 * ## What this does not do
 *
 * It does not read `.env`, and nothing here inlines one — `MCP_AUTHOR_ID` and
 * `DATABASE_URL` stay `process.env` reads, supplied by the generated
 * `.mcp.json` (`mcpConfig.js`). `esbuild` is not given `--define`, so there is
 * no build-time value to leak; `assertNoDotenv` and the credential scan in
 * `verify-package.mjs` cover the claim rather than this comment.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DESKTOP_BUILD_DIR } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
// Resolved against *this package*, not the repository root: `esbuild` is a
// devDependency of `@blog/desktop` because this is the only thing that builds
// with it, and pnpm's strict layout means a transitive copy at the root is
// reachable as a binary but not as a module.
const require = createRequire(path.join(here, "..", "package.json"));

/** The entry, the alias and the externals — one place, so both callers agree. */
export const MCP_ENTRY = path.join(repoRoot, "mcp", "content-server.ts");
export const MCP_BUNDLE_NAME = "content-server.mjs";

/**
 * `@prisma/client` and the generated client it re-exports.
 *
 * `.prisma` is the generated package's own directory and is reached by a bare
 * specifier from inside `@prisma/client`; leaving it out makes esbuild try to
 * inline a directory of engine binaries.
 */
const EXTERNAL = ["@prisma/client", ".prisma"];

/**
 * Write the bundle next to a standalone server.
 *
 * `outDir` is the standalone root — the directory holding `server.js` — and the
 * bundle lands in `mcp/` beneath it, which is what `main.js` resolves and what
 * `verify-package.mjs` asserts.
 */
export async function buildMcpServer({ standaloneRoot, log = () => {} }) {
  const esbuild = require("esbuild");
  const outfile = path.join(standaloneRoot, "mcp", MCP_BUNDLE_NAME);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });

  await esbuild.build({
    entryPoints: [MCP_ENTRY],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: EXTERNAL,
    // The `@/*` alias from `tsconfig.json`, restated because esbuild does not
    // read the TypeScript path mapping on its own.
    alias: { "@": path.join(repoRoot, "src") },
    logLevel: "silent",
  });

  const bytes = fs.statSync(outfile).size;
  log(`mcp server bundled: ${(bytes / 1024 / 1024).toFixed(1)} MB -> ${path.relative(standaloneRoot, outfile)}`);
  return outfile;
}

/** Where the bundle belongs for a given standalone root. */
export const mcpBundlePath = (standaloneRoot) =>
  path.join(standaloneRoot, "mcp", MCP_BUNDLE_NAME);

// Run directly (`pnpm --filter @blog/desktop build:mcp`): target the working
// tree's desktop build, which is what `pnpm desktop` then serves.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const standaloneRoot = path.join(repoRoot, DESKTOP_BUILD_DIR, "standalone");
  if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
    console.error(
      `No desktop build at ${standaloneRoot}.\nRun \`pnpm build:desktop\` at the repository root first.`,
    );
    process.exit(1);
  }
  await buildMcpServer({ standaloneRoot, log: (line) => console.error(`[mcp] ${line}`) });
}
