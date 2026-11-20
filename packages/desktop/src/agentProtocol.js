/**
 * The pure half of an agent session (docs/plans/agent-block.md §4.1, §4.5):
 * what the renderer is told about the SDK's stream, and what the model is told
 * about the post. No SDK import, no schema import, no `electron` — so the specs
 * run without the generated doc-schema bundle and without a `claude` binary.
 */

import os from "node:os";
import { summarizeToolInput } from "./agentPermissions.js";
import { buildTerminalEnv } from "./terminal.js";

/** The in-process MCP server's name, and so the `mcp__doc__*` tool prefix. */
export const DOC_SERVER = "doc";

/**
 * The doc tools this phase defines. Main owns the names and the schemas; the
 * renderer owns what they do (`packages/editor/src/utils/agentDocTools.ts`,
 * `AGENT_DOC_TOOLS`). A call for anything not listed here never crosses the
 * bridge.
 */
export const DOC_TOOLS = [
  "outline",
  "read_blocks",
  "apply_ops",
  "insert_math",
  "insert_image",
  "draw_sketch",
  "plot_graph",
];

/** How long a tool call may wait on the renderer before the agent hears it failed. */
export const TOOL_TIMEOUT_MS = 30_000;

/**
 * The tools that do more than edit the tree, and so get longer. The renderer's
 * answer covers the whole of the work: an upload for `insert_image`; for
 * `draw_sketch` loading Excalidraw (and mermaid, the first time), converting,
 * exporting with fonts inlined, and the upload; for `plot_graph` starting
 * the hidden GeoGebra applet (about 0.6 s from local files the first time,
 * measured in agent-block.md §12), the commands, the export and the upload.
 */
export const TOOL_TIMEOUTS_MS = {
  insert_image: 60_000,
  draw_sketch: 120_000,
  plot_graph: 90_000,
};

/** The timeout for one call to `name`. */
export const toolTimeoutMs = (name) =>
  Object.hasOwn(TOOL_TIMEOUTS_MS, name) ? TOOL_TIMEOUTS_MS[name] : TOOL_TIMEOUT_MS;

/** Caps on what the renderer's context may put in front of the model. */
export const CONTEXT_LIMITS = {
  title: 300,
  blockId: 64,
  outline: 24_000,
  selection: 4_000,
  prompt: 20_000,
};

const PREVIEW = 300;

const clip = (value, limit) => {
  const text = typeof value === "string" ? value : "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

/**
 * The renderer's context, reduced to capped strings.
 *
 * It arrives over IPC from a renderer that displays stored SVG, so it is
 * treated as untrusted text: every field is coerced and capped, and none of it
 * ever reaches anything but the model's system prompt.
 */
export function sanitizeContext(context) {
  const raw = context && typeof context === "object" ? context : {};
  let selection = "";
  if (raw.selection && typeof raw.selection === "object") {
    try {
      selection = clip(JSON.stringify(raw.selection), CONTEXT_LIMITS.selection);
    } catch {
      selection = "";
    }
  }
  return {
    title: clip(raw.title, CONTEXT_LIMITS.title).replace(/\s+/g, " ").trim(),
    blockId: /^blk_[a-z0-9]{1,40}$/.test(raw.blockId ?? "") ? raw.blockId : "",
    outline: clip(raw.outline, CONTEXT_LIMITS.outline),
    selection,
  };
}

/**
 * §4.5, generated per turn: short, and about the one thing the model cannot
 * infer — that it is writing into a document someone is typing in.
 */
export function buildSystemPrompt(context) {
  const { title, blockId, outline, selection } = sanitizeContext(context);
  const lines = [
    `You are working inside the blog post "${title || "Untitled"}", in the ` +
      "author's desktop app. The author types into this document while you " +
      "work.",
    "Your output goes into the post through the doc tools (mcp__doc__outline, " +
      "mcp__doc__read_blocks, mcp__doc__apply_ops, mcp__doc__insert_math, " +
      "mcp__doc__insert_image, mcp__doc__draw_sketch, mcp__doc__plot_graph) — " +
      "prefer them over " +
      "replying in prose. Text you " +
      "reply with goes into a log the author sees in your block, not into the " +
      "post, so keep replies to a sentence or two.",
    "For a diagram — boxes and arrows, a flow, an architecture, a sequence — " +
      "use draw_sketch: mermaid when it is a graph (it lays itself out), " +
      "shapes when the placement matters. It becomes a sketch the author can " +
      "edit afterwards, which a picture of a diagram is not.",
    "For a function, curve or geometric construction — y = sin(x), a " +
      "parabola with a slider, a triangle and its circumcircle — use " +
      "plot_graph with GeoGebra commands. It becomes a graph the author can " +
      "open and change in GeoGebra. For a chart or a plot of data (bars, " +
      "scatter, anything read from a file), write it to a PNG or SVG file in " +
      "your working folder with a script, then insert it with insert_image " +
      "{ path }.",
    "Your writes are live: they land in the open editor, on the author's undo " +
      "stack, and are saved like their typing. There is no review step, so " +
      "change only what you were asked to.",
    "You also have Claude Code's own tools in your working folder (shell, " +
      "files, web). The author approves each call that needs it from a card " +
      "in your block; a denied call is their answer — do not retry it or work " +
      "around it.",
  ];
  if (blockId) {
    lines.push(
      `Your own block in the post is ${blockId}. It is the author's: never ` +
        "edit, move or delete it. Blocks you insert with no placement go after " +
        "it, in order.",
    );
  }
  lines.push(
    "If a write is refused as stale, the author edited the post since your " +
      "read: re-run outline and rebuild your ops against the new addresses.",
  );
  if (selection) {
    lines.push(
      `When the author added your block they had this selected (addresses as ` +
        `in the outline): ${selection}`,
    );
  }
  if (outline) lines.push(`The post right now:\n${outline}`);
  return lines.join("\n\n");
}

/**
 * One line saying what a tool call asked for, without its payload: the ops of
 * a doc-tool call, the command or file of a built-in one (phase 2).
 */
export function describeToolCall(name, input) {
  const args = input && typeof input === "object" ? input : {};
  if (!String(name).startsWith("mcp__doc__")) return clip(summarizeToolInput(String(name), input), 160);
  const short = String(name).replace(/^mcp__doc__/, "");
  if (short === "read_blocks" && Array.isArray(args.blocks)) {
    return clip(args.blocks.join(", "), 120);
  }
  if (short === "insert_math" && typeof args.latex === "string") {
    return clip(`${args.inline ? "inline " : ""}${args.latex}`, 120);
  }
  if (short === "insert_image") {
    const source = typeof args.path === "string" ? args.path : args.url;
    return typeof source === "string" ? clip(source, 120) : "";
  }
  if (short === "draw_sketch") {
    if (typeof args.mermaid === "string") {
      const first = args.mermaid.trim().split("\n")[0] ?? "";
      return clip(`mermaid · ${first}`, 120);
    }
    if (Array.isArray(args.shapes)) {
      return `${args.shapes.length} shape${args.shapes.length === 1 ? "" : "s"}`;
    }
    return "";
  }
  if (short === "plot_graph" && Array.isArray(args.commands)) {
    const n = args.commands.length;
    const first = typeof args.commands[0] === "string" ? ` · ${args.commands[0]}` : "";
    return clip(`${n} command${n === 1 ? "" : "s"}${first}`, 120);
  }
  if (short === "apply_ops" && Array.isArray(args.ops)) {
    const counts = new Map();
    for (const op of args.ops) {
      const kind = op && typeof op.op === "string" ? op.op : "op";
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return [...counts].map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind)).join(", ");
  }
  return "";
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * The SDK message stream, projected onto what a block can show.
 *
 * Unrecognised messages return `null` and are dropped: the SDK adds message
 * types often (there are three dozen), and passing them through would make
 * the renderer's contract whatever this SDK version emits. Tool inputs never
 * cross whole — a name and a one-line description of what it asked for.
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
      const uses = content.filter((block) => block.type === "tool_use");
      if (!text && uses.length === 0) return null;
      return {
        type: "assistant",
        text,
        toolUses: uses.map((block) => block.name),
        toolCalls: uses.map((block) => ({
          name: block.name,
          detail: describeToolCall(block.name, block.input),
        })),
      };
    }
    case "user": {
      if (message.parent_tool_use_id) return null;
      const content = message.message?.content;
      if (!Array.isArray(content)) return null;
      const results = content.filter((block) => block?.type === "tool_result");
      if (results.length === 0) return null;
      const failed = results.find((block) => block.is_error);
      return {
        type: "tool-result",
        isError: Boolean(failed),
        preview: clip(resultText((failed ?? results[results.length - 1]).content), PREVIEW),
      };
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

/**
 * The SDK child's environment: the terminal's rule (open, minus
 * `ELECTRON_RUN_AS_NODE`, plus `~/.local/bin` on `PATH`), minus
 * `ANTHROPIC_API_KEY` — see `agent.js`'s file comment. Passing `env` *replaces* the
 * child's environment in the SDK, so this is the whole thing, not a delta.
 *
 * @param {Record<string, string | undefined> | undefined} parentEnv
 * @param {string} [home]
 * @returns {Record<string, string>}
 */
export function agentEnv(parentEnv, home = os.homedir()) {
  const env = {
    ...buildTerminalEnv(parentEnv, { home }),
    CLAUDE_AGENT_SDK_CLIENT_APP: "blog-desktop/0.0.0",
  };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

