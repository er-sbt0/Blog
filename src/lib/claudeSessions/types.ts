/**
 * The wire shapes of `/api/remote-sessions/*` reads (docs/plans/remote-claude.md
 * §4.6, §4.7). Dates are ISO strings, sizes are numbers. Import-free so both the
 * routes and the client components can name them.
 */
import type { EntryBody, EntryKind } from "./parse";

export interface RemoteHostSummary {
  id: string;
  alias: string;
  label: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

/** One transcript file — a session, or a subagent run under one. */
export interface RemoteSessionSummary {
  id: string;
  hostId: string;
  /** Relative to `~/.claude/projects`; the first segment is the project dir. */
  path: string;
  projectDir: string;
  title: string | null;
  cwd: string | null;
  cwdGuessed: boolean;
  gitBranch: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Set when the remote no longer has the file; the bytes are kept (§4.8). */
  goneAt: string | null;
  isSubagent: boolean;
  parentId: string | null;
  activeMs: number;
  userMsgs: number;
  assistantMsgs: number;
  toolCalls: number;
  size: number;
}

/** `GET /api/remote-sessions/sessions` — everything the sidebar tree needs. */
export interface RemoteSessionsTree {
  hosts: RemoteHostSummary[];
  sessions: RemoteSessionSummary[];
}

/** `GET /api/remote-sessions/sessions/[id]` — the transcript header. */
export interface RemoteSessionDetail extends RemoteSessionSummary {
  host: RemoteHostSummary;
  firstPrompt: string | null;
  tools: Record<string, number>;
  entryCount: number;
  /** Subagent runs under this session, keyed by agent id for "Open subagent". */
  subagents: { id: string; agentId: string | null; title: string | null }[];
  parent: { id: string; title: string | null } | null;
}

export interface RemoteEntryRow {
  idx: number;
  kind: EntryKind;
  uuid: string | null;
  parentUuid: string | null;
  at: string | null;
  tool: string | null;
  body: EntryBody;
}

/** `GET /api/remote-sessions/sessions/[id]/entries?from=&limit=` */
export interface RemoteEntriesPage {
  entries: RemoteEntryRow[];
  total: number;
}

/** `agent-a257325bf2fc2a3f5.jsonl` → `a257325bf2fc2a3f5`, matching a tool result's `agentId`. */
export function agentIdOf(path: string): string | null {
  return /\/subagents\/agent-([^/]+)\.jsonl$/.exec(path)?.[1] ?? null;
}
