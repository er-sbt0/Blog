/**
 * Inserting an `/agent` block (docs/plans/archive/agent-block.md §4.4).
 *
 * The command captures the selection *before* inserting — the insert moves it —
 * and stores it on the block as the first turn's context (§2.9). Typed through
 * the slash menu the selection is a collapsed caret, which `$captureSelection`
 * answers as `null` on purpose (a caret is where the author is, not what they
 * mean); the block's own position in the outline carries that instead.
 *
 * Offering the command is the picker's business and depends on an injected
 * agent host; this plugin only knows how to insert, so it mounts wherever the
 * node is registered.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $setState,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from "lexical";
import { useEffect } from "react";
import { blockIdState } from "@/lib/content-bridge";
import { mintBlockId } from "@/lib/content-bridge/blockId";
import {
  $createAgentBlockNode,
  AgentBlockNode,
} from "@/editor/nodes/AgentBlockNode";
import { requestAgentFocus } from "@/editor/nodes/AgentBlockNode/focus";
import { $captureSelection } from "@/editor/utils/captureSelection";

export const INSERT_AGENT_BLOCK_COMMAND: LexicalCommand<undefined> =
  createCommand("INSERT_AGENT_BLOCK_COMMAND");

export default function AgentPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([AgentBlockNode])) {
      throw new Error("AgentPlugin: AgentBlockNode is not registered on editor");
    }
    return editor.registerCommand(
      INSERT_AGENT_BLOCK_COMMAND,
      () => {
        const context = $captureSelection();
        const node = $createAgentBlockNode({ context });
        // Stamped from birth, so the system prompt can name it exactly and an
        // insert with no placement has an anchor (`agentDocTools.ts`).
        $setState(node, blockIdState, mintBlockId());
        $insertNodeToNearestRoot(node);
        requestAgentFocus(node.getKey());
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
