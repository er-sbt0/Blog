"use client";
/**
 * An `/agent` block's full transcript, over the post
 * (docs/plans/archive/agent-block.md phase 6).
 *
 * **A dialog, not a page.** Remote sessions open at `/sessions/[id]`, but a
 * route here would navigate away from the post — unmounting its editor, which
 * interrupts the block's running turn (§6 q3). The link is most wanted exactly
 * then, mid-turn or just after, so it opens over the post and leaves the
 * editor mounted.
 *
 * The text comes from the desktop shell (`window.desktop.agent.transcript`),
 * which reads the SDK's own `.jsonl` from its record of the session's folder;
 * this page never names a path. It is parsed here by `parse.ts` and rendered by
 * the remote-sessions `TranscriptView`, so no transcript byte becomes markup
 * (`TranscriptEntry.test.tsx`).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import { FileText, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { getDesktopBridge } from "@/lib/desktopBridge";
import TranscriptView from "@/components/RemoteSessions/TranscriptView";
import { formatBytes } from "@/editor/nodes/AgentBlockNode/model";
import {
  closeAgentTranscript,
  useAgentTranscriptRequest,
} from "./transcriptRequest";
import { type LocalTranscript, localTranscript, localTranscriptSource } from "./localTranscript";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; transcript: LocalTranscript; truncated: boolean; size: number };

const Body: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    const read = getDesktopBridge()?.agent.transcript;
    if (!read) {
      setLoad({ state: "error", message: "This version of the desktop app cannot read transcripts." });
      return;
    }
    read(sessionId)
      .then((result) => {
        if (!live) return;
        if (!result.ok) {
          setLoad({ state: "error", message: result.error });
          return;
        }
        setLoad({
          state: "ready",
          transcript: localTranscript({ sessionId, ...result }),
          truncated: result.truncated,
          size: result.size,
        });
      })
      .catch((error: unknown) =>
        live && setLoad({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      );
    return () => {
      live = false;
    };
  }, [sessionId]);

  const source = useMemo(
    () => (load.state === "ready" ? localTranscriptSource(load.transcript) : null),
    [load],
  );

  if (load.state === "error") {
    return (
      <Alert severity="error" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {load.message}
      </Alert>
    );
  }
  if (load.state === "loading" || !source) {
    return (
      <Box aria-busy sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Skeleton variant="text" width="50%" height={36} />
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={36} />
      </Box>
    );
  }
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      {load.truncated && (
        <Alert severity="info" sx={{ flexShrink: 0 }}>
          This transcript is {formatBytes(load.size)}; only its beginning is shown.
        </Alert>
      )}
      <TranscriptView id={sessionId} source={source} />
    </Box>
  );
};

const AgentTranscriptDialog: React.FC = () => {
  const sessionId = useAgentTranscriptRequest();
  return (
    <Dialog
      aria-labelledby="agent-transcript-title"
      fullWidth
      maxWidth="lg"
      onClose={closeAgentTranscript}
      open={sessionId !== null}
      PaperProps={{ sx: { borderRadius: 2, height: "90vh" } }}
    >
      <DialogTitle
        id="agent-transcript-title"
        sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}
      >
        <FileText aria-hidden size={ICON_SIZE.default} />
        <Typography variant="h6" component="span" sx={{ flex: 1 }}>
          Agent transcript
        </Typography>
        <IconButton aria-label="Close the transcript" onClick={closeAgentTranscript} size="small">
          <X size={ICON_SIZE.default} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {sessionId && <Body key={sessionId} sessionId={sessionId} />}
      </DialogContent>
    </Dialog>
  );
};

export default AgentTranscriptDialog;
