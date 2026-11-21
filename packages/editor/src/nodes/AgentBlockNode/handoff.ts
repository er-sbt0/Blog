/**
 * Handing a prompt from the bar to a session node (docs/plans/agent-bar.md
 * §4.1).
 *
 * `SEND_AGENT_PROMPT_COMMAND` runs inside a Lexical update, and a node it has
 * just inserted has no component yet — React mounts decorators after the
 * commit. So the plugin queues the prompt under the node's key and the
 * component claims it: on mount, or, when it is already mounted, when it is
 * notified. The notification goes out on a microtask, after the command's
 * update has committed, so the turn's own writes are never nested inside it.
 * Claiming deletes, so a prompt runs once however many of those happen.
 */
import type { LexicalEditor, NodeKey } from "lexical";
import type { CapturedSelection } from "@/lib/ai/selection";

export interface AgentPromptHandOff {
  prompt: string;
  /** This turn's selection, as the bar captured it (§2.9). */
  selection: CapturedSelection | null;
}

const pending = new WeakMap<LexicalEditor, Map<NodeKey, AgentPromptHandOff>>();
const claimants = new WeakMap<LexicalEditor, Map<NodeKey, () => void>>();

const mapOf = <V>(
  maps: WeakMap<LexicalEditor, Map<NodeKey, V>>,
  editor: LexicalEditor,
): Map<NodeKey, V> => {
  let map = maps.get(editor);
  if (!map) {
    map = new Map();
    maps.set(editor, map);
  }
  return map;
};

export function handAgentPrompt(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  turn: AgentPromptHandOff,
): void {
  mapOf(pending, editor).set(nodeKey, turn);
  queueMicrotask(() => claimants.get(editor)?.get(nodeKey)?.());
}

/** The queued prompt for this node, removed; `null` when there is none. */
export function takeAgentPrompt(
  editor: LexicalEditor,
  nodeKey: NodeKey,
): AgentPromptHandOff | null {
  const map = pending.get(editor);
  const turn = map?.get(nodeKey) ?? null;
  map?.delete(nodeKey);
  return turn;
}

export const hasAgentPrompt = (editor: LexicalEditor, nodeKey: NodeKey): boolean =>
  pending.get(editor)?.has(nodeKey) ?? false;

/** A mounted node's "there is a prompt for you". Returns the unregister. */
export function onAgentPrompt(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  notify: () => void,
): () => void {
  const map = mapOf(claimants, editor);
  map.set(nodeKey, notify);
  return () => {
    if (map.get(nodeKey) === notify) map.delete(nodeKey);
  };
}

/**
 * A prompt the node took and then could not send — the folder dialog
 * cancelled, an IPC error (docs/plans/agent-bar.md, phase 2 log). The node has
 * already taken it back off its record and shows "Not sent: …"; this is the
 * bar's chance to put it back in the field, since the bar let go of its draft
 * when the command answered `true`. `message` is `null` for a cancel.
 */
export interface AgentPromptReturn {
  editor: LexicalEditor;
  nodeKey: NodeKey;
  prompt: string;
  message: string | null;
}

const returnListeners = new Set<(returned: AgentPromptReturn) => void>();

export function onAgentPromptReturned(
  listener: (returned: AgentPromptReturn) => void,
): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

export function returnAgentPrompt(returned: AgentPromptReturn): void {
  for (const listener of [...returnListeners]) listener(returned);
}
