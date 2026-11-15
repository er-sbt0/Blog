/**
 * Which editor answers a session's doc-tool call
 * (docs/plans/agent-block.md §7, phase-0 note 3).
 *
 * Main forwards every call for every session a window owns on one channel. In
 * phase 0 the focused editor answered, which in a split view writes into
 * whichever post the author last clicked rather than the one holding the
 * session. Here a call goes to the editor that holds **its** block: the block
 * attaches its session when it starts one or mounts with one, and detaches when
 * it unmounts. A call for a session nobody has attached — the post was closed,
 * the block deleted — is answered as a tool error the agent can relay, never
 * run against some other document.
 *
 * Pure apart from the executor it is handed, so the routing rule is pinned by a
 * spec without an editor.
 */
import type { AgentToolTarget } from "../context/AgentHostContext";
import { type AgentToolResult, runAgentDocTool } from "./agentDocTools";

export interface AgentToolCallLike {
  sessionId: string;
  name: string;
  input: unknown;
}

export const NOT_OPEN =
  "The post holding this agent block is not open in the editor, so the " +
  "doc tools cannot reach it. Stop and tell the author to reopen the post.";

export function createAgentRouter(
  run: (
    target: AgentToolTarget,
    name: string,
    input: unknown,
  ) => AgentToolResult = runAgentDocTool,
) {
  const targets = new Map<string, AgentToolTarget>();

  return {
    /** Route `sessionId` to `target`. The returned function undoes exactly this. */
    attach(sessionId: string, target: AgentToolTarget): () => void {
      targets.set(sessionId, target);
      return () => {
        if (targets.get(sessionId) === target) targets.delete(sessionId);
      };
    },

    /** Run one call against its own block's editor, never another. */
    handle(call: AgentToolCallLike): AgentToolResult {
      const target = targets.get(call.sessionId);
      if (!target) return { ok: false, error: NOT_OPEN };
      try {
        return run(target, call.name, call.input);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export type AgentRouter = ReturnType<typeof createAgentRouter>;
