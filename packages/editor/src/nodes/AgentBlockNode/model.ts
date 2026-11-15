/**
 * The `/agent` block's data, and the pure rules over it
 * (docs/plans/agent-block.md §3.3).
 *
 * Import-free apart from types, like `dragGeometry.ts`: what the block stores,
 * how a stored value is read back, how a session's events become log entries
 * and how the log is capped are all decisions a spec can pin without mounting
 * an editor.
 *
 * ### What is stored, and what is not
 *
 * Stored on the node (and so in every revision): the session id, the folder it
 * runs in (for display — main keeps its own record, §4.3), the author's prompts,
 * a **capped** log and the outcome of the last turn. Not stored: the live
 * status (thinking / running a tool), which is meaningless once the window is
 * gone and would otherwise make every event a document change.
 *
 * The log is written once per turn, at the turn's end, not per event. A turn's
 * entries live in the block's component until then; that keeps a streaming
 * session from turning into a stream of autosaves and undo entries, which is the
 * notebook plan's §5 conflict answered on the write side. The full record is the
 * SDK's own `<sessionId>.jsonl`, never this.
 */
import type { CapturedSelection } from "@/lib/ai/selection";
import type { AgentSessionEvent } from "../../context/AgentHostContext";

export const AGENT_BLOCK_TYPE = "agent";

/** How the last turn ended. `idle` is a block that has never run. */
export type AgentOutcome = "idle" | "done" | "interrupted" | "error";

export type AgentLogKind = "text" | "tool" | "error" | "result";

export interface AgentLogEntry {
  /** 0-based index into `prompts`: which turn wrote it. */
  turn: number;
  kind: AgentLogKind;
  text: string;
}

export interface AgentBlockData {
  sessionId: string | null;
  cwd: string | null;
  prompts: string[];
  log: AgentLogEntry[];
  status: AgentOutcome;
  /** The selection captured when the block was inserted (§2.9). */
  context: CapturedSelection | null;
}

/** One log entry's text, at most. §3.3's "say 4 KB each". */
export const MAX_LOG_TEXT = 4096;
/** Entries kept per block; older ones go first. */
export const MAX_LOG_ENTRIES = 400;
/** A prompt longer than this is refused at the input, not truncated. */
export const MAX_PROMPT = 20_000;

const OUTCOMES: ReadonlySet<string> = new Set([
  "idle",
  "done",
  "interrupted",
  "error",
]);
const KINDS: ReadonlySet<string> = new Set(["text", "tool", "error", "result"]);

export const emptyAgentData = (): AgentBlockData => ({
  sessionId: null,
  cwd: null,
  prompts: [],
  log: [],
  status: "idle",
  context: null,
});

const clip = (text: string, limit = MAX_LOG_TEXT): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

/**
 * Read a stored node's fields, tolerating anything.
 *
 * A revision is old data the current code did not write, and an agent block in
 * one may come from a build with a different shape. Every field falls back
 * rather than throws: a block that cannot be read must still load, or the whole
 * post would not.
 */
export function readAgentData(json: Record<string, unknown>): AgentBlockData {
  const str = (value: unknown): string | null =>
    typeof value === "string" && value !== "" ? value : null;
  const prompts = Array.isArray(json.prompts)
    ? json.prompts.filter((p): p is string => typeof p === "string")
    : [];
  const log = Array.isArray(json.log)
    ? json.log.flatMap((raw): AgentLogEntry[] => {
      if (!raw || typeof raw !== "object") return [];
      const entry = raw as Record<string, unknown>;
      if (typeof entry.text !== "string") return [];
      const kind = typeof entry.kind === "string" && KINDS.has(entry.kind)
        ? (entry.kind as AgentLogKind)
        : "text";
      const turn = typeof entry.turn === "number" && entry.turn >= 0
        ? Math.floor(entry.turn)
        : 0;
      return [{ turn, kind, text: clip(entry.text) }];
    })
    : [];
  const status = typeof json.status === "string" && OUTCOMES.has(json.status)
    ? (json.status as AgentOutcome)
    : "idle";
  const context = json.context && typeof json.context === "object"
    ? (json.context as CapturedSelection)
    : null;
  return {
    sessionId: str(json.sessionId),
    cwd: str(json.cwd),
    prompts,
    log: log.slice(-MAX_LOG_ENTRIES),
    status,
    context,
  };
}

/** Append, cap each entry and keep the newest `MAX_LOG_ENTRIES`. */
export function appendLog(
  log: readonly AgentLogEntry[],
  entries: readonly AgentLogEntry[],
): AgentLogEntry[] {
  const next = [
    ...log,
    ...entries.map((entry) => ({ ...entry, text: clip(entry.text) })),
  ];
  return next.length > MAX_LOG_ENTRIES
    ? next.slice(next.length - MAX_LOG_ENTRIES)
    : next;
}

/** `mcp__doc__apply_ops` reads as `apply_ops`: the server name is ours, not news. */
export const displayToolName = (name: string): string =>
  name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");

/** The log entries one event contributes. Most contribute none. */
export function entriesForEvent(
  event: AgentSessionEvent,
  turn: number,
): AgentLogEntry[] {
  switch (event.type) {
    case "assistant": {
      const entries: AgentLogEntry[] = [];
      if (event.text.trim()) {
        entries.push({ turn, kind: "text", text: event.text.trim() });
      }
      for (const call of event.toolCalls ?? []) {
        const name = displayToolName(call.name);
        entries.push({
          turn,
          kind: "tool",
          text: call.detail ? `${name} · ${call.detail}` : name,
        });
      }
      return entries;
    }
    case "tool-result":
      // A successful result is already visible — it is the post changing, or
      // the next thing the agent says. A refusal is the one worth keeping.
      return event.isError
        ? [{ turn, kind: "error", text: event.preview || "The tool refused." }]
        : [];
    case "error":
      return [{ turn, kind: "error", text: event.message }];
    case "result":
      return event.isError
        ? [{ turn, kind: "error", text: `Stopped: ${event.subtype}` }]
        : [];
    default:
      return [];
  }
}

/** What the block shows while a turn runs. Never stored. */
export type AgentLiveStatus =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "thinking" }
  | { phase: "tool"; name: string };

export function nextLiveStatus(
  current: AgentLiveStatus,
  event: AgentSessionEvent,
): AgentLiveStatus {
  switch (event.type) {
    case "init":
    case "tool-result":
      return { phase: "thinking" };
    case "assistant": {
      const last = event.toolCalls?.[event.toolCalls.length - 1];
      return last
        ? { phase: "tool", name: displayToolName(last.name) }
        : { phase: "thinking" };
    }
    case "turn-end":
      return { phase: "idle" };
    default:
      return current;
  }
}

/** How a turn ended, from what it emitted and whether the author stopped it. */
export function outcomeOf(
  events: readonly AgentSessionEvent[],
  interrupted: boolean,
): AgentOutcome {
  if (interrupted) return "interrupted";
  const failed = events.some((event) =>
    event.type === "error" || (event.type === "result" && event.isError)
  );
  return failed ? "error" : "done";
}

/** The stored value, ready for `exportJSON`. Empty fields stay out of the JSON. */
export function serializeAgentData(
  data: AgentBlockData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    prompts: data.prompts,
    log: data.log,
    status: data.status,
  };
  if (data.sessionId) out.sessionId = data.sessionId;
  if (data.cwd) out.cwd = data.cwd;
  if (data.context) out.context = data.context;
  return out;
}
