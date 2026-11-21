/**
 * The agent's commands (docs/plans/archive/agent-block.md §4.4,
 * docs/plans/archive/agent-bar.md §4.1), and the editor package's surface for the
 * app's bar.
 *
 * Offering `/agent` is the picker's business and depends on an injected agent
 * host; this plugin mounts wherever the node is registered and reads the host
 * only to refuse a send there is nothing to run it.
 *
 * What the bar (phase 2) uses, all from this module:
 *
 * - `SEND_AGENT_PROMPT_COMMAND` — dispatch into the active editor; `false`
 *   back means nothing was sent;
 * - `getCurrentAgentSession(editor)` — the session chip;
 * - `getAgentTurns` / `subscribeAgentTurns` — Stop and "waiting on you",
 *   with `interruptAgentTurn(editor, nodeKey)` behind Stop and `Esc`;
 * - `onAgentBarFocusRequest` — `/agent` asking for the bar;
 * - `onAgentPromptReturned` — a prompt the node took and could not send (the
 *   folder dialog cancelled, an IPC error), so the bar can restore its draft.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useRef } from "react";
import { AgentBlockNode } from "@/editor/nodes/AgentBlockNode";
import { useAgentHost } from "@/editor/context/AgentHostContext";
import { registerAgentCommands } from "./session";

export {
  getCurrentAgentSession,
  INSERT_AGENT_BLOCK_COMMAND,
  SEND_AGENT_PROMPT_COMMAND,
} from "./session";
export type { AgentSessionSummary, SendAgentPromptPayload } from "./session";
export {
  getAgentTurns,
  interruptAgentTurn,
  subscribeAgentTurns,
} from "@/editor/nodes/AgentBlockNode/turns";
export type {
  AgentTurnPhase,
  AgentTurnState,
} from "@/editor/nodes/AgentBlockNode/turns";
export { onAgentBarFocusRequest } from "@/editor/nodes/AgentBlockNode/focus";
export { onAgentPromptReturned } from "@/editor/nodes/AgentBlockNode/handoff";
export type { AgentPromptReturn } from "@/editor/nodes/AgentBlockNode/handoff";
export type { AgentBarFocusRequest } from "@/editor/nodes/AgentBlockNode/focus";
export { MAX_PROMPT as MAX_AGENT_PROMPT } from "@/editor/nodes/AgentBlockNode/model";

export default function AgentPlugin() {
  const [editor] = useLexicalComposerContext();
  const hasHost = Boolean(useAgentHost());
  const hostRef = useRef(hasHost);
  hostRef.current = hasHost;

  useEffect(() => {
    if (!editor.hasNodes([AgentBlockNode])) {
      throw new Error("AgentPlugin: AgentBlockNode is not registered on editor");
    }
    return registerAgentCommands(
      editor,
      () => hostRef.current && editor.isEditable(),
    );
  }, [editor]);

  return null;
}
