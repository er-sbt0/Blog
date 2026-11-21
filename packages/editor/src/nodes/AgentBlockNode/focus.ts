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
import { type LexicalEditor, type NodeKey, SKIP_DOM_SELECTION_TAG } from "lexical";

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

/**
 * Tags that keep an agent's update from taking focus (docs/plans/agent-bar.md,
 * phase 2 log). An update whose selection is dirty puts the DOM selection back
 * into the editor, and putting a selection into a `contenteditable` focuses
 * it — so the bar's send, the node's bookkeeping and the agent's writes each
 * pulled the caret out of the bar the author was typing in. Skipped only when
 * the editor does not hold focus already: the state's selection is kept, and
 * the DOM one is put back the next time the author returns to the post.
 */
export function keepFocusTags(editor: LexicalEditor): string[] {
  let root: HTMLElement | null = null;
  try {
    root = editor.getRootElement();
  } catch {
    return []; // A headless editor has no DOM to take focus in.
  }
  if (!root) return [];
  return root.contains(root.ownerDocument.activeElement)
    ? []
    : [SKIP_DOM_SELECTION_TAG];
}
