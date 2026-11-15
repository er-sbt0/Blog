import os from "node:os";
import { randomUUID } from "node:crypto";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BLOCK_DOC, opSchema, RECOVERY_DOC } from "./generated/docSchema.mjs";
import { buildTerminalEnv } from "./terminal.js";
import { buildSystemPrompt, DOC_SERVER, DOC_TOOLS, project } from "./agentProtocol.js";

export { DOC_SERVER, DOC_TOOLS, TOOL_TIMEOUT_MS } from "./agentProtocol.js";

/**
 * One Claude Agent SDK session, owned by the main process — every turn of it
 * (docs/plans/agent-block.md §3.1, §4.1, phase 1).
 *
 * The SDK runs here rather than in the renderer because it spawns a `claude`
 * child with the user's privileges — the same reason `pty.js` owns the
 * terminal. The session's doc tools are **defined here and executed
 * elsewhere**: `executeTool` is the seam, and `agentIpc.js` implements it as a
 * round trip to the renderer, which applies the call to the live editor of the
 * post holding the block. Main never writes a document (§3.2).
 *
 * ### Turns, and the one id
 *
 * Each prompt is its own `query()`. The first is given `sessionId` — minted
 * here, so the id the bridge speaks, `resume`'s argument and the SDK's
 * `<sessionId>.jsonl` are one string (§7, phase-0 note on ids) — and every
 * later one `resume`s it, which is also all a reopened post needs: a block that
 * has a session id resumes on its next send, from a session object this module
 * builds fresh with `resume: true`.
 *
 * ### The schema the model sees is the real one
 *
 * `opSchema`, `BLOCK_DOC` and `RECOVERY_DOC` come from
 * `src/lib/content-bridge/schema.ts`, bundled by `scripts/build-agent-schema.mjs`
 * (phase-0 note 2). So the tools are described exactly as blog-content
 * describes them, and the renderer validates with the same schema again before
 * it touches the editor.
 *
 * ### Phase 1's scope, stated where it is enforced
 *
 * - **No built-in tools** (`tools: []`) and `permissionMode: "dontAsk"`, so
 *   anything not in `allowedTools` is denied rather than prompted. The folder
 *   picker exists now (`agentIpc.js`), but §2.7's full Claude Code — Bash,
 *   file edits, web, the user's MCP servers — comes back in phase 2 together
 *   with `canUseTool` and the in-block permission cards, not before.
 * - **No filesystem settings** (`settingSources: []`): no user hooks, no
 *   CLAUDE.md, no user MCP servers. Same reason, same phase.
 *
 * No `electron` import, deliberately: `scripts/spike-agent-sdk.mjs` drives this
 * module under plain Node with a fake `executeTool`.
 */

const OUTLINE_DOC =
  "Skeleton of the post the author has open: one line per block with its " +
  "address, kind and a preview. Start here — the addresses it returns are what " +
  "read_blocks and apply_ops take. Blocks marked [read-only] can be moved or " +
  "deleted but not rewritten; an `agent` block is the author's and cannot be " +
  "touched at all. Returns the stateHash apply_ops requires.";

const READ_DOC =
  "Full content of specific blocks of the open post, by address from outline. " +
  "Read a block before rewriting it.";

const APPLY_DOC =
  "Edit the post the author has open, block by block. Unlike the blog-content " +
  "tools this does NOT propose: the change lands in the live editor at once, " +
  "on the author's undo stack, and is saved like their own typing — report it " +
  "as done. Every op names a block address from a read, and the batch carries " +
  "that read's stateHash; if the post has changed since — the author typing " +
  "counts — the whole batch is refused and you re-read. Ops apply " +
  "all-or-nothing, and blocks you do not name are left exactly as they were. " +
  "insert_blocks with no after/before/appendTo puts its blocks after your " +
  "agent block (after your previous such insert, once there is one), in " +
  "order — the usual way to write. " +
  "Ops: set_text{id,text}, replace_block{id,block}, " +
  "insert_blocks{blocks,after|before|appendTo}, delete_block{id}, " +
  "move_block{id,after|before|appendTo}. " +
  BLOCK_DOC +
  " " +
  RECOVERY_DOC;

/** The renderer's `{ ok, text }` / `{ ok: false, error }` as an MCP result. */
function toCallToolResult(result) {
  if (result && result.ok === true && typeof result.text === "string") {
    return { content: [{ type: "text", text: result.text }] };
  }
  const error = result && typeof result.error === "string"
    ? result.error
    : "The editor returned no result.";
  return { content: [{ type: "text", text: error }], isError: true };
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

/**
 * The in-process MCP server. Built per turn: an SDK MCP server instance is
 * connected to one query's transport, and a fresh one costs nothing.
 */
function docServer(executeTool) {
  const call = (name) => async (args) =>
    toCallToolResult(await runTool(executeTool, name, args));
  return createSdkMcpServer({
    name: DOC_SERVER,
    version: "1.0.0",
    tools: [
      tool("outline", OUTLINE_DOC, {}, call("outline")),
      tool(
        "read_blocks",
        READ_DOC,
        {
          blocks: z
            .array(z.string())
            .min(1)
            .describe('Block addresses, e.g. ["b2","blk_7ughz1"]'),
        },
        call("read_blocks"),
      ),
      tool(
        "apply_ops",
        APPLY_DOC,
        {
          stateHash: z
            .string()
            .describe("The stateHash from the read these addresses came from"),
          ops: z.array(opSchema).min(1),
        },
        call("apply_ops"),
      ),
    ],
  });
}

/**
 * A session: `send(prompt, context)` runs one turn and answers at once with
 * `{ ok }`; the turn's events go to `onEvent`, ending with `turn-end`.
 *
 * `resume: true` is a session the SDK already has a transcript for — one this
 * process started before a restart, re-created from `agentSessions.js`.
 */
export function createAgentSession({
  sessionId = randomUUID(),
  resume = false,
  cwd,
  executeTool,
  onEvent,
  log = () => {},
  pathToClaudeCodeExecutable,
}) {
  // Whether the SDK has a `<sessionId>.jsonl` to resume. Set by the first
  // turn's init, so a first turn that failed before starting is retried as a
  // first turn rather than as a resume of nothing.
  let hasTranscript = resume;
  /** The running turn, or null. One at a time. */
  let current = null;

  function send(prompt, context) {
    if (current) {
      return { ok: false, error: "The agent is still working on the last prompt." };
    }
    const abortController = new AbortController();
    const run = query({
      prompt,
      options: {
        cwd,
        ...(hasTranscript ? { resume: sessionId } : { sessionId }),
        abortController,
        tools: [],
        allowedTools: DOC_TOOLS.map((name) => `mcp__${DOC_SERVER}__${name}`),
        permissionMode: "dontAsk",
        settingSources: [],
        mcpServers: { [DOC_SERVER]: docServer(executeTool) },
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: buildSystemPrompt(context),
        },
        // The terminal's environment rule, reused rather than restated: open,
        // minus `ELECTRON_RUN_AS_NODE`, plus `~/.local/bin` on `PATH`. Passing
        // `env` *replaces* the child's environment in the SDK, so this has to
        // be the whole thing, not a delta.
        env: {
          ...buildTerminalEnv(process.env, { home: os.homedir() }),
          CLAUDE_AGENT_SDK_CLIENT_APP: "blog-desktop/0.0.0",
        },
        ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
        stderr: (data) => log(`agent ${sessionId}: ${String(data).trimEnd()}`),
      },
    });
    const turn = { run, abortController, interrupted: false };
    current = turn;

    void (async () => {
      try {
        for await (const message of run) {
          if (message?.type === "system" && message.subtype === "init") {
            hasTranscript = true;
          }
          const event = project(message);
          if (event) onEvent({ sessionId, ...event });
        }
      } catch (error) {
        // An interrupted turn ends with the SDK throwing "Claude Code returned
        // an error result" (measured, SDK 0.3.309). The author asked for that,
        // so it is not an error worth showing them.
        if (!abortController.signal.aborted && !turn.interrupted) {
          onEvent({ sessionId, type: "error", message: errorMessage(error) });
        }
      } finally {
        current = null;
        onEvent({ sessionId, type: "turn-end" });
      }
    })();
    return { ok: true };
  }

  return {
    sessionId,
    cwd,
    get running() {
      return current !== null;
    },
    send,
    /** Interrupt the running turn, if there is one. */
    interrupt() {
      if (!current) return false;
      current.interrupted = true;
      current.run.interrupt().catch(() => {});
      return true;
    },
    /** Abort outright — the window or the app is going. */
    close() {
      current?.abortController.abort();
    },
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
