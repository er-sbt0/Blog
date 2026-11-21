/**
 * "Focus the bar": what `/agent` asks for once it has inserted an empty
 * session node (docs/plans/agent-bar.md §2.10).
 *
 * The node has no prompt editor any more — the bar is the input (§2.1) — and
 * the bar is app code the editor package cannot import. So the request is an
 * event the app listens for. With no listener (the VPS build, a shell before
 * the bar's composer exists, a test) it goes nowhere, which is correct: the
 * node is still inserted and the next send from the bar continues it.
 */
import type { LexicalEditor, NodeKey } from "lexical";

export interface AgentBarFocusRequest {
  /** The editor holding the node, so the bar can make it the active one. */
  editor: LexicalEditor;
  nodeKey: NodeKey;
}

const listeners = new Set<(request: AgentBarFocusRequest) => void>();

export function onAgentBarFocusRequest(
  listener: (request: AgentBarFocusRequest) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestAgentBarFocus(request: AgentBarFocusRequest): void {
  for (const listener of [...listeners]) listener(request);
}
