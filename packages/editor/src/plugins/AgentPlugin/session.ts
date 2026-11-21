/**
 * The bar's way into a post's agent session (docs/plans/archive/agent-bar.md §3, §4.1).
 *
 * The bar dispatches `SEND_AGENT_PROMPT_COMMAND` into the active editor and
 * nothing else: it never calls the agent host. This finds the post's current
 * session node, or inserts one (§3.1), and hands the prompt to it; the node
 * then runs the turn exactly as before — `host.start` / `host.send`,
 * `router.attach`, one undo step per turn — so every agent-block invariant
 * stays where it was. Tools still run only against the editor holding the
 * node, and the cwd still comes only from main's dialog.
 *
 * Plain functions rather than a hook, so a headless spec can register them.
 */
import { $dfs, $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $setState,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { blockIdState } from "@/lib/content-bridge";
import { mintBlockId } from "@/lib/content-bridge/blockId";
import type { CapturedSelection } from "@/lib/ai/selection";
import {
  $createAgentBlockNode,
  $isAgentBlockNode,
  type AgentBlockNode,
} from "@/editor/nodes/AgentBlockNode";
import {
  keepFocusTags,
  requestAgentBarFocus,
} from "@/editor/nodes/AgentBlockNode/focus";
import {
  handAgentPrompt,
  hasAgentPrompt,
} from "@/editor/nodes/AgentBlockNode/handoff";
import { MAX_PROMPT } from "@/editor/nodes/AgentBlockNode/model";
import {
  getAgentTurn,
  lastAgentBlock,
  touchAgentBlock,
} from "@/editor/nodes/AgentBlockNode/turns";
import { $captureSelection } from "@/editor/utils/captureSelection";

export interface SendAgentPromptPayload {
  prompt: string;
  /** The selection when the author sent, captured by the bar (§2.9). */
  selection: CapturedSelection | null;
  /** Start another session with its own node rather than continue (§2.6). */
  newSession: boolean;
}

/**
 * Send a prompt to this post's agent. `dispatchCommand` answers `false` when
 * nothing was sent — no agent host, read mode, an empty or oversized prompt,
 * or the current session's turn still running — so the bar should keep its
 * draft. `true` means the node has the prompt; how the turn goes is the node's
 * to show, and `subscribeAgentTurns` the bar's to watch.
 */
export const SEND_AGENT_PROMPT_COMMAND: LexicalCommand<SendAgentPromptPayload> =
  createCommand("SEND_AGENT_PROMPT_COMMAND");

/** `/agent`: an empty session node at the caret, then "focus the bar". */
export const INSERT_AGENT_BLOCK_COMMAND: LexicalCommand<undefined> =
  createCommand("INSERT_AGENT_BLOCK_COMMAND");

const $agentBlocks = (): AgentBlockNode[] =>
  $dfs().map(({ node }) => node).filter($isAgentBlockNode);

/**
 * The post's current session (§2.6): the node that ran a turn most recently.
 * Recency is remembered in memory for this editor (`turns.ts`), so nothing new
 * is stored; with no memory — a post just opened — it is the last node in
 * document order that has run a turn, else the last one at all.
 */
export function $findCurrentAgentBlock(editor: LexicalEditor): AgentBlockNode | null {
  const remembered = lastAgentBlock(editor);
  const node = remembered ? $getNodeByKey(remembered) : null;
  if ($isAgentBlockNode(node) && node.isAttached()) return node;
  const all = $agentBlocks();
  const used = all.filter((n) => n.getData().prompts.length > 0);
  return used.at(-1) ?? all.at(-1) ?? null;
}

/** What the bar's session chip shows: `null` for a post with no session node. */
export interface AgentSessionSummary {
  nodeKey: NodeKey;
  sessionId: string | null;
  turns: number;
}

export const getCurrentAgentSession = (
  editor: LexicalEditor,
): AgentSessionSummary | null =>
  editor.getEditorState().read(() => {
    const node = $findCurrentAgentBlock(editor);
    if (!node) return null;
    const data = node.getData();
    return {
      nodeKey: node.getKey(),
      sessionId: data.sessionId,
      turns: data.prompts.length,
    };
  });

/**
 * The top-level block to insert after (§3.1): the one holding the selection's
 * *end*, so no block the selection names shifts — a structural address in it
 * is only meaningful against the state that captured it. `null`: no selection.
 */
function $insertionPoint(): LexicalNode | "start" | null {
  const selection = $getSelection();
  let node: LexicalNode | null = null;
  if ($isRangeSelection(selection)) {
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    node = end.getNode();
    if ($isRootNode(node)) {
      return end.offset === 0 ? "start" : node.getChildAtIndex(end.offset - 1);
    }
  } else if ($isNodeSelection(selection)) {
    node = selection.getNodes().at(-1) ?? null;
  }
  if (!node || !node.isAttached()) return null;
  return $isRootNode(node) ? null : node.getTopLevelElement();
}

/** A new session node, placed by §3.1's rule and stamped like `/agent`'s. */
export function $insertSessionBlock(selection: CapturedSelection | null): AgentBlockNode {
  const node = $createAgentBlockNode({ context: selection });
  $setState(node, blockIdState, mintBlockId());
  const root = $getRoot();
  const point = $insertionPoint();
  if (point === "start") {
    const first = root.getFirstChild();
    if (first) first.insertBefore(node);
    else root.append(node);
  } else if (point) point.insertAfter(node);
  else root.append(node);
  // A decorator last in the post leaves nowhere to type after it.
  if (!node.getNextSibling()) node.insertAfter($createParagraphNode());
  return node;
}

/**
 * Register both commands. `canRun` is the node's own condition for starting
 * anything — an agent host, and an editable editor — read at dispatch time.
 */
export function registerAgentCommands(
  editor: LexicalEditor,
  canRun: () => boolean,
): () => void {
  return mergeRegister(
    editor.registerCommand(
      SEND_AGENT_PROMPT_COMMAND,
      ({ prompt, selection, newSession }) => {
        const text = prompt.trim();
        if (!canRun() || !text || text.length > MAX_PROMPT) return false;
        // Sent from the bar: inserting a node must not pull the caret out of it.
        for (const tag of keepFocusTags(editor)) $addUpdateTag(tag);
        let node = newSession ? null : $findCurrentAgentBlock(editor);
        if (node) {
          const key = node.getKey();
          const turn = getAgentTurn(editor, key);
          if ((turn && turn.phase !== "idle") || hasAgentPrompt(editor, key)) {
            return false;
          }
        }
        node ??= $insertSessionBlock(selection);
        touchAgentBlock(editor, node.getKey());
        handAgentPrompt(editor, node.getKey(), { prompt: text, selection });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      INSERT_AGENT_BLOCK_COMMAND,
      () => {
        // Captured before the insert moves it. Through the slash menu it is a
        // caret, which `$captureSelection` answers as `null` on purpose.
        const context = $captureSelection();
        const node = $createAgentBlockNode({ context });
        // Stamped from birth, so the system prompt can name it exactly and an
        // insert with no placement has an anchor (`agentDocTools.ts`).
        $setState(node, blockIdState, mintBlockId());
        $insertNodeToNearestRoot(node);
        const nodeKey = node.getKey();
        touchAgentBlock(editor, nodeKey);
        // After the commit, so a listener that moves focus does not do it
        // from inside this update.
        queueMicrotask(() => requestAgentBarFocus({ editor, nodeKey }));
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
  );
}
