"use client";
/**
 * The desktop bridge's `agent` capability, adapted to the editor package's
 * `AgentHost` (docs/plans/archive/agent-block.md §4.3).
 *
 * One per window, because the thing it wraps is: main sends every doc-tool call
 * for every session this window owns on one channel, so there is exactly one
 * subscription to it, made the first time a host is asked for, and a router
 * (`createAgentRouter`) that sends each call to the editor holding *its* block.
 * Blocks attach their sessions to that router; nothing here knows about
 * focus, panes or which post is in front.
 *
 * `null` off the Electron build, which is what keeps `/agent` out of the VPS:
 * the editor offers the command only when a host is injected.
 */
import type { AgentHost, AgentSessionEvent } from "@/editor/context/AgentHostContext";
import { createAgentRouter } from "@/editor/utils/agentRouter";
import { type AgentEvent, getDesktopBridge } from "@/lib/desktopBridge";
import { openAgentTranscript } from "@/components/AgentTranscript/transcriptRequest";

let host: AgentHost | null | undefined;

/**
 * The window's agent host, or `null` when there is no bridge. Read it in an
 * effect, never during render: the server pass has no `window` and answers
 * `null` (see `getDesktopBridge`).
 */
export function getAgentHost(): AgentHost | null {
  if (host !== undefined) return host;
  const agent = getDesktopBridge()?.agent;
  if (
    !agent || typeof agent.send !== "function" ||
    typeof agent.answerPermission !== "function"
  ) {
    // A shell from before phase 1 has no `send`, and one from before phase 2
    // no `answerPermission`; treat either as no capability rather than offer a
    // block that cannot follow up or answer a card.
    host = null;
    return host;
  }

  const router = createAgentRouter();
  agent.onToolCall((call) => {
    void router.handle(call).then((result) => agent.toolResult(call.callId, result));
  });

  // The compiler's check that the two copies of the event union agree.
  const asSessionEvent = (event: AgentEvent): AgentSessionEvent => event;

  host = {
    start: (prompt, context) => agent.start({ prompt, context }),
    send: (sessionId, prompt, context, grants) =>
      agent.send(sessionId, { prompt, context, grants }),
    interrupt: (sessionId) => agent.interrupt(sessionId),
    answerPermission: (requestId, decision) =>
      agent.answerPermission(requestId, decision),
    onEvent: (sessionId, cb) =>
      agent.onEvent(sessionId, (event) => cb(asSessionEvent(event))),
    attach: (sessionId, target) => router.attach(sessionId, target),
    // A shell from before phase 6 has no `transcript`; the block then shows
    // no link rather than one that cannot open.
    ...(typeof agent.transcript === "function"
      ? { openTranscript: (sessionId: string) => openAgentTranscript(sessionId) }
      : {}),
  };
  return host;
}
