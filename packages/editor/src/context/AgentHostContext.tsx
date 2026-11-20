"use client";
import { createContext, type ReactNode, useContext } from "react";
import type { LexicalEditor, NodeKey } from "lexical";
import type { CapturedSelection } from "@/lib/ai/selection";

/**
 * What an `/agent` block needs from whatever is hosting the editor
 * (docs/plans/archive/agent-block.md §4.3, §4.4).
 *
 * The editor package cannot import the desktop bridge — `src/lib/desktopBridge`
 * is app code, and the package's whole seam (haklex-adoption.md §4) is that
 * nothing under `packages/editor` reaches back into `src/` for behaviour. So the
 * capability is **injected**: the app builds one of these from
 * `window.desktop.agent` and provides it above each editor it mounts, and the
 * editor learns that agents exist *only* by finding one here. On the VPS build,
 * in a browser, and in every test there is no provider, `useAgentHost()` is
 * `null`, `/agent` is not offered, and a stored agent block renders read-only.
 *
 * The shape is deliberately the bridge's, minus what a block cannot use: there
 * is no cwd anywhere in it. The folder is chosen in the main process when
 * `start` runs and comes back only for display — a script in the renderer
 * cannot name a directory, so neither can this interface.
 */

/** An answer to a permission card. */
export type AgentPermissionDecision = "allow" | "always" | "deny";

/**
 * A projected SDK event, as `packages/desktop/src/agentProtocol.js` makes it,
 * plus the permission broker's own (`agentPermissions.js`): a card opening,
 * a card closing, and the session's current "always" grants.
 */
export type AgentSessionEvent = { sessionId: string } & (
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
 * Generated per turn by the block and turned into the system prompt in main
 * (§4.5). Text for a model, never a path or an argv element.
 */
export interface AgentTurnContext {
  /** The post's title, as the author named it. */
  title: string;
  /** This block's own address, so "after me" can be said precisely. */
  blockId: string;
  /** `formatOutline` of the live post, with its `stateHash` line first. */
  outline: string;
  /** What was selected when the block was inserted — first turn only. */
  selection: CapturedSelection | null;
}

export type AgentStartResult =
  | { ok: true; sessionId: string; cwd: string }
  | { ok: false; error: string; cancelled?: boolean };

export type AgentSendResult = { ok: true } | { ok: false; error: string };

/** Where a doc-tool call for a session lands: the editor holding its block. */
export interface AgentToolTarget {
  editor: LexicalEditor;
  blockKey: NodeKey;
  /**
   * The last block this session inserted with no placement, so successive
   * default inserts keep their order rather than each landing straight after
   * the agent block. Mutable on purpose; it is per-session working state.
   */
  lastInserted?: string;
  /**
   * The document the editor is editing (`useEditorDocumentId`), which is where
   * `insert_image` uploads its bytes — the same rule the image plugin follows.
   * `null` or absent means there is nothing to upload to, and the picture is
   * stored inline as a data URI.
   */
  documentId?: string | null;
  /**
   * The turn the block is running, so that all of its writes share one undo
   * step (`utils/agentHistory.ts`). Set by the block when it sends.
   */
  turn?: string;
  /**
   * Set when the block let go of this target — it unmounted because its pane
   * closed or it was deleted. A slow tool that finishes afterwards refuses
   * rather than writing (`unavailable` in `utils/agentDocTools.ts`).
   */
  detached?: boolean;
}

export interface AgentHost {
  /**
   * Choose a folder (a main-process dialog) and run the first turn. Resolves
   * `{ ok: false, cancelled: true }` when the author dismisses the dialog.
   */
  start(prompt: string, context: AgentTurnContext): Promise<AgentStartResult>;
  /**
   * A follow-up turn; resumes the SDK session if main no longer holds it.
   * `grants` are the ones the block shows — main uses them only to narrow its
   * own record, so a block can withdraw a grant but never add one.
   */
  send(
    sessionId: string,
    prompt: string,
    context: AgentTurnContext,
    grants: string[],
  ): Promise<AgentSendResult>;
  /** Interrupt the turn; main also denies its open permission cards. */
  interrupt(sessionId: string): Promise<boolean>;
  /**
   * Answer a card. Fire and forget: the card closes when main says so, with a
   * `permission-resolved` event, never on the click alone.
   */
  answerPermission(requestId: string, decision: AgentPermissionDecision): void;
  /** Subscribe to one session's events. Returns the unsubscribe. */
  onEvent(sessionId: string, cb: (event: AgentSessionEvent) => void): () => void;
  /**
   * Route this session's doc-tool calls to `target` until the returned
   * function runs. Call it synchronously when `start` resolves: main may send
   * the first tool call in the very next IPC message.
   */
  attach(sessionId: string, target: AgentToolTarget): () => void;
  /**
   * Show the session's whole transcript — main reads the SDK's own
   * `<sessionId>.jsonl` from its record of the session's folder, and the app
   * renders it as text. Absent on a shell that cannot (before phase 6).
   */
  openTranscript?: (sessionId: string) => void;
}

interface AgentHostValue {
  host: AgentHost;
  /** The title of the post this editor is editing, for §4.5's prompt. */
  postTitle: string;
}

const AgentHostContext = createContext<AgentHostValue | null>(null);

export const AgentHostProvider = (
  { host, postTitle, children }: {
    host: AgentHost | null;
    postTitle: string;
    children: ReactNode;
  },
) => (
  <AgentHostContext.Provider value={host ? { host, postTitle } : null}>
    {children}
  </AgentHostContext.Provider>
);

/** The host, or `null` when this editor has no agent capability. */
export const useAgentHost = (): AgentHostValue | null =>
  useContext(AgentHostContext);
