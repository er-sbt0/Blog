"use client";
/**
 * Mounts the agent-transcript dialog once per window, and only once it is
 * asked for: the viewer (and `@tanstack/react-virtual` behind it) is a chunk
 * the VPS build and every window that never opens a transcript never load.
 */
import dynamic from "next/dynamic";
import { IS_DESKTOP_CLIENT } from "@/lib/desktop";
import { useAgentTranscriptRequest } from "./transcriptRequest";

const AgentTranscriptDialog = dynamic(() => import("./AgentTranscriptDialog"), {
  ssr: false,
});

const AgentTranscriptHost = () => {
  const requested = useAgentTranscriptRequest() !== null;
  if (!IS_DESKTOP_CLIENT) return null;
  return requested ? <AgentTranscriptDialog /> : null;
};

export default AgentTranscriptHost;
