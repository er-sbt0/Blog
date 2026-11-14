"use client";
import { type RefObject, useEffect } from "react";
import type { LexicalEditor } from "lexical";
import { getDesktopBridge } from "@/lib/desktopBridge";
import { runAgentDocTool } from "@/editor/utils/agentDocTools";

/**
 * Answer the agent's doc-tool calls against the focused post's live editor
 * (docs/plans/agent-block.md §3.1). Desktop only: off the Electron build there
 * is no bridge, and this does nothing.
 *
 * Mounted once, in the app shell, because the calls are per window rather than
 * per block — main forwards every call for a session this window owns on one
 * channel. Phase 1 routes a call to the editor holding *its* block rather than
 * to whichever pane has focus; phase 0 has no block, so focus is the answer.
 */
export function useAgentDocTools(editorRef: RefObject<LexicalEditor | null>) {
  useEffect(() => {
    const agent = getDesktopBridge()?.agent;
    if (!agent) return;

    const offToolCall = agent.onToolCall((call) => {
      let result: unknown;
      try {
        result = runAgentDocTool(editorRef.current, call.name, call.input);
      } catch (error) {
        result = { ok: false, error: (error as Error).message };
      }
      agent.toolResult(call.callId, result);
    });

    // PHASE 0 SPIKE ONLY — delete with phase 1's `/agent` block. A devtools
    // console trigger, so the round trip can be driven with no UI to design:
    // `await agentSpike()` in the window's console, with a post open.
    const spikeWindow = window as unknown as {
      agentSpike?: (prompt?: string) => Promise<unknown>;
    };
    spikeWindow.agentSpike = async (prompt = SPIKE_PROMPT) => {
      const started = await agent.start({ prompt });
      if (!started.ok) return started;
      const off = agent.onEvent(started.sessionId, (event) => {
        console.warn("[agent]", event);
        if (event.type === "closed") off();
      });
      return started;
    };

    return () => {
      offToolCall();
      delete spikeWindow.agentSpike;
    };
  }, [editorRef]);
}

const SPIKE_PROMPT =
  "Use insert_blocks once to add one paragraph at the end of the post saying " +
  "that this paragraph was written by an agent running in the desktop app. " +
  "Then reply with the word done.";
