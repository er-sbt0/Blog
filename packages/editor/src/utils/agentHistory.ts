/**
 * One undo step per agent turn (docs/plans/archive/agent-block.md §4.1, §13).
 *
 * Every doc-tool write is its own `editor.update`, and `@lexical/history` would
 * make each one an undo step: a turn that wrote six paragraphs, an equation
 * and a sketch took eight Ctrl+Z to take back. Here the first write of a turn
 * is tagged `history-push` — a boundary, so it never folds into the author's
 * last keystrokes — and every later write of the *same* turn `history-merge`,
 * which replaces the history's current entry instead of stacking a new one.
 * One undo then restores the post as it was before the turn.
 *
 * **Only while the turn's write is still the top of the history.** If the
 * author types between two of the agent's writes, merging the second into
 * the history's current entry would fold it into *their* typing, and one undo
 * would take both. So any other update that changes the document — typing,
 * a paste, an undo or redo, anything `historic` — ends the run, and the
 * turn's next write starts a new step. Selection-only updates do not: history
 * merges those itself. The block's own bookkeeping (`AGENT_BOOKKEEPING_TAG`)
 * does not either: it is off the history, so it cannot be what is on top.
 *
 * `history-merge` has a cost the push does not: the editor's `OnChangePlugin`
 * is configured to skip merge-tagged updates (`ignoreHistoryMergeTagChange`),
 * so a merged write would not reach autosave until something else changed.
 * `agentWrote` therefore asks for a save explicitly (`UPDATE_DOCUMENT_COMMAND`,
 * the nested editors' route to the same thing).
 */
import {
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { UPDATE_DOCUMENT_COMMAND } from "../commands";
import { AGENT_BOOKKEEPING_TAG } from "../nodes/AgentBlockNode/model";

/** The tag on every agent write, whichever history tag goes with it. */
export const AGENT_WRITE_TAG = "agent-write";

interface Run {
  /** The turn whose write is the history's current entry, or null. */
  turn: string | null;
}

const runs = new WeakMap<LexicalEditor, Run>();

function runOf(editor: LexicalEditor): Run {
  let run = runs.get(editor);
  if (run) return run;
  const created: Run = { turn: null };
  runs.set(editor, created);
  editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
    if (tags.has(AGENT_WRITE_TAG) || tags.has(AGENT_BOOKKEEPING_TAG)) return;
    if (tags.has(HISTORIC_TAG) || dirtyElements.size > 0 || dirtyLeaves.size > 0) {
      created.turn = null;
    }
  });
  return created;
}

/** The tags for the next write of `turn`. No turn — a write outside one — never merges. */
export function agentWriteTags(
  editor: LexicalEditor,
  turn: string | undefined,
): string[] {
  const merge = turn !== undefined && runOf(editor).turn === turn;
  return [AGENT_WRITE_TAG, merge ? HISTORY_MERGE_TAG : HISTORY_PUSH_TAG];
}

/** Record that `turn` just wrote, after a committed write tagged by `agentWriteTags`. */
export function agentWrote(
  editor: LexicalEditor,
  turn: string | undefined,
  tags: readonly string[],
): void {
  runOf(editor).turn = turn ?? null;
  if (tags.includes(HISTORY_MERGE_TAG)) {
    editor.dispatchCommand(UPDATE_DOCUMENT_COMMAND, undefined);
  }
}
