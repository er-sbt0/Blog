"use client";
/**
 * Which agent session's transcript the window is showing, if any
 * (docs/plans/archive/agent-block.md phase 6).
 *
 * The block that asks is inside the editor package, which cannot render app
 * components; the agent host (`src/lib/agentHost.ts`) is how it asks, and this
 * is what the host sets. One dialog per window (`AgentTranscriptDialog`, in
 * `AppLayout`) reads it. A tiny external store rather than Redux: it is one
 * id, it is never persisted, and nothing else needs to know.
 */
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

const set = (next: string | null) => {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
};

export const openAgentTranscript = (sessionId: string) => set(sessionId);
export const closeAgentTranscript = () => set(null);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The session id whose transcript is open, or null. */
export const useAgentTranscriptRequest = (): string | null =>
  useSyncExternalStore(subscribe, () => current, () => null);
