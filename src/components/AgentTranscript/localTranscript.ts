/**
 * An `/agent` block's session transcript, as `TranscriptView` reads one
 * (docs/plans/archive/agent-block.md phase 6).
 *
 * The desktop shell reads the SDK's own `<sessionId>.jsonl` — main finds it
 * from its record of the session's folder, never from anything the page names
 * (`packages/desktop/src/agentTranscript.js`) — and hands back the text. This
 * turns that text into the same header and rows the remote-sessions viewer
 * renders, through the same parser (`parse.ts`), so the local file meets
 * exactly the rendering rule a synced one does: every byte a React text child
 * (`TranscriptEntry.test.tsx`).
 *
 * Import-free apart from types and the parser, so it is pinned by a spec.
 */
import { parseTranscript } from "@/lib/claudeSessions/parse";
import type { RemoteEntryRow, RemoteSessionDetail } from "@/lib/claudeSessions/types";
import type { TranscriptSource } from "@/components/RemoteSessions/TranscriptView";

export interface LocalTranscript {
  detail: RemoteSessionDetail;
  entries: RemoteEntryRow[];
  /** Lines that were not JSON — counted, never fatal (the format drifts). */
  unparseable: number;
}

/** What the shell answered with: the file's text, its size, and whether it was cut. */
export interface LocalTranscriptFile {
  sessionId: string;
  text: string;
  size: number;
  truncated: boolean;
}

/** A stand-in host for the header: there is no remote one, only this machine. */
const THIS_COMPUTER = {
  id: "local",
  alias: "",
  label: "This computer",
  lastSyncAt: null,
  lastError: null,
  createdAt: new Date(0).toISOString(),
};

export function localTranscript(file: LocalTranscriptFile): LocalTranscript {
  const parsed = parseTranscript(file.text, "");
  const { meta } = parsed;
  const entries: RemoteEntryRow[] = parsed.entries.map(
    ({ idx, kind, uuid, parentUuid, at, tool, body }) => ({
      idx,
      kind,
      uuid,
      parentUuid,
      at,
      tool,
      body,
    }),
  );
  const detail: RemoteSessionDetail = {
    id: file.sessionId,
    hostId: THIS_COMPUTER.id,
    path: `${file.sessionId}.jsonl`,
    projectDir: "",
    title: meta.title,
    // An empty project dir guesses "" — say nothing rather than a guess.
    cwd: meta.cwdGuessed ? null : meta.cwd,
    cwdGuessed: false,
    gitBranch: meta.gitBranch,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    goneAt: null,
    isSubagent: false,
    parentId: null,
    activeMs: meta.activeMs,
    userMsgs: meta.userMsgs,
    assistantMsgs: meta.assistantMsgs,
    toolCalls: meta.toolCalls,
    size: file.size,
    host: THIS_COMPUTER,
    firstPrompt: meta.firstPrompt,
    tools: meta.tools,
    entryCount: entries.length,
    // Subagent runs are files of their own, which this does not read; with
    // none listed, a Task result has no "Open subagent" link to follow.
    subagents: [],
    parent: null,
  };
  return { detail, entries, unparseable: parsed.unparseable };
}

/** A `TranscriptSource` over an already-parsed local transcript. */
export function localTranscriptSource(transcript: LocalTranscript): TranscriptSource {
  return {
    local: true,
    detail: async () => transcript.detail,
    entries: async (from, limit) => ({
      entries: transcript.entries.slice(Math.max(0, from), Math.max(0, from) + Math.max(0, limit)),
      total: transcript.entries.length,
    }),
  };
}
