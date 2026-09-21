import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildMcpConfig, mergeMcpConfig, writeMcpConfig } from "../mcpConfig.js";

/**
 * The generated `.mcp.json` (docs/plans/in-app-terminal.md §4.4).
 *
 * This file is not a convenience. The library has no file representation —
 * posts are Lexical JSON rows in Postgres — so a terminal in a directory
 * without it is a terminal that cannot see a single post, which is why §4.4
 * declines "ship the terminal and let the user configure MCP".
 *
 * Two things are worth a spec rather than a comment. The `env` block is
 * load-bearing: `@prisma/client` loads a `.env` from the process working
 * directory at import time, and this child's working directory is the
 * workspace the user keeps their own files in (§4.6) — so naming both
 * variables explicitly is what stops a dropped `.env` from deciding which
 * database the agent edits. And the merge is §9's open question 4 answered in
 * the direction where a mistake is recoverable: the app owns one key in a file
 * it does not own, and overwriting the file wholesale would discard the user's
 * own MCP servers silently, with no copy anywhere.
 */

const generated = buildMcpConfig({
  execPath: "/opt/blog/blog-desktop",
  serverEntry: "/opt/blog/resources/.next-desktop/standalone/mcp/content-server.mjs",
  databaseUrl: "postgresql://blog@127.0.0.1:41234/blog",
  authorId: "usr_local",
});

describe("buildMcpConfig", () => {
  it("names the bundled server under the one key this app owns", () => {
    expect(Object.keys(generated.mcpServers)).toEqual(["blog-content"]);
    expect(generated.mcpServers["blog-content"].args).toEqual([
      "/opt/blog/resources/.next-desktop/standalone/mcp/content-server.mjs",
    ]);
  });

  /**
   * `process.execPath` plus `ELECTRON_RUN_AS_NODE` is the same trick
   * `server.js:483` uses for the Next child: Electron's own Node runs the
   * script, so a packaged build carries no second runtime and does not depend
   * on the user having one on `PATH`.
   */
  it("runs it under Electron's own Node", () => {
    const server = generated.mcpServers["blog-content"];
    expect(server.command).toBe("/opt/blog/blog-desktop");
    expect(server.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  /**
   * The silent failure this prevents: a `.env` a user dropped in the workspace
   * is read by `@prisma/client` at import time, and dotenv-style loaders do not
   * overwrite a variable that is already set — so setting these here is what
   * takes "which database, and whose posts" away from a file in a directory
   * this app does not control.
   */
  it("sets both per-machine variables rather than letting the cwd supply them", () => {
    expect(generated.mcpServers["blog-content"].env).toEqual({
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: "postgresql://blog@127.0.0.1:41234/blog",
      MCP_AUTHOR_ID: "usr_local",
    });
  });
});

describe("mergeMcpConfig", () => {
  it("is the generated config when there is nothing there", () => {
    expect(mergeMcpConfig(null, generated)).toEqual(generated);
  });

  /**
   * §9's question 4. Overwriting is the easy answer and it deletes the user's
   * work with no warning and no copy — so only our own key is replaced.
   */
  it("keeps every other server the user configured", () => {
    const merged = mergeMcpConfig(
      {
        mcpServers: {
          "blog-content": { command: "stale", args: ["/gone.mjs"] },
          github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
        },
      },
      generated,
    );
    expect(Object.keys(merged.mcpServers).sort()).toEqual(["blog-content", "github"]);
    expect(merged.mcpServers.github.command).toBe("npx");
  });

  it("keeps unrelated top-level keys, which are not ours to decide about", () => {
    const merged = mergeMcpConfig(
      { $schema: "https://example/mcp.json", mcpServers: {} },
      generated,
    );
    expect(merged.$schema).toBe("https://example/mcp.json");
  });

  /**
   * Replaced outright, never field-by-field: every value in our entry — the
   * executable, the bundle's path, the socket, the author id — comes from
   * *this* launch, and half of one launch's values beside half of another's is
   * a configuration naming a cluster that is not running.
   */
  it("replaces our own entry rather than merging into it", () => {
    const merged = mergeMcpConfig(
      {
        mcpServers: {
          "blog-content": {
            command: "node",
            args: ["--import", "tsx", "mcp/content-server.ts"],
            env: { DATABASE_URL: "postgresql://somewhere-else/blog" },
          },
        },
      },
      generated,
    );
    expect(merged.mcpServers["blog-content"]).toEqual(generated.mcpServers["blog-content"]);
  });

  /**
   * A truncated write, a hand-edit that left a trailing comma and a `null` are
   * all "there is no usable config here". A launch is not the moment to refuse
   * to start over one, and the cost — overwriting a corrupt file — is the cost
   * the file already had.
   */
  it("treats anything that is not an object as absent", () => {
    for (const junk of [undefined, null, 42, "{}", [], true]) {
      expect(mergeMcpConfig(junk, generated)).toEqual(generated);
    }
  });

  it("treats a broken mcpServers the same way, without losing the rest", () => {
    const merged = mergeMcpConfig({ mcpServers: "oops", note: "mine" }, generated);
    expect(merged.mcpServers).toEqual(generated.mcpServers);
    expect(merged.note).toBe("mine");
  });
});

describe("writeMcpConfig", () => {
  const made: string[] = [];
  const workspace = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "desktop-mcp-"));
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes .mcp.json into the workspace", () => {
    const dir = workspace();
    const file = writeMcpConfig(dir, generated);
    expect(file).toBe(path.join(dir, ".mcp.json"));
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(generated);
  });

  it("merges over what is already there", () => {
    const dir = workspace();
    writeFileSync(
      path.join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { github: { command: "npx" } } }),
    );
    const written = JSON.parse(readFileSync(writeMcpConfig(dir, generated), "utf8"));
    expect(Object.keys(written.mcpServers).sort()).toEqual(["blog-content", "github"]);
  });

  it("replaces a file that is not JSON rather than failing the launch", () => {
    const dir = workspace();
    writeFileSync(path.join(dir, ".mcp.json"), "{ not json");
    expect(JSON.parse(readFileSync(writeMcpConfig(dir, generated), "utf8"))).toEqual(generated);
  });

  /** It is a file the user may open and edit, which is the whole premise of the merge. */
  it("leaves it pretty-printed and newline-terminated", () => {
    const dir = workspace();
    const contents = readFileSync(writeMcpConfig(dir, generated), "utf8");
    expect(contents).toMatch(/\n$/);
    expect(contents).toContain('\n  "mcpServers"');
  });
});
