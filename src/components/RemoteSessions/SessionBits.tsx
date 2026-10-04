"use client";
/**
 * Small pieces the sidebar, the landing and the transcript share.
 */
import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { CloudOff, MonitorX } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "@/components/Layout/SideBar/constants";

/** "3 hours ago", or `fallback` for a missing or unparseable time. */
export function relativeTime(iso: string | null | undefined, fallback = "never"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** A full local timestamp, for tooltips and the transcript header. */
export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/**
 * "Gone from remote" (§4.8): the file was pruned on the host and this copy is
 * the only one. Icon plus words, never colour alone (DESIGN.md §10). `sidebar`
 * sizes it on the sidebar's em ladder (§17.2 carve-out).
 */
export const GoneBadge: React.FC<{ sidebar?: boolean }> = ({ sidebar }) => (
  <Tooltip title="The remote no longer has this transcript. This copy is the only one.">
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        px: 0.75,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "warning.main",
        color: "warning.main",
        whiteSpace: "nowrap",
        ...(sidebar
          ? { fontSize: SB_FONT.meta, lineHeight: 1.5 }
          : { typography: "micro" }),
      }}
    >
      <CloudOff size={ICON_SIZE.micro} aria-hidden />
      gone from remote
    </Box>
  </Tooltip>
);

/** The web build has no sessions (§3); every surface says so the same way. */
export const SessionsUnavailable: React.FC = () => (
  <Box
    role="status"
    sx={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1.5,
      py: 8,
      textAlign: "center",
      color: "text.secondary",
    }}
  >
    <MonitorX size={ICON_SIZE.display} strokeWidth={1.5} aria-hidden />
    <Typography variant="h6" component="h1" color="text.primary">
      The web build has no sessions
    </Typography>
    <Typography variant="body2">
      Remote Claude Code sessions are browsed in the desktop app.
    </Typography>
  </Box>
);
