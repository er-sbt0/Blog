import { randomUUID } from "node:crypto";
import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BLOCK_DOC, opSchema, RECOVERY_DOC } from "./generated/docSchema.mjs";
import { agentEnv, buildSystemPrompt, DOC_SERVER, DOC_TOOLS, project } from "./agentProtocol.js";
import { grantsToOptions } from "./agentPermissions.js";

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
 * ### Full Claude Code, behind `canUseTool` (phase 2, §2.7)
 *
 * A session given a `canUseTool` runs with Claude Code's own tools (the
 * `claude_code` preset: Bash, file edits, web, the user's MCP servers),
 * `settingSources` user + project + local (so the user's settings and the
 * folder's CLAUDE.md load) and `permissionMode: "default"` — passed
 * explicitly, because when it is omitted the CLI takes `defaultMode` from the
 * settings it loads, and a `bypassPermissions` there would skip every card.
 * The session's grants (`agentPermissions.js`) go in `allowedTools`;
 * everything else that needs permission reaches `canUseTool`, which allows
 * the doc tools outright and turns the rest into a card in the block.
 *
 * **Without a `canUseTool` it stays sealed** exactly as phase 1 was:
 * `tools: []`, `dontAsk`, `settingSources: []`. So the switch to a shell is
 * one argument, and a caller that forgets it gets the doc tools and nothing
 * else rather than a shell nobody is asked about. `scripts/spike-agent-sdk.mjs`
 * is such a caller.
 *
 * `AskUserQuestion` is disallowed: the block has no surface for it, and a
 * question belongs in the reply, which the author answers with a follow-up.
 *
 * ### `ANTHROPIC_API_KEY` is stripped
 *
 * The terminal keeps it, because a terminal must behave like the user's own
 * (`buildTerminalEnv`). This child is not a terminal: it is the app running
 * Claude on the author's behalf, phase 0 verified it on the author's Claude
 * Code login, and a key that happens to be in the launching shell — a dev
 * `.env`, an exported variable from some other project — would otherwise
 * silently take precedence and bill a different account (§7). A user who
 * wants a key can still set one through Claude Code's own settings
 * (`apiKeyHelper`, `env`), which `settingSources` loads.
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

const PLACEMENT_DOC =
  "With no after/before/appendTo it goes where an insert_blocks with no " +
  "placement would: after your agent block, or after your previous such " +
  "insert. A placement is resolved against the post as it is now, unless you " +
  "pass the stateHash of the read it came from — so name a block by its blk_ " +
  "id, which does not shift when the author types above it.";

const MATH_DOC =
  "Write an equation into the open post, live (like apply_ops: no proposal, " +
  "on the author's undo stack). latex is LaTeX without $ delimiters. By " +
  "default it is a displayed equation on a line of its own — the math block " +
  "apply_ops also takes. inline: true instead appends it to the end of the " +
  "text block named by id (a paragraph, heading, quote, summary or cell); to " +
  "put an equation mid-sentence, set_text that block with $latex$ where it " +
  "belongs. " +
  PLACEMENT_DOC;

const IMAGE_DOC =
  "Insert a picture into the open post, live. Exactly one of: path — a PNG, " +
  "JPEG, GIF, WebP or SVG file inside your working folder (relative to it, or " +
  "absolute within it; symlinks out of it are refused; at most 10 MB; the type " +
  "is checked by content), e.g. a plot you just saved with matplotlib — the " +
  "bytes are stored in the app's image store; or url — an http(s) image URL, " +
  "stored as given and loaded from there by every reader. SVG is sanitized " +
  "(scripts, event handlers and external references are removed). alt " +
  "describes the picture for a reader who cannot see it; caption, if given, " +
  "is shown under it as inline markdown. " +
  PLACEMENT_DOC;

const placementShape = {
  after: z.string().optional().describe("Place after this block"),
  before: z.string().optional().describe("Place before this block"),
  appendTo: z
    .string()
    .optional()
    .describe('Append inside this container, or "root" for the document'),
  stateHash: z
    .string()
    .optional()
    .describe("The stateHash of the read a path-style address (b3) came from"),
};

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
      tool(
        "insert_math",
        MATH_DOC,
        {
          latex: z.string().min(1).describe("LaTeX without $ delimiters"),
          inline: z
            .boolean()
            .optional()
            .describe("Append to the end of block `id`'s text instead of a line of its own"),
          id: z.string().optional().describe("With inline: the text block to append to"),
          ...placementShape,
        },
        call("insert_math"),
      ),
      tool(
        "insert_image",
        IMAGE_DOC,
        {
          path: z
            .string()
            .optional()
            .describe("A file inside your working folder, e.g. out/plot.png"),
          url: z.string().optional().describe("An http(s) image URL, stored as given"),
          alt: z.string().describe("What the picture shows, for a reader who cannot see it"),
          caption: z.string().optional().describe("Shown under the picture; inline markdown"),
          ...placementShape,
        },
        call("insert_image"),
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
  canUseTool,
  grants = () => [],
}) {
  // Whether the SDK has a `<sessionId>.jsonl` to resume. Set by the first
  // turn's init, so a first turn that failed before starting is retried as a
  // first turn rather than as a resume of nothing.
  let hasTranscript = resume;
  /** The running turn, or null. One at a time. */
  let current = null;

  /**
   * One turn. `gate`, when given, runs first and may decline the turn — the
   * resume confirmation (`agentIpc.js`). The turn counts as running from the
   * moment `send` answers, gate included, so a second send is refused and an
   * interrupt reaches it.
   */
  function send(prompt, context, { gate } = {}) {
    if (current) {
      return { ok: false, error: "The agent is still working on the last prompt." };
    }
    const abortController = new AbortController();
    const turn = { run: null, abortController, interrupted: false };
    current = turn;

    void (async () => {
      try {
        if (gate && !(await gate(abortController.signal))) return;
        if (turn.interrupted || abortController.signal.aborted) return;
        turn.run = query({ prompt, options: turnOptions(context, abortController) });
        for await (const message of turn.run) {
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

  function turnOptions(context, abortController) {
    const docTools = DOC_TOOLS.map((name) => `mcp__${DOC_SERVER}__${name}`);
    const { allowedRules, permissionMode } = grantsToOptions(grants());
    const tools = canUseTool
      ? {
        tools: { type: "preset", preset: "claude_code" },
        // The doc tools are *not* listed here: a bare allowedTools entry
        // shadows `canUseTool` (the SDK warns, CLAUDE_SDK_CAN_USE_TOOL_SHADOWED,
        // every turn), and `canUseTool` allows them anyway, keyed on the
        // server's `sdk` source rather than on the name.
        allowedTools: allowedRules,
        disallowedTools: ["AskUserQuestion"],
        permissionMode,
        settingSources: ["user", "project", "local"],
        canUseTool,
      }
      : {
        tools: [],
        allowedTools: docTools,
        permissionMode: "dontAsk",
        settingSources: [],
      };
    return {
      cwd,
      ...(hasTranscript ? { resume: sessionId } : { sessionId }),
      abortController,
      ...tools,
      mcpServers: { [DOC_SERVER]: docServer(executeTool) },
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: buildSystemPrompt(context),
      },
      env: agentEnv(process.env),
      ...(pathToClaudeCodeExecutable ? { pathToClaudeCodeExecutable } : {}),
      stderr: (data) => log(`agent ${sessionId}: ${String(data).trimEnd()}`),
    };
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
      current.run?.interrupt().catch(() => {});
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
