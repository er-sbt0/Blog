import fs from "node:fs";
import path from "node:path";

/**
 * The `.mcp.json` the shell writes into the terminal's workspace.
 *
 * docs/plans/in-app-terminal.md §4.4. This is the part of the feature that is
 * not a convenience: **the library has no file representation.** Posts are
 * Lexical JSON rows in Postgres, so a terminal in a directory with no
 * `.mcp.json` is a terminal that cannot see a single post, and §4.4 declines
 * "ship the terminal and let the user configure MCP" for exactly that reason.
 *
 * Generated per launch rather than committed, because both of the values that
 * matter are per-machine: `DATABASE_URL` carries the socket and the ephemeral
 * port of a cluster that lives under `userData`, and `MCP_AUTHOR_ID` is the id
 * of the row `seedLocalUser` made on first launch.
 *
 * The builder and the merge are pure and specced (`__tests__/mcpConfig.test.ts`);
 * `writeMcpConfig` is the two lines of I/O they refuse to carry, in the same
 * relationship `paths.js` has to `windowState.js`.
 */

/** The one server this app owns in that file. Every other key belongs to the user. */
export const MCP_SERVER_NAME = "blog-content";

/** The filename Claude Code reads from its working directory. */
export const MCP_CONFIG_FILE = ".mcp.json";

/**
 * The entry naming the bundled stdio MCP server.
 *
 * `command` is `process.execPath` with `ELECTRON_RUN_AS_NODE: "1"`, which is
 * the same trick `server.js:483` uses to start the Next child: Electron's own
 * Node runs the script, so a packaged build carries no second Node runtime and
 * does not depend on the user having one. §2.2 is why a `.mjs` has to exist to
 * hand it at all — `mcp/content-server.ts` imports from `src/` through the
 * `@/*` alias, and a packaged desktop build ships neither `src/` nor `tsx`.
 *
 * **The `env` block is load-bearing, not tidy.** `@prisma/client` runs a
 * dotenv-style load of `.env` from the process working directory at *import*
 * time, and this child inherits the terminal's cwd — the workspace directory
 * the user is invited to keep their own files in (§4.6). So a `.env` dropped
 * there would otherwise be read, and would decide which database the agent
 * edits and whose posts it edits them as. Setting both variables here is what
 * makes that harmless: those loaders do not overwrite a variable that is
 * already set, so naming them explicitly is what takes the decision away from
 * a file in a directory this app does not control.
 */
export function buildMcpConfig({ execPath, serverEntry, databaseUrl, authorId }) {
  return {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: execPath,
        args: [serverEntry],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          DATABASE_URL: databaseUrl,
          MCP_AUTHOR_ID: authorId,
        },
      },
    },
  };
}

/**
 * The file to write, given what is already there.
 *
 * This is §9's open question 4 — "regenerated or merged?" — answered in the
 * safe direction. The generated entry replaces **only** the `blog-content` key.
 * Every other server in `mcpServers` is kept, and so is every unrelated
 * top-level key, because the alternative is that a user who added their own
 * MCP server to this file loses it on the next launch, silently, with no copy
 * anywhere. The app owns one key in a file it does not own.
 *
 * Nothing is merged *into* our own entry. It is replaced outright, because
 * every field in it — the executable, the bundle's path, the socket, the author
 * id — is derived from this launch, and half of one launch's values beside half
 * of another's is a configuration that names a cluster that is not running.
 *
 * Anything that is not a JSON object is treated as absent rather than as an
 * error: a truncated write, a hand-edit that left a trailing comma, or a `null`
 * are all "there is no usable config here", and a launch is not the moment to
 * refuse to start over it. The cost is that a corrupt file is overwritten,
 * which is the same cost the file had before it was corrupt.
 */
export function mergeMcpConfig(existing, generated) {
  if (!isPlainObject(existing)) return generated;
  const servers = isPlainObject(existing.mcpServers) ? existing.mcpServers : {};
  return {
    ...existing,
    mcpServers: { ...servers, ...generated.mcpServers },
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Write it, merging over whatever is there. Returns the path written.
 *
 * Pretty-printed with a trailing newline because this file is a thing the user
 * may open, diff and edit — the merge above exists precisely because they are
 * allowed to.
 */
export function writeMcpConfig(dir, config) {
  const file = path.join(dir, MCP_CONFIG_FILE);
  let existing = null;
  try {
    existing = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // Missing, unreadable or not JSON: `mergeMcpConfig` treats all three as
    // absent, which is the only outcome that lets a first launch work.
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(mergeMcpConfig(existing, config), null, 2)}\n`);
  return file;
}
