/**
 * The block's own writes, kept off the undo history
 * (docs/plans/archive/agent-block.md §13, phase 6).
 *
 * An agent block writes its record into its node: the prompt when it is sent,
 * the session id and folder once `start` answers, the log and outcome at the
 * turn's end, the grants when main reports them. None of those is something
 * the author did to the post, so none is an undo step — they are tagged
 * `historic`, which `@lexical/history` discards. Discarding is not enough,
 * though. History snapshots whole editor states, so undoing the agent's
 * paragraphs restores a state from *before* the turn, whose agent block has
 * the old log, the old outcome and — after a first turn — no session at all.
 * Left alone, an undo would revive a stale log and lose the session id.
 *
 * So the newest record is also kept **here**, per editor and node key, and
 * re-asserted after any update that leaves a block's node disagreeing with
 * it: an undo, a redo, a reset to the saved state. Node keys survive undo and
 * redo (history restores the same node map), which is what makes the key the
 * right index, and the re-assertion is itself `historic`, so it moves nothing
 * on either stack. The record is the latest *write*, not a high-water mark:
 * withdrawing a grant writes a shorter list and that is what comes back.
 *
 * The comparison is by identity, field by field — a write replaces the arrays
 * it changes and keeps the rest — so a keystroke elsewhere in the post costs a
 * map lookup per agent block and nothing more.
 */
import {
  $getNodeByKey,
  $getState,
  $setState,
  HISTORIC_TAG,
  type LexicalEditor,
  type NodeKey,
} from "lexical";
import { blockIdState } from "@/lib/content-bridge";
import { $isAgentBlockNode, type AgentBlockNode } from ".";
import { keepFocusTags } from "./focus";
import { AGENT_BOOKKEEPING_TAG, type AgentBlockData } from "./model";

/** Everything on the node that is the session's record rather than the author's. */
const FIELDS = [
  "sessionId",
  "cwd",
  "prompts",
  "log",
  "status",
  "grants",
  "dropped",
  "context",
] as const satisfies readonly (keyof AgentBlockData)[];

type Record_ = Pick<AgentBlockData, (typeof FIELDS)[number]> & {
  /** The block's `blk_` id, stamped by the first send — also historic. */
  blockId: string;
};

const records = new WeakMap<LexicalEditor, Map<NodeKey, Record_>>();

export const BOOKKEEPING_TAGS = [HISTORIC_TAG, AGENT_BOOKKEEPING_TAG];

function $recordOf(node: AgentBlockNode): Record_ {
  const data = node.getData();
  const record = { blockId: $getState(node, blockIdState) } as Record_;
  for (const field of FIELDS) {
    (record as unknown as Record<string, unknown>)[field] = data[field];
  }
  return record;
}

function $agrees(node: AgentBlockNode, record: Record_): boolean {
  const data = node.getData();
  return FIELDS.every((field) => data[field] === record[field]) &&
    $getState(node, blockIdState) === record.blockId;
}

function $restore(node: AgentBlockNode, record: Record_): void {
  const { blockId, ...data } = record;
  node.setData(data);
  if (blockId && $getState(node, blockIdState) !== blockId) {
    $setState(node, blockIdState, blockId);
  }
}

function recordsFor(editor: LexicalEditor): Map<NodeKey, Record_> {
  let map = records.get(editor);
  if (map) return map;
  map = new Map();
  records.set(editor, map);
  const kept = map;
  // Never unregistered: it lives exactly as long as the editor, which is what
  // the WeakMap entry does too.
  editor.registerUpdateListener(({ editorState, tags }) => {
    if (tags.has(AGENT_BOOKKEEPING_TAG) || kept.size === 0) return;
    const stale = editorState.read(() =>
      [...kept].filter(([key, record]) => {
        const node = $getNodeByKey(key);
        return $isAgentBlockNode(node) && !$agrees(node, record);
      }).map(([key]) => key)
    );
    if (stale.length === 0) return;
    editor.update(() => {
      for (const key of stale) {
        const node = $getNodeByKey(key);
        const record = kept.get(key);
        if ($isAgentBlockNode(node) && record) $restore(node, record);
      }
    }, { tag: [...BOOKKEEPING_TAGS, ...keepFocusTags(editor)] });
  });
  return map;
}

/**
 * Write to one agent block's record: off the undo history, and remembered so
 * that no undo or redo can take it back. `change` may also run `$`-functions
 * on the node (the first send stamps its block id).
 */
export function writeAgentBookkeeping(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  change: (data: AgentBlockData, node: AgentBlockNode) => Partial<AgentBlockData>,
): void {
  const map = recordsFor(editor);
  editor.update(
    () => {
      const node = $getNodeByKey(nodeKey);
      if (!$isAgentBlockNode(node)) return;
      const writable = node.setData(change(node.getData(), node));
      map.set(nodeKey, $recordOf(writable));
    },
    { discrete: true, tag: [...BOOKKEEPING_TAGS, ...keepFocusTags(editor)] },
  );
}
