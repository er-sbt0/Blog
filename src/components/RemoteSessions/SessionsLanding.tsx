"use client";
/**
 * `/sessions` — where the sessions view lands before a transcript is picked
 * (docs/plans/remote-claude.md §4.6). For now a host list with counts and a
 * pointer to the sidebar; the stats dashboard of §4.10 is phase 4 and takes the
 * marked slot below.
 */
import React, { useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Typography,
} from "@mui/material";
import { MessagesSquare, RefreshCw, Server } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { IS_DESKTOP_CLIENT } from "@/lib/desktop";
import { actions, useDispatch } from "@/store";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { refreshSessions, syncHost, useSessionsStore } from "./sessionsStore";
import { relativeTime, SessionsUnavailable } from "./SessionBits";

export const SessionsLanding: React.FC = () => {
  const store = useSessionsStore();
  const dispatch = useDispatch();
  const { setSidebarMode } = useSidebarWidth();

  useEffect(() => {
    if (IS_DESKTOP_CLIENT) void refreshSessions();
  }, []);

  if (!IS_DESKTOP_CLIENT) return <SessionsUnavailable />;

  const showTree = () => {
    dispatch(actions.setSidebarView("sessions"));
    setSidebarMode("full");
  };

  const hosts = store.tree?.hosts ?? [];
  const counts = (hostId: string) => {
    const all = store.tree?.sessions.filter((s) => s.hostId === hostId) ?? [];
    return {
      sessions: all.filter((s) => !s.isSubagent).length,
      subagents: all.filter((s) => s.isSubagent).length,
      gone: all.filter((s) => s.goneAt).length,
    };
  };

  let body: React.ReactNode;
  if (store.status === "idle" || store.status === "loading") {
    body = [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={88} />);
  } else if (store.status === "error") {
    body = (
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => void refreshSessions()}>Retry</Button>}
      >
        {store.error}
      </Alert>
    );
  } else if (hosts.length === 0) {
    body = (
      <Typography variant="body2" color="text.secondary">
        No hosts yet — add one in Settings → Remote hosts.
      </Typography>
    );
  } else {
    body = hosts.map((host) => {
      const c = counts(host.id);
      const syncing = Boolean(store.syncing[host.id]);
      return (
        <Card key={host.id} variant="outlined">
          <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, "&:last-child": { pb: 2 } }}>
            <Server size={ICON_SIZE.default} aria-hidden />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" component="h2" noWrap>{host.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {c.sessions} sessions · {c.subagents} subagent runs
                {c.gone ? ` · ${c.gone} gone from remote` : ""} · synced {relativeTime(host.lastSyncAt)}
              </Typography>
              {host.lastError && (
                <Typography
                  variant="caption"
                  color="error.main"
                  component="p"
                  sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {host.lastError.length > 300 ? `${host.lastError.slice(0, 300)}…` : host.lastError}
                </Typography>
              )}
            </Box>
            <Button
              size="small"
              variant="outlined"
              disabled={syncing}
              onClick={() => void syncHost(host.id)}
              startIcon={<RefreshCw size={ICON_SIZE.inline} />}
            >
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          </CardContent>
        </Card>
      );
    });
  }

  return (
    <Box sx={{ maxWidth: 820, width: "100%", mx: "auto", py: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <MessagesSquare size={ICON_SIZE.large} strokeWidth={1.5} aria-hidden />
        <Box>
          <Typography variant="h5" component="h1">Pick a session</Typography>
          <Typography variant="body2" color="text.secondary">
            Remote Claude Code transcripts, by host and project, in the sidebar.
          </Typography>
        </Box>
        <Button size="small" onClick={showTree} sx={{ ml: "auto" }}>Show sessions</Button>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{body}</Box>

      {/* §4.10's stats dashboard (phase 4) renders here. */}
    </Box>
  );
};

export default SessionsLanding;
