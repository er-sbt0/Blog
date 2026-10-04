/**
 * The transcript viewer's logic, without React (docs/plans/remote-claude.md
 * §4.7): which rows a page of entries becomes, what a collapsed tool call says
 * about itself, how a result pairs with its call, the Edit diff, prompt
 * navigation and find-in-session.
 *
 * Import-free (type imports are erased), like `SideBar/dragGeometry.ts`, so
 * every rule here is pinned by a plain spec without mounting anything.
 */
import type { RemoteEntryRow } from "@/lib/claudeSessions/types";

/** Results longer than this are clipped behind "Show all" (`transcript.py`). */
export const RESULT_CLIP_LINES = 200;

/** A collapsed tool line never runs longer than this. */
export const SUMMARY_MAX = 160;

type ToolUseBody = { id: string; name: string; input: unknown };
type ToolResultBody = {
  toolUseId: string;
  content: string;
  isError: boolean;
  agentId?: string;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const toolUseBody = (entry: RemoteEntryRow): ToolUseBody | null =>
  entry.kind === "tool_use" && isObj(entry.body) && "input" in entry.body
    ? (entry.body as ToolUseBody)
    : null;

export const toolResultBody = (entry: RemoteEntryRow): ToolResultBody | null =>
  entry.kind === "tool_result" && isObj(entry.body) && "toolUseId" in entry.body
    ? (entry.body as ToolResultBody)
    : null;

/** The text of a prompt / assistant / thinking / meta entry, or "". */
export const entryText = (entry: RemoteEntryRow): string => {
  const body = entry.body as Record<string, unknown>;
  return typeof body?.text === "string" ? body.text : "";
};

const oneLine = (s: string): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > SUMMARY_MAX ? `${flat.slice(0, SUMMARY_MAX - 1)}…` : flat;
};

/** Which input field names a tool call, per tool. */
const SUMMARY_FIELD: Record<string, string[]> = {
  Bash: ["command"],
  Read: ["file_path"],
  Write: ["file_path"],
  Edit: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path", "file_path"],
  Grep: ["pattern"],
  Glob: ["pattern"],
  Agent: ["description", "prompt"],
  Task: ["description", "prompt"],
  WebFetch: ["url"],
  WebSearch: ["query"],
};

/**
 * One line for a collapsed tool call: Bash → command, Read/Write/Edit →
 * file_path, Grep/Glob → pattern, Agent/Task → description, else the first
 * string input. Whitespace is flattened so a multi-line command stays one line.
 */
export function toolSummary(name: string, input: unknown): string {
  if (!isObj(input)) return typeof input === "string" ? oneLine(input) : "";
  for (const field of SUMMARY_FIELD[name] ?? []) {
    const v = input[field];
    if (typeof v === "string" && v.trim()) return oneLine(v);
  }
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.trim()) return oneLine(v);
  }
  return "";
}

/** The number of lines a result would show. An empty result is 0, not 1. */
export const lineCount = (text: string): number =>
  text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;

export interface ClippedText {
  text: string;
  clipped: boolean;
  total: number;
}

export function clipLines(text: string, max = RESULT_CLIP_LINES): ClippedText {
  const lines = text.split("\n");
  if (lines.length <= max) return { text, clipped: false, total: lines.length };
  return { text: lines.slice(0, max).join("\n"), clipped: true, total: lines.length };
}

// ─── Rows ──────────────────────────────────────────────────────────────────

/**
 * One row of the rendered transcript: an entry, and — for a tool call — the
 * result that answered it, when that result has been loaded.
 */
export interface TranscriptRow {
  entry: RemoteEntryRow;
  result?: RemoteEntryRow;
}

export interface RowOptions {
  showThinking: boolean;
  showMeta: boolean;
}

/**
 * Entries → rows. A tool result whose call is among the loaded entries folds
 * into that call's row; one whose call is not (an orphan) stays a row of its
 * own rather than vanishing. Thinking and meta are dropped unless asked for.
 */
export function buildRows(
  entries: readonly RemoteEntryRow[],
  { showThinking, showMeta }: RowOptions,
): TranscriptRow[] {
  const callIds = new Set<string>();
  for (const e of entries) {
    const use = toolUseBody(e);
    if (use?.id) callIds.add(use.id);
  }
  const resultFor = new Map<string, RemoteEntryRow>();
  for (const e of entries) {
    const res = toolResultBody(e);
    if (res && callIds.has(res.toolUseId) && !resultFor.has(res.toolUseId)) {
      resultFor.set(res.toolUseId, e);
    }
  }

  const rows: TranscriptRow[] = [];
  for (const e of entries) {
    if (e.kind === "thinking" && !showThinking) continue;
    if (e.kind === "meta" && !showMeta) continue;
    const res = toolResultBody(e);
    if (res && resultFor.get(res.toolUseId) === e) continue;
    const use = toolUseBody(e);
    rows.push(use?.id && resultFor.has(use.id) ? { entry: e, result: resultFor.get(use.id) } : { entry: e });
  }
  return rows;
}

/** Row positions that start a turn — prompts and slash commands — for n / p. */
export function promptRowIndices(rows: readonly TranscriptRow[]): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (r.entry.kind === "prompt" || r.entry.kind === "command") out.push(i);
  });
  return out;
}

/**
 * The next (`dir = 1`) or previous (`dir = -1`) position in `indices` strictly
 * past `current`, or `null` at the end. `current` need not be in the list.
 */
export function stepIndex(
  indices: readonly number[],
  current: number,
  dir: 1 | -1,
): number | null {
  if (dir === 1) return indices.find((i) => i > current) ?? null;
  for (let k = indices.length - 1; k >= 0; k--) {
    if (indices[k] < current) return indices[k];
  }
  return null;
}

/** Everything a reader could find in a row, lower-cased. */
export function rowSearchText(row: TranscriptRow): string {
  const { entry, result } = row;
  const parts: string[] = [];
  const use = toolUseBody(entry);
  const res = toolResultBody(entry);
  if (use) {
    parts.push(use.name, JSON.stringify(use.input ?? null));
  } else if (res) {
    parts.push(res.content);
  } else if (entry.kind === "command") {
    const b = entry.body as { name?: string; args?: string };
    parts.push(b.name ?? "", b.args ?? "");
  } else {
    parts.push(entryText(entry));
  }
  if (result) parts.push(toolResultBody(result)?.content ?? "");
  return parts.join("\n").toLowerCase();
}

/** Row positions containing `query`, case-insensitively. Empty query → none. */
export function findRows(rows: readonly TranscriptRow[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (rowSearchText(r).includes(q)) out.push(i);
  });
  return out;
}

/** An Agent/Task result's subagent transcript, if this session has it. */
export function subagentFor<T extends { id: string; agentId: string | null }>(
  agentId: string | undefined,
  subagents: readonly T[],
): T | null {
  if (!agentId) return null;
  return subagents.find((s) => s.agentId === agentId) ?? null;
}

// ─── Edit diff ─────────────────────────────────────────────────────────────

export interface DiffLine {
  op: " " | "-" | "+";
  text: string;
}

/** Past this many cells the LCS table is not worth it; show remove-then-add. */
const LCS_CELL_CAP = 2_000_000;

/**
 * A line diff of `before` → `after` by longest common subsequence. Good enough
 * for an Edit's `old_string`/`new_string`, which are usually a few lines; a
 * pair too large for the table degrades to every old line removed and every
 * new line added, which is still correct, only less helpful.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > LCS_CELL_CAP) {
    return [
      ...a.map((text) => ({ op: "-" as const, text })),
      ...b.map((text) => ({ op: "+" as const, text })),
    ];
  }
  // lcs[i][j] = LCS length of a[i..] and b[j..], flattened.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j]
        ? lcs[(i + 1) * w + j + 1] + 1
        : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      out.push({ op: "-", text: a[i++] });
    } else {
      out.push({ op: "+", text: b[j++] });
    }
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

/**
 * The `old_string → new_string` pairs an Edit or MultiEdit input carries, or
 * `null` when the input is not that shape.
 */
export function editPairs(
  name: string,
  input: unknown,
): { before: string; after: string }[] | null {
  if (!isObj(input)) return null;
  const pair = (o: unknown) =>
    isObj(o) && typeof o.old_string === "string" && typeof o.new_string === "string"
      ? { before: o.old_string, after: o.new_string }
      : null;
  if (name === "Edit") {
    const p = pair(input);
    return p ? [p] : null;
  }
  if (name === "MultiEdit" && Array.isArray(input.edits)) {
    const pairs = input.edits.map(pair);
    return pairs.every((p) => p !== null) ? (pairs as { before: string; after: string }[]) : null;
  }
  return null;
}

// ─── Formatting ────────────────────────────────────────────────────────────

/** `3_725_000` → `"1h 2m"`; under a minute → `"<1m"`. */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
