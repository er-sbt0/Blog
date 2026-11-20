/**
 * The renderer's view of the Electron shell (docs/plans/in-app-terminal.md
 * §2.1).
 *
 * **This is the first privileged renderer API this application has ever had.**
 * The window is created with `contextIsolation: true`, `nodeIntegration: false`
 * and — until this feature — no preload script at all, and two places in the
 * shell are written around that absence and say so (`pdf.js`, `menu.js`). §2.1
 * states the cost plainly: after this lands, adding the next capability is an
 * argument about that capability rather than about whether the shell has a
 * bridge at all.
 *
 * What keeps it narrow is §4.1 rather than luck. The child's argv is fixed in
 * the main process, so there is no `spawn` here; the session is created by the
 * main process, so there is no session id to name. The renderer's whole
 * vocabulary is *write these bytes to the session that exists*, *resize it*,
 * *subscribe*, *restart it*.
 *
 * Import-free on purpose, like `lib/desktop.ts` and `lib/blobPath.ts`: this is
 * the declaration of a boundary, and a boundary that drags a module graph
 * behind it cannot be read on its own.
 */

/**
 * Whether a terminal can be started, and what is standing in the way when it
 * cannot.
 *
 * A discriminated union rather than a bag of optionals because the two answers
 * lead to two different renderings and neither has the other's fields: a
 * running session has a command and a cwd, and a missing binary has the list of
 * places that were looked in. `TerminalView` names that list in its empty state
 * — §4.5 chose an explained empty state over an absent view, and "we looked
 * here and here" is the part that makes it an explanation rather than a notice.
 */
export type TerminalStatus =
  | { available: true; running: boolean; command: string; cwd: string }
  | { available: false; reason: "no-binary"; searched: string[] };

/** What a session emits when the child is gone. */
export interface TerminalExit {
  code: number | null;
  signal: number | null;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * The one session this window has (§4.7).
 *
 * `start` is idempotent from the renderer's side — it returns the status of the
 * session that exists, having created one if there was none — which is what
 * lets the view be unmounted and remounted (switching to Outline and back)
 * without killing a turn in flight.
 */
export interface DesktopTerminal {
  status(): Promise<TerminalStatus>;
  start(size: TerminalSize): Promise<TerminalStatus>;
  restart(size: TerminalSize): Promise<TerminalStatus>;
  write(data: string): void;
  resize(size: TerminalSize): void;
  /** Subscribe to output. Returns the unsubscribe. */
  onData(cb: (chunk: string) => void): () => void;
  /** Subscribe to the child's death. Returns the unsubscribe. */
  onExit(cb: (info: TerminalExit) => void): () => void;
}

/** The answer to a sync. Never a rejection — a failure carries ssh's message. */
export type SessionSyncResult =
  | { ok: true; derived: number }
  | { ok: false; error: string };

/** Bytes read so far in one host's sync. */
export interface SessionSyncProgress {
  hostId: string;
  done: number;
  total: number;
}

/**
 * Remote Claude Code sessions (docs/plans/remote-claude.md §4.2). The renderer
 * names a host by **id** — one the author already added — and the main process
 * reads the alias from the server and validates it again, so nothing here can
 * name a new ssh destination.
 */
export interface DesktopSessions {
  sync(hostId: string): Promise<SessionSyncResult>;
  /** Subscribe to every host's progress. Returns the unsubscribe. */
  onProgress(cb: (progress: SessionSyncProgress) => void): () => void;
}

/**
 * What starting an agent session answers. The folder is chosen in a
 * main-process dialog and only handed back for display
 * (docs/plans/archive/agent-block.md §4.3); `cancelled` is the author dismissing it.
 */
export type AgentStartResult =
  | { ok: true; sessionId: string; cwd: string }
  | { ok: false; error: string; cancelled?: boolean };

export type AgentSendResult = { ok: true } | { ok: false; error: string };

/** An answer to a permission card (docs/plans/archive/agent-block.md phase 2). */
export type AgentPermissionDecision = "allow" | "always" | "deny";

/**
 * Text the block hands main for §4.5's system prompt. Never a path, an argv
 * element or an environment: main caps every field and only ever puts them in
 * front of the model.
 */
export interface AgentTurnContext {
  title: string;
  blockId: string;
  outline: string;
  selection: unknown;
}

/**
 * A session's events: a narrow projection of the SDK's message stream, made in
 * `packages/desktop/src/agentProtocol.js` (`project`). Never a raw SDK message.
 * Mirrored by `AgentSessionEvent` in the editor package, which this has to stay
 * assignable to — `src/lib/agentHost.ts` is where the compiler checks it.
 */
export type AgentEvent = { sessionId: string } & (
  | {
    type: "init";
    model: string;
    apiKeySource: string;
    claudeCodeVersion: string;
    tools: string[];
  }
  | {
    type: "assistant";
    text: string;
    toolUses: string[];
    toolCalls: { name: string; detail: string }[];
  }
  | { type: "tool-result"; isError: boolean; preview: string }
  | {
    type: "result";
    subtype: string;
    isError: boolean;
    turns: number;
    costUsd: number;
  }
  | { type: "error"; message: string }
  | {
    type: "permission";
    requestId: string;
    kind: "tool" | "resume";
    tool: string;
    title: string;
    summary: string;
    detail: string;
    reason: string;
    blockedPath: string;
    defaultToNo: boolean;
    label: string;
    /** What "always" would grant, or `null` when the card does not offer it. */
    always: string[] | null;
    expiresInMs: number;
  }
  | {
    type: "permission-resolved";
    requestId: string;
    decision: AgentPermissionDecision;
    reason: "answered" | "expired" | "interrupted" | "closed" | "cancelled";
    label: string;
  }
  | { type: "grants"; grants: string[] }
  | { type: "turn-end" }
);

/**
 * The SDK's `<sessionId>.jsonl`, as text. `truncated` when it was over main's
 * cap and only its start was read; `size` is the whole file's.
 */
export type AgentTranscriptResult =
  | { ok: true; text: string; size: number; truncated: boolean }
  | { ok: false; error: string };

/** A doc-tool call main forwards for the renderer to run on the live editor. */
export interface AgentToolCall {
  callId: string;
  sessionId: string;
  name: string;
  input: unknown;
}

/**
 * Claude Agent SDK sessions (docs/plans/archive/agent-block.md §4.3). The renderer
 * sends prompts and text context and nothing else — no cwd, argv or
 * environment — and answers the doc-tool calls main forwards to it. Ids are
 * minted in main and checked against the window that owns them.
 */
export interface DesktopAgent {
  start(options: { prompt: string; context: AgentTurnContext }): Promise<AgentStartResult>;
  /**
   * `grants` are the "always" rules the block still shows. Main only ever
   * narrows its own record to them; it never applies one it did not record.
   */
  send(
    sessionId: string,
    options: { prompt: string; context: AgentTurnContext; grants: string[] },
  ): Promise<AgentSendResult>;
  interrupt(sessionId: string): Promise<boolean>;
  /**
   * The session's whole transcript, read in main from its own record of the
   * session's folder (docs/plans/archive/agent-block.md phase 6). Absent on a
   * shell from before it.
   */
  transcript?(sessionId: string): Promise<AgentTranscriptResult>;
  /** Subscribe to one session's events. Returns the unsubscribe. */
  onEvent(sessionId: string, cb: (event: AgentEvent) => void): () => void;
  /** Subscribe to doc-tool calls for every session this window owns. */
  onToolCall(cb: (call: AgentToolCall) => void): () => void;
  toolResult(callId: string, result: unknown): void;
  /** Answer a `permission` event's card. Main checks the id, owner and choice. */
  answerPermission(requestId: string, decision: AgentPermissionDecision): void;
}

export interface DesktopBridge {
  terminal: DesktopTerminal;
  sessions: DesktopSessions;
  agent: DesktopAgent;
}

declare global {
  interface Window {
    /**
     * Injected by the shell's preload script. Optional in the type because it
     * genuinely is absent everywhere but the Electron build — see
     * {@link getDesktopBridge}.
     */
    desktop?: DesktopBridge;
  }
}

/**
 * The bridge, or `null` when there is none.
 *
 * `null` rather than a throw, and rather than a non-optional global, so that
 * **every call site has to answer for its absence**. A bridge that is assumed
 * present is a `TypeError` during render, which in a React tree is a white
 * screen — and it would be a white screen on the *VPS* build, where nothing
 * about the feature is supposed to exist at all.
 *
 * The `typeof window` guard is not defensive dressing: this module is imported
 * by client components that Next still renders on the server, and the desktop
 * build runs a real Next server in the shell's child process, so the
 * server-side pass happens there too.
 *
 * Not memoized. The preload runs before any page script, so the answer is
 * constant for the window's lifetime — but it is constant *after mount*, and
 * the server pass answers `null`. Callers that render from it must therefore
 * read it in an effect rather than during render, or they are rendering
 * something the SSR pass did not (docs/guides/hydration.md).
 */
export const getDesktopBridge = (): DesktopBridge | null => {
  if (typeof window === "undefined") return null;
  return window.desktop ?? null;
};
