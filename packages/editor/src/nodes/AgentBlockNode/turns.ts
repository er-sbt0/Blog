/**
 * What the app can see of a session node's turn, and the one thing it can do
 * to one (docs/plans/archive/agent-bar.md §3, §4.1).
 *
 * The node owns the session (§3): the bar never calls the agent host itself,
 * so whatever the bar shows of a turn — Stop, "waiting on you" — has to be
 * read from the nodes. Each mounted `AgentBlockComponent` publishes its state
 * here and withdraws it on unmount. A node that is not mounted has no turn,
 * because unmounting interrupts it (agent-block §6 q3).
 *
 * Also kept here, in memory only: which node in an editor ran a turn last, so
 * "the current session" (§2.6) can mean the most recently used one without
 * storing anything new on the node. After a reload that memory is gone and
 * `$findCurrentAgentBlock` falls back to document order.
 *
 * The snapshot is replaced whole on every change, so it is safe to hand to
 * `useSyncExternalStore` as is.
 */
import type { LexicalEditor, NodeKey } from "lexical";

/**
 * `running` covers starting, thinking and running a tool; `waiting` is a
 * permission card open and nothing moving until the author answers it.
 */
export type AgentTurnPhase = "idle" | "running" | "waiting";

export interface AgentTurnState {
  editor: LexicalEditor;
  nodeKey: NodeKey;
  sessionId: string | null;
  phase: AgentTurnPhase;
}

interface Entry extends AgentTurnState {
  interrupt: () => void;
}

let entries: Entry[] = [];
let snapshot: readonly AgentTurnState[] = [];
const listeners = new Set<() => void>();
const lastUsed = new WeakMap<LexicalEditor, NodeKey>();

function changed(): void {
  snapshot = entries.map(({ editor, nodeKey, sessionId, phase }) => ({
    editor,
    nodeKey,
    sessionId,
    phase,
  }));
  for (const listener of [...listeners]) listener();
}

/** Every mounted session node's turn, across editors. */
export const getAgentTurns = (): readonly AgentTurnState[] => snapshot;

/** Called on any change to `getAgentTurns()`. Returns the unsubscribe. */
export function subscribeAgentTurns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One node's turn, or `null` when it is not mounted. */
export const getAgentTurn = (
  editor: LexicalEditor,
  nodeKey: NodeKey,
): AgentTurnState | null =>
  snapshot.find((s) => s.editor === editor && s.nodeKey === nodeKey) ?? null;

/**
 * Stop a node's turn, exactly as its own Stop button does: it is recorded as
 * the author's stop, and main denies the turn's open cards. `false` when the
 * node is not mounted or nothing is running.
 */
export function interruptAgentTurn(
  editor: LexicalEditor,
  nodeKey: NodeKey,
): boolean {
  const entry = entries.find((e) => e.editor === editor && e.nodeKey === nodeKey);
  if (!entry || entry.phase === "idle") return false;
  entry.interrupt();
  return true;
}

/** The component's half: publish (or update) this node's turn. */
export function publishAgentTurn(
  state: AgentTurnState,
  interrupt: () => void,
): void {
  const index = entries.findIndex((e) =>
    e.editor === state.editor && e.nodeKey === state.nodeKey
  );
  const entry: Entry = { ...state, interrupt };
  const previous = index >= 0 ? entries[index] : null;
  if (
    previous && previous.phase === entry.phase &&
    previous.sessionId === entry.sessionId
  ) {
    entries[index] = entry; // A fresh `interrupt`, nothing observable.
    return;
  }
  entries = index >= 0
    ? entries.map((e, i) => (i === index ? entry : e))
    : [...entries, entry];
  changed();
}

/** The component's half: it unmounted. */
export function withdrawAgentTurn(editor: LexicalEditor, nodeKey: NodeKey): void {
  const next = entries.filter((e) => !(e.editor === editor && e.nodeKey === nodeKey));
  if (next.length === entries.length) return;
  entries = next;
  changed();
}

/** Record that this node is the one the author used last in this editor. */
export function touchAgentBlock(editor: LexicalEditor, nodeKey: NodeKey): void {
  lastUsed.set(editor, nodeKey);
}

/** The node used last in this editor, if this process remembers one. */
export const lastAgentBlock = (editor: LexicalEditor): NodeKey | null =>
  lastUsed.get(editor) ?? null;
