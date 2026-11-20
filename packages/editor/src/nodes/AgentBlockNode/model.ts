/**
 * The `/agent` block's data, and the pure rules over it
 * (docs/plans/archive/agent-block.md §3.3).
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
 *
 * ### Permissions (phase 2)
 *
 * A card is live state too: it exists while main holds the question and is
 * never stored. Its *outcome* is — one `permission` log entry per card, at
 * the turn's end. The session's "always" grants are stored, **for display
 * only**: main keeps its own record and applies a grant only if both agree
 * (`packages/desktop/src/agentPermissions.js`), so a grant edited into a
 * revision shows a chip and does nothing.
 */
import type { CapturedSelection } from "@/lib/ai/selection";
import type {
  AgentPermissionDecision,
  AgentSessionEvent,
} from "../../context/AgentHostContext";

export const AGENT_BLOCK_TYPE = "agent";

/**
 * The tag on the block's own writes — prompt, session, log, outcome, grants —
 * alongside `historic` (`bookkeeping.ts`). Here rather than there so the
 * doc-tool executor can recognise them without importing the node.
 */
export const AGENT_BOOKKEEPING_TAG = "agent-bookkeeping";

/** How the last turn ended. `idle` is a block that has never run. */
export type AgentOutcome = "idle" | "done" | "interrupted" | "error";

export type AgentLogKind = "text" | "tool" | "error" | "result" | "permission";

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
  /** "Always for this session" grants, as main last reported them. Display only. */
  grants: string[];
  /** What the caps have cut from `log` so far (phase 6). Zeros when nothing. */
  dropped: AgentLogDropped;
}

/**
 * What the log's caps cost, so the block can say so instead of looking
 * complete (phase 6): entries pushed out by `MAX_LOG_ENTRIES`, oldest first,
 * and the UTF-8 bytes `MAX_LOG_TEXT` cut off the ends of the entries it kept.
 * The full record is the session's `.jsonl`, which the block links to.
 */
export interface AgentLogDropped {
  entries: number;
  bytes: number;
}

/** One log entry's text, at most. §3.3's "say 4 KB each". */
export const MAX_LOG_TEXT = 4096;
/** Entries kept per block; older ones go first. */
export const MAX_LOG_ENTRIES = 400;
/** A prompt longer than this is refused at the input, not truncated. */
export const MAX_PROMPT = 20_000;
/** Grants kept on a block; main's own cap is the same (`MAX_GRANTS`). */
export const MAX_GRANTS = 50;
/** The grant that is a mode, not a rule (`ACCEPT_EDITS` in main). */
export const ACCEPT_EDITS = "@acceptEdits";

const OUTCOMES: ReadonlySet<string> = new Set([
  "idle",
  "done",
  "interrupted",
  "error",
]);
const KINDS: ReadonlySet<string> = new Set([
  "text",
  "tool",
  "error",
  "result",
  "permission",
]);

export const emptyAgentData = (): AgentBlockData => ({
  sessionId: null,
  cwd: null,
  prompts: [],
  log: [],
  status: "idle",
  context: null,
  grants: [],
  dropped: { entries: 0, bytes: 0 },
});

const clip = (text: string, limit = MAX_LOG_TEXT): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

/** UTF-8 bytes `clip` removes from `text`; 0 when it fits. */
const clippedBytes = (text: string, limit = MAX_LOG_TEXT): number =>
  text.length > limit ? new TextEncoder().encode(text.slice(limit - 1)).length : 0;

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

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
  const grants = Array.isArray(json.grants)
    ? [
      ...new Set(
        json.grants.filter((g): g is string =>
          typeof g === "string" && g !== "" && g.length <= 640
        ),
      ),
    ].slice(0, MAX_GRANTS)
    : [];
  const stored = json.dropped && typeof json.dropped === "object"
    ? json.dropped as Record<string, unknown>
    : {};
  const overflow = Math.max(0, log.length - MAX_LOG_ENTRIES);
  return {
    sessionId: str(json.sessionId),
    cwd: str(json.cwd),
    prompts,
    log: log.slice(-MAX_LOG_ENTRIES),
    status,
    context,
    grants,
    dropped: {
      entries: count(stored.entries) + overflow,
      bytes: count(stored.bytes),
    },
  };
}

/** How a grant reads on its chip. */
export const grantLabel = (grant: string): string =>
  grant === ACCEPT_EDITS ? "Edit files in the folder" : grant;

/** Append, cap each entry and keep the newest `MAX_LOG_ENTRIES`. */
export function appendLog(
  log: readonly AgentLogEntry[],
  entries: readonly AgentLogEntry[],
): AgentLogEntry[] {
  return appendCounted({ log, dropped: { entries: 0, bytes: 0 } }, entries).log;
}

/**
 * `appendLog`, counting what the caps cut into `dropped` — what the turn's
 * end writes, so the block's summary is exact rather than estimated.
 */
export function appendCounted(
  record: { log: readonly AgentLogEntry[]; dropped: AgentLogDropped },
  entries: readonly AgentLogEntry[],
): { log: AgentLogEntry[]; dropped: AgentLogDropped } {
  let bytes = record.dropped.bytes;
  const next = [
    ...record.log,
    ...entries.map((entry) => {
      bytes += clippedBytes(entry.text);
      return { ...entry, text: clip(entry.text) };
    }),
  ];
  const overflow = Math.max(0, next.length - MAX_LOG_ENTRIES);
  return {
    log: overflow ? next.slice(overflow) : next,
    dropped: { entries: record.dropped.entries + overflow, bytes },
  };
}

/** How many bytes reads, for the summary: "812 B", "12 KB", "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The line under the log that says what is not in it, or null when the log is
 * whole. Says where the rest is only when there is somewhere to send the
 * author (`hasTranscript`).
 */
export function droppedSummary(
  dropped: AgentLogDropped,
  hasTranscript: boolean,
): string | null {
  const parts: string[] = [];
  if (dropped.entries > 0) {
    parts.push(
      `${dropped.entries.toLocaleString()} earlier ${
        dropped.entries === 1 ? "entry" : "entries"
      }`,
    );
  }
  if (dropped.bytes > 0) {
    parts.push(`${formatBytes(dropped.bytes)} cut from long entries`);
  }
  if (parts.length === 0) return null;
  const tail = hasTranscript
    ? " — the full transcript has everything."
    : " — not kept in the post.";
  return `Not shown: ${parts.join(" and ")}${tail}`;
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
    case "permission-resolved":
      return [{
        turn,
        kind: "permission",
        text: event.label
          ? `${resolutionText(event.decision, event.reason)}: ${event.label}`
          : resolutionText(event.decision, event.reason),
      }];
    case "result":
      return event.isError
        ? [{ turn, kind: "error", text: `Stopped: ${event.subtype}` }]
        : [];
    default:
      return [];
  }
}

/** How a closed card reads, in the card and in the log. */
export function resolutionText(
  decision: AgentPermissionDecision,
  reason: Extract<AgentSessionEvent, { type: "permission-resolved" }>["reason"],
): string {
  if (decision === "allow") return "Allowed once";
  if (decision === "always") return "Always allowed";
  switch (reason) {
    case "expired":
      return "Denied — no answer in time";
    case "interrupted":
      return "Denied — you stopped the turn";
    case "closed":
      return "Denied — the window closed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Denied";
  }
}

type PermissionEvent = Extract<AgentSessionEvent, { type: "permission" }>;

/** A card in the block. Never stored; see the file comment. */
export type AgentPermissionCard =
  & Omit<PermissionEvent, "type" | "sessionId">
  & (
    | { state: "pending"; answering: boolean }
    | {
      state: "answered" | "expired";
      decision: AgentPermissionDecision;
      text: string;
    }
  );

/**
 * The cards after one event. A card opens on `permission` and closes on
 * `permission-resolved` — only main closes one, so a click that main ignored
 * (a stale id, the wrong window) leaves the card open rather than lying.
 */
export function applyCardEvent(
  cards: readonly AgentPermissionCard[],
  event: AgentSessionEvent,
): AgentPermissionCard[] {
  if (event.type === "permission") {
    if (cards.some((card) => card.requestId === event.requestId)) {
      return [...cards];
    }
    const { type: _type, sessionId: _sessionId, ...card } = event;
    return [...cards, { ...card, state: "pending", answering: false }];
  }
  if (event.type === "permission-resolved") {
    return cards.map((card) =>
      card.requestId === event.requestId
        ? {
          ...card,
          state: event.reason === "answered" ? "answered" : "expired",
          decision: event.decision,
          text: resolutionText(event.decision, event.reason),
        }
        : card
    );
  }
  return [...cards];
}

/** Mark a card as answered-but-not-yet-confirmed, so it cannot be clicked twice. */
export function markAnswering(
  cards: readonly AgentPermissionCard[],
  requestId: string,
): AgentPermissionCard[] {
  return cards.map((card) =>
    card.requestId === requestId && card.state === "pending"
      ? { ...card, answering: true }
      : card
  );
}

/** What the block shows while a turn runs. Never stored. */
export type AgentLiveStatus =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "thinking" }
  | { phase: "tool"; name: string }
  | { phase: "waiting" };

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
    case "permission":
      return { phase: "waiting" };
    case "turn-end":
      return { phase: "idle" };
    default:
      return current;
  }
}

/**
 * The status to show: "waiting on you" while any card is open, whatever the
 * stream last said (a second card can open while the first is answered).
 */
export function displayedStatus(
  live: AgentLiveStatus,
  cards: readonly AgentPermissionCard[],
): AgentLiveStatus {
  if (cards.some((card) => card.state === "pending")) return { phase: "waiting" };
  return live.phase === "waiting" ? { phase: "thinking" } : live;
}

/** How a turn ended, from what it emitted and whether the author stopped it. */
export function outcomeOf(
  events: readonly AgentSessionEvent[],
  interrupted: boolean,
): AgentOutcome {
  if (interrupted) return "interrupted";
  // A resume the author declined (or left unanswered) never ran: that is a
  // stop, not a failure.
  const resumes = new Set(
    events.flatMap((event) =>
      event.type === "permission" && event.kind === "resume"
        ? [event.requestId]
        : []
    ),
  );
  const declined = events.some((event) =>
    event.type === "permission-resolved" && resumes.has(event.requestId) &&
    event.decision === "deny"
  );
  if (declined) return "interrupted";
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
  if (data.grants.length) out.grants = data.grants;
  if (data.dropped.entries || data.dropped.bytes) out.dropped = data.dropped;
  return out;
}
