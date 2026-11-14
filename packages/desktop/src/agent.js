import os from "node:os";
import { randomUUID } from "node:crypto";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { buildTerminalEnv } from "./terminal.js";

/**
 * One Claude Agent SDK session, owned by the main process.
 *
 * docs/plans/agent-block.md §3.1, §4.1. The SDK runs here rather than in the
 * renderer because it spawns a `claude` child with the user's privileges —
 * the same reason `pty.js` owns the terminal. What is new is that the session's
 * doc tools are **defined here and executed elsewhere**: `executeTool` is the
 * seam, and `agentIpc.js` implements it as a round trip to the renderer, which
 * applies the call to the live `LexicalEditor`. Main never writes a document
 * (§3.2), and this file has no idea what one is.
 *
 * No `electron` import, deliberately: `scripts/spike-agent-sdk.mjs` drives this
 * module under plain Node (or Electron's Node with `ELECTRON_RUN_AS_NODE`)
 * with a fake `executeTool`, which is how auth and the in-process tool were
 * proven without booting the cluster.
 *
 * ### Phase 0's scope, stated where it is enforced
 *
 * - **No built-in tools** (`tools: []`) and `permissionMode: "dontAsk"`, so
 *   anything not in `allowedTools` is denied rather than prompted. There is no
 *   permission UI until phase 2, and a session that could reach Bash without
 *   one is the thing §2.7's picker and cards exist to prevent.
 * - **No filesystem settings** (`settingSources: []`): no user hooks, no
 *   CLAUDE.md, no user MCP servers. §2.7 wants all of those back, and phase 1
 *   is where they return — together with the cwd picker that makes them safe.
 *
 * The events handed to `onEvent` are a narrow projection of the SDK's message
 * stream, not the stream: the renderer gets text, tool names and a result, and
 * never a raw `SDKMessage` whose shape is the SDK's to change.
 */

/** The in-process MCP server's name, and so the `mcp__doc__*` tool prefix. */
export const DOC_SERVER = "doc";

/**
 * The doc tools this phase defines. Main owns the names and the schemas; the
 * renderer owns what they do. A call for anything not listed here never
 * crosses the bridge.
 */
export const DOC_TOOLS = ["insert_blocks"];

/** How long a tool call may wait on the renderer before the agent hears it failed. */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * `insert_blocks`, with a deliberately loose block shape.
 *
 * The real block schema is `opSchema` in `src/lib/content-bridge/schema.ts` —
 * TypeScript on zod 3, which this plain-JS package on zod 4 cannot import. So
 * it is enforced on the renderer side, where the executor parses the call with
 * that schema before touching the editor; here the model is only told the
 * shape. Phase 1 should bundle the content-bridge schema into main (the way
 * `build-mcp.mjs` bundles the MCP server) so both halves describe one thing.
 */
const insertBlocksShape = {
  blocks: z
    .array(z.object({ type: z.string() }).passthrough())
    .min(1)
    .describe('Blocks to insert, e.g. [{ "type": "paragraph", "text": "Hello" }]'),
  after: z.string().optional().describe("Insert after this block address"),
  before: z.string().optional().describe("Insert before this block address"),
  appendTo: z
    .string()
    .optional()
    .describe('Append inside this container, or "root" for the end of the post'),
};

const INSERT_BLOCKS_DOC =
  "Insert blocks into the post the author has open. Authorable block types: " +
  "paragraph {text}, heading {level 1-6, text}, quote {text}, " +
  "code {language, code}, list {listType bullet|number|check, items[{text}]}, " +
  "divider {}. Text is inline markdown (**bold**, __italic__, `code`). " +
  'With no placement the blocks go at the end of the post. Returns { ok, inserted } ' +
  "with the new blocks' ids, or { ok: false, error }.";

/**
 * Start a session and run its first turn.
 *
 * `executeTool(name, input)` resolves to a JSON-serializable result; a throw
 * or `{ ok: false }` reaches the model as a tool error, never as a crash of the
 * turn. `onEvent` receives the projected events below.
 *
 * Returns `{ sessionId, interrupt, done }`. `sessionId` is minted here and
 * handed to the SDK as its own session id, so the id the bridge speaks, the id
 * `resume` takes and the `<sessionId>.jsonl` under `~/.claude/projects` are
 * one string (§3.3's "full transcript" link needs exactly that).
 */
export function createAgentSession({
  cwd,
  prompt,
  executeTool,
  onEvent,
  log = () => {},
  pathToClaudeCodeExecutable,
}) {
  const sessionId = randomUUID();
  const abortController = new AbortController();

  const docServer = createSdkMcpServer({
    name: DOC_SERVER,
    version: "0.0.0",
    tools: [
      tool("insert_blocks", INSERT_BLOCKS_DOC, insertBlocksShape, async (args) =>
        toCallToolResult(await runTool(executeTool, "insert_blocks", args)),
      ),
    ],
  });

  const run = query({
    prompt,
    options: {
      cwd,
      sessionId,
      abortController,
      tools: [],
      allowedTools: DOC_TOOLS.map((name) => `mcp__${DOC_SERVER}__${name}`),
      permissionMode: "dontAsk",
      settingSources: [],
      mcpServers: { [DOC_SERVER]: docServer },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append:
          "You are working inside a blog post the author has open. Your output " +
          "goes into the post through the doc tools — prefer them over replying " +
          "in prose; text you reply with goes into a log, not the post.",
      },
      // The terminal's environment rule, reused rather than restated: open,
      // minus `ELECTRON_RUN_AS_NODE` (which would make every `node` the agent
      // runs an Electron pretending to be one), plus `~/.local/bin` on `PATH`.
      // Passing `env` *replaces* the child's environment in the SDK, so this
      // has to be the whole thing, not a delta.
      env: {
        ...buildTerminalEnv(process.env, { home: os.homedir() }),
        CLAUDE_AGENT_SDK_CLIENT_APP: "blog-desktop/0.0.0",
      },
      ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
      stderr: (data) => log(`agent ${sessionId}: ${String(data).trimEnd()}`),
    },
  });

  const done = (async () => {
    try {
      for await (const message of run) {
        const event = project(message);
        if (event) onEvent({ sessionId, ...event });
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        onEvent({ sessionId, type: "error", message: errorMessage(error) });
      }
    } finally {
      onEvent({ sessionId, type: "closed" });
    }
  })();

  return {
    sessionId,
    interrupt: () => run.interrupt().catch(() => {}),
    close: () => abortController.abort(),
    done,
  };
}

/** Run one call, turning every failure into the `{ ok: false }` shape. */
async function runTool(executeTool, name, args) {
  try {
    const result = await executeTool(name, args);
    return result ?? { ok: false, error: "The editor returned nothing." };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function toCallToolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    ...(result && result.ok === false ? { isError: true } : {}),
  };
}

/**
 * The SDK message stream, projected onto what a block can show.
 *
 * Unrecognised messages return `null` and are dropped: the SDK adds message
 * types often (there are three dozen), and passing them through would make
 * the renderer's contract whatever this SDK version emits.
 */
export function project(message) {
  switch (message?.type) {
    case "system":
      if (message.subtype !== "init") return null;
      return {
        type: "init",
        model: message.model,
        apiKeySource: message.apiKeySource,
        claudeCodeVersion: message.claude_code_version,
        tools: message.tools ?? [],
      };
    case "assistant": {
      if (message.parent_tool_use_id) return null;
      const content = message.message?.content ?? [];
      const text = content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const toolUses = content
        .filter((block) => block.type === "tool_use")
        .map((block) => block.name);
      if (!text && toolUses.length === 0) return null;
      return { type: "assistant", text, toolUses };
    }
    case "result":
      return {
        type: "result",
        subtype: message.subtype,
        isError: Boolean(message.is_error),
        turns: message.num_turns,
        costUsd: message.total_cost_usd,
      };
    default:
      return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
