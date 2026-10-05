"use client";
/**
 * One row of a transcript (docs/plans/remote-claude.md §4.7): a prompt bubble,
 * assistant Markdown, a slash-command chip, collapsed thinking or meta, or a
 * tool call folded together with its result.
 *
 * §2.4 is the rule here, and it is not a style preference: a transcript is
 * arbitrary bytes from a remote machine, rendered in a window that can type
 * into a running Claude Code. **Every string below is a React text child.**
 * Tool input and output are plain monospace — no syntax highlighter, no HTML.
 * `TranscriptEntry.test.tsx` feeds this file `<img onerror>`, `<script>` and a
 * `javascript:` link and asserts none of them became markup.
 */
import React, { useState } from "react";
import RouterLink from "next/link";
import { Box, Button, ButtonBase, Link, Typography } from "@mui/material";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader,
  TerminalSquare,
  X,
} from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import type { RemoteSessionDetail } from "@/lib/claudeSessions/types";
import {
  clipLines,
  editPairs,
  entryText,
  lineCount,
  lineDiff,
  subagentFor,
  toolResultBody,
  toolSummary,
  toolUseBody,
  type TranscriptRow,
} from "./transcriptModel";
import { TranscriptMarkdown } from "./TranscriptMarkdown";
import { Hl } from "./Highlight";

const monoSx = {
  fontFamily: MONO_FONT,
  typography: "dense",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  m: 0,
} as const;

const panelSx = {
  ...monoSx,
  p: 1.25,
  borderRadius: 2,
  bgcolor: "action.hover",
  overflowX: "auto",
} as const;

/**
 * Text that may carry `[image]` placeholders (`parse.ts`'s `blocksText`). Each
 * one renders as a labelled placeholder; the rest is text.
 */
const WithImages: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/^\[image\]$/m);
  if (parts.length === 1) return <Hl text={text} />;
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Box
              component="span"
              role="img"
              aria-label="Image (not shown)"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.75,
                borderRadius: 1.5,
                border: "1px dashed",
                borderColor: "divider",
                color: "text.secondary",
                typography: "micro",
              }}
            >
              <ImageIcon size={ICON_SIZE.micro} aria-hidden /> image
            </Box>
          )}
          <Hl text={part} />
        </React.Fragment>
      ))}
    </>
  );
};

/** Clipped output with "Show all" (`transcript.py`'s 200 lines). */
const ClippedPre: React.FC<{ text: string; error?: boolean }> = ({ text, error }) => {
  const [all, setAll] = useState(false);
  const clip = clipLines(text);
  return (
    <Box>
      <Box component="pre" sx={{ ...panelSx, ...(error && { color: "error.main" }) }}>
        <WithImages text={all ? text : clip.text} />
      </Box>
      {clip.clipped && (
        <Button size="small" onClick={() => setAll((v) => !v)} aria-expanded={all} sx={{ mt: 0.5 }}>
          {all ? "Show first 200 lines" : `Show all ${clip.total} lines`}
        </Button>
      )}
    </Box>
  );
};

/** Red/green line diff of an Edit's old_string → new_string. */
const EditDiff: React.FC<{ before: string; after: string }> = ({ before, after }) => (
  <Box component="pre" sx={{ ...panelSx, p: 0, py: 0.75 }} aria-label="Edit diff">
    {lineDiff(before, after).map((line, i) => (
      <Box
        key={i}
        component="span"
        sx={{
          display: "block",
          px: 1.25,
          ...(line.op === "-" && { bgcolor: "rgba(var(--mui-palette-error-mainChannel) / 0.12)" }),
          ...(line.op === "+" && { bgcolor: "rgba(var(--mui-palette-success-mainChannel) / 0.12)" }),
        }}
      >
        <Box component="span" aria-hidden sx={{ userSelect: "none", color: "text.disabled", pr: 1 }}>
          {line.op}
        </Box>
        <Hl text={line.text} />
      </Box>
    ))}
  </Box>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="micro" component="p" sx={{ color: "text.secondary", mt: 1, mb: 0.5 }}>
    {children}
  </Typography>
);

const ToolInput: React.FC<{ name: string; input: unknown }> = ({ name, input }) => {
  const pairs = editPairs(name, input);
  if (pairs) {
    const path = toolSummary(name, input);
    return (
      <>
        {path && <Label>{path}</Label>}
        {pairs.map((p, i) => <EditDiff key={i} before={p.before} after={p.after} />)}
      </>
    );
  }
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
  if (name === "Bash" && typeof obj?.command === "string") {
    return <Box component="pre" sx={panelSx}><Hl text={obj.command} /></Box>;
  }
  if (name === "Write" && typeof obj?.content === "string") {
    return (
      <>
        {typeof obj.file_path === "string" && <Label>{obj.file_path}</Label>}
        <ClippedPre text={obj.content} />
      </>
    );
  }
  return <Box component="pre" sx={panelSx}><Hl text={JSON.stringify(input, null, 2)} /></Box>;
};

interface ToolCallProps {
  row: TranscriptRow;
  expanded: boolean;
  onToggle: () => void;
  subagents: RemoteSessionDetail["subagents"];
}

export const ToolCall: React.FC<ToolCallProps> = ({ row, expanded, onToggle, subagents }) => {
  const use = toolUseBody(row.entry)!;
  const res = row.result ? toolResultBody(row.result) : null;
  const summary = toolSummary(use.name, use.input);
  const sub = res ? subagentFor(res.agentId, subagents) : null;
  const status = !res
    ? { icon: <Loader size={ICON_SIZE.micro} aria-hidden />, text: "no result yet", color: "text.disabled" }
    : res.isError
    ? { icon: <X size={ICON_SIZE.micro} aria-hidden />, text: "error", color: "error.main" }
    : {
      icon: <Check size={ICON_SIZE.micro} aria-hidden />,
      text: `${lineCount(res.content)} lines`,
      color: "success.main",
    };
  return (
    <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        sx={{
          width: "100%",
          justifyContent: "flex-start",
          gap: 1,
          px: 1,
          py: 0.5,
          borderRadius: 2,
          textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
          "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
        }}
      >
        {expanded
          ? <ChevronDown size={ICON_SIZE.inline} aria-hidden />
          : <ChevronRight size={ICON_SIZE.inline} aria-hidden />}
        <Typography variant="dense" sx={{ fontWeight: 600, flexShrink: 0 }}>{use.name}</Typography>
        <Typography
          variant="dense"
          noWrap
          sx={{ fontFamily: MONO_FONT, color: "text.secondary", minWidth: 0, flex: 1 }}
        >
          <Hl text={summary} />
        </Typography>
        <Box
          component="span"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: status.color, flexShrink: 0, typography: "micro" }}
        >
          {status.icon}
          {status.text}
        </Box>
      </ButtonBase>
      {expanded && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <ToolInput name={use.name} input={use.input} />
          {res && (
            <>
              <Label>{res.isError ? "Error" : "Result"}</Label>
              <ClippedPre text={res.content} error={res.isError} />
            </>
          )}
        </Box>
      )}
      {sub && (
        <Box sx={{ px: 1.5, pb: 1 }}>
          <Link
            component={RouterLink}
            href={`/sessions/${sub.id}`}
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, typography: "dense" }}
          >
            <Bot size={ICON_SIZE.inline} aria-hidden />
            Open subagent{sub.title ? `: ${sub.title}` : ""}
          </Link>
        </Box>
      )}
    </Box>
  );
};

/** Thinking and meta: two lines until expanded (§4.7). */
const Collapsible: React.FC<{ label: string; text: string; expanded: boolean; onToggle: () => void }> = (
  { label, text, expanded, onToggle },
) => (
  <Box sx={{ borderLeft: 2, borderColor: "divider", pl: 1.5, color: "text.secondary" }}>
    <ButtonBase
      onClick={onToggle}
      aria-expanded={expanded}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        borderRadius: 1,
        "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main" },
      }}
    >
      <Typography variant="micro" component="p" sx={{ fontStyle: "italic" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="p"
        sx={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          ...(!expanded && {
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }),
        }}
      >
        <Hl text={text} />
      </Typography>
    </ButtonBase>
  </Box>
);

interface TranscriptEntryProps {
  row: TranscriptRow;
  expanded: boolean;
  onToggle: () => void;
  subagents: RemoteSessionDetail["subagents"];
}

export const TranscriptEntry: React.FC<TranscriptEntryProps> = ({ row, expanded, onToggle, subagents }) => {
  const { entry } = row;
  switch (entry.kind) {
    case "prompt":
      return (
        <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
          <Box
            sx={{
              maxWidth: "85%",
              px: 1.75,
              py: 1,
              borderRadius: 2.5,
              bgcolor: "accent.tint",
              typography: "body2",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <WithImages text={entryText(entry)} />
          </Box>
        </Box>
      );
    case "assistant":
      return (
        <Box>
          <TranscriptMarkdown text={entryText(entry)} />
        </Box>
      );
    case "command": {
      const body = entry.body as { name?: string; args?: string };
      const name = (body.name ?? "").replace(/^\//, "");
      return (
        <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.25,
              py: 0.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              fontFamily: MONO_FONT,
              typography: "dense",
              maxWidth: "85%",
              wordBreak: "break-word",
            }}
          >
            <TerminalSquare size={ICON_SIZE.inline} aria-hidden />
            <span><Hl text={`/${name}${body.args ? ` ${body.args}` : ""}`} /></span>
          </Box>
        </Box>
      );
    }
    case "thinking":
      return <Collapsible label="Thinking" text={entryText(entry)} expanded={expanded} onToggle={onToggle} />;
    case "meta": {
      const body = entry.body as { label?: string; text?: string };
      return (
        <Collapsible label={body.label ?? "meta"} text={body.text ?? ""} expanded={expanded} onToggle={onToggle} />
      );
    }
    case "tool_use":
      return toolUseBody(entry)
        ? <ToolCall row={row} expanded={expanded} onToggle={onToggle} subagents={subagents} />
        : null;
    case "tool_result": {
      // A result whose call is not among the loaded entries.
      const res = toolResultBody(entry);
      if (!res) return null;
      const sub = subagentFor(res.agentId, subagents);
      return (
        <Box>
          <Label>{entry.tool ? `${entry.tool} result` : "Tool result"}{res.isError ? " (error)" : ""}</Label>
          <ClippedPre text={res.content} error={res.isError} />
          {sub && (
            <Link component={RouterLink} href={`/sessions/${sub.id}`} sx={{ typography: "dense" }}>
              Open subagent
            </Link>
          )}
        </Box>
      );
    }
    default:
      return null;
  }
};
