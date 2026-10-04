/**
 * A Claude Code transcript (JSONL) → the rows the viewer renders and the stats
 * the dashboard shows. docs/plans/remote-claude.md §2.5, §4.4, §4.10.
 *
 * Import-free, like `dragGeometry.ts`, so every rule below is pinned by a spec
 * over hand-written fixtures — never a real transcript, which is exactly where
 * credentials end up (§7 phase 2).
 *
 * The rules carried over from `claude_remote`'s `model.py`:
 *
 * - one API response is several `assistant` events sharing a `message.id`, so
 *   messages are counted by id, not by event;
 * - tool results arrive as `user` events whose blocks are all `tool_result`,
 *   and are not prompts;
 * - a slash command is `<command-name>`/`<command-args>` text; any other user
 *   text starting with `<` was injected, not typed;
 * - the project directory is a lossy encoding of the cwd, so the cwd comes from
 *   the events and a guess from the directory name is marked as one.
 *
 * And what the format grew since (§7.1): `custom-title` (a `/rename`) and
 * `ai-title` name the session, and `attachment`, `queue-operation`, `mode`,
 * `cost-state` and the rest are bookkeeping that never becomes a row.
 */

/**
 * Bump when the derived output changes. A file built with an older version is
 * re-derived from its stored chunks without fetching again (§4.4).
 */
export const PARSER_VERSION = 1;

/** Idle gaps longer than this do not count as active time (`model.py`). */
export const IDLE_GAP_MS = 5 * 60 * 1000;

/**
 * Searchable text is capped per entry. A tool result can be megabytes, and a
 * trigram index is two to three times the text it indexes (§6.1). The body
 * keeps everything; only search sees the cap.
 */
export const SEARCH_TEXT_CAP = 64 * 1024;

export type EntryKind =
  | "prompt"
  | "assistant"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "meta"
  | "command";

export type EntryBody =
  | { text: string } // prompt, assistant, thinking
  | { name: string; args: string } // command
  | { id: string; name: string; input: unknown } // tool_use
  | { toolUseId: string; content: string; isError: boolean; agentId?: string } // tool_result
  | { label: string; text: string }; // meta

export interface ParsedEntry {
  idx: number;
  kind: EntryKind;
  uuid: string | null;
  parentUuid: string | null;
  at: string | null;
  tool: string | null;
  body: EntryBody;
  text: string;
}

export interface SessionMeta {
  title: string | null;
  cwd: string | null;
  cwdGuessed: boolean;
  gitBranch: string | null;
  firstPrompt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  activeMs: number;
  userMsgs: number;
  assistantMsgs: number;
  toolCalls: number;
  tools: Record<string, number>;
  promptTimes: string[];
}

export interface ParsedTranscript {
  entries: ParsedEntry[];
  meta: SessionMeta;
  /** Lines that were not JSON. Counted, never fatal — the format drifts. */
  unparseable: number;
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * `-home-dev-llvm` → `/home/dev/llvm`. Lossy: `/`, `.` and `_` all became `-`,
 * so this is only ever shown marked as a guess.
 */
export function guessCwd(projectDir: string): string {
  return projectDir.replace(/-/g, "/");
}

const COMMAND_RE = /<command-name>([\s\S]*?)<\/command-name>/;
const ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;

/** The text of a content block list, with non-text blocks named rather than dropped. */
function blocksText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (!isObj(b)) return "";
      if (b.type === "text") return str(b.text) ?? "";
      if (b.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

const searchable = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join("\n").toLowerCase().slice(0, SEARCH_TEXT_CAP);

/**
 * Parses a whole transcript. `projectDir` is the first path segment under
 * `~/.claude/projects`, used only when no event names its cwd.
 */
export function parseTranscript(jsonl: string, projectDir: string): ParsedTranscript {
  const entries: ParsedEntry[] = [];
  const toolNames = new Map<string, string>();
  const messageIds = new Set<string>();
  const tools: Record<string, number> = {};
  const times: number[] = [];
  const promptTimes: string[] = [];
  let unparseable = 0;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let aiTitle: string | null = null;
  let customTitle: string | null = null;
  let firstPrompt: string | null = null;
  let userMsgs = 0;
  let toolCalls = 0;

  const push = (
    e: Json,
    kind: EntryKind,
    body: EntryBody,
    text: string,
    tool: string | null = null,
  ) => {
    entries.push({
      idx: entries.length,
      kind,
      uuid: str(e.uuid),
      parentUuid: str(e.parentUuid),
      at: str(e.timestamp),
      tool,
      body,
      text,
    });
  };

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      unparseable++;
      continue;
    }
    if (!isObj(e)) {
      unparseable++;
      continue;
    }

    if (e.type === "custom-title") customTitle = str(e.customTitle) ?? customTitle;
    if (e.type === "ai-title") aiTitle = str(e.aiTitle) ?? aiTitle;
    if (e.type !== "user" && e.type !== "assistant" && e.type !== "system") continue;

    cwd ??= str(e.cwd) || null;
    gitBranch = str(e.gitBranch) || gitBranch;
    const at = str(e.timestamp);
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isNaN(t)) times.push(t);

    if (e.type === "system") {
      const label = str(e.subtype) ?? "system";
      const text = str(e.content) ?? "";
      push(e, "meta", { label, text }, searchable(label, text));
      continue;
    }

    const message = isObj(e.message) ? e.message : {};
    const content = message.content;

    if (e.type === "assistant") {
      const id = str(message.id);
      if (id) messageIds.add(id);
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (!isObj(b)) continue;
        if (b.type === "text") {
          const text = str(b.text) ?? "";
          if (text) push(e, "assistant", { text }, searchable(text));
        } else if (b.type === "thinking") {
          const text = str(b.thinking) ?? "";
          if (text) push(e, "thinking", { text }, searchable(text));
        } else if (b.type === "tool_use") {
          const id = str(b.id) ?? "";
          const name = str(b.name) ?? "unknown";
          toolNames.set(id, name);
          toolCalls++;
          tools[name] = (tools[name] ?? 0) + 1;
          push(
            e,
            "tool_use",
            { id, name, input: b.input ?? null },
            searchable(name, JSON.stringify(b.input ?? null)),
            name,
          );
        }
      }
      continue;
    }

    // `user`: a tool result, a slash command, injected content, or a prompt.
    const blocks = Array.isArray(content) ? content.filter(isObj) : [];
    if (blocks.length > 0 && blocks.every((b) => b.type === "tool_result")) {
      const result = isObj(e.toolUseResult) ? e.toolUseResult : null;
      const agentId = result ? str(result.agentId) : null;
      for (const b of blocks) {
        const toolUseId = str(b.tool_use_id) ?? "";
        const name = toolNames.get(toolUseId) ?? null;
        const text = blocksText(b.content);
        const body: EntryBody = {
          toolUseId,
          content: text,
          isError: b.is_error === true,
          ...(agentId ? { agentId } : {}),
        };
        push(e, "tool_result", body, searchable(text), name);
      }
      continue;
    }

    const text = blocksText(content);
    if (!text) continue;
    const command = COMMAND_RE.exec(text);
    if (command) {
      const name = command[1].trim();
      const args = ARGS_RE.exec(text)?.[1].trim() ?? "";
      userMsgs++;
      if (at) promptTimes.push(at);
      push(e, "command", { name, args }, searchable(name, args));
    } else if (e.isMeta === true || text.trimStart().startsWith("<")) {
      const label = /^\s*<([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "meta";
      push(e, "meta", { label, text }, searchable(text));
    } else {
      userMsgs++;
      if (at) promptTimes.push(at);
      firstPrompt ??= text;
      push(e, "prompt", { text }, searchable(text));
    }
  }

  times.sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap <= IDLE_GAP_MS) activeMs += gap;
  }

  const title =
    customTitle ?? aiTitle ?? (firstPrompt ? firstPrompt.split("\n")[0].slice(0, 120) : null);

  return {
    entries,
    unparseable,
    meta: {
      title,
      cwd: cwd ?? guessCwd(projectDir),
      cwdGuessed: cwd === null,
      gitBranch,
      firstPrompt: firstPrompt ? firstPrompt.slice(0, 2000) : null,
      startedAt: times.length ? new Date(times[0]).toISOString() : null,
      endedAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
      activeMs,
      userMsgs,
      assistantMsgs: messageIds.size,
      toolCalls,
      tools,
      promptTimes,
    },
  };
}
