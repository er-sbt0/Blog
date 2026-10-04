"use client";
/**
 * The sidebar's "Sessions" view (docs/plans/remote-claude.md §4.6): host →
 * project → session, subagent runs nested under their session, a text filter at
 * the top, and per host a Sync button, the last-synced time and ssh's last
 * error verbatim. Opening a session navigates to `/sessions/[id]`.
 *
 * Desktop-only. The activity-rail button that selects this view is hidden on
 * the web build, but the view still answers for itself in case the persisted
 * view ever says "sessions" there.
 */
import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Collapse,
  IconButton,
  InputBase,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AlertCircle,
  Bot,
  Folder,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { IS_DESKTOP_CLIENT } from "@/lib/desktop";
import { MONO_FONT, SB_FONT } from "@/components/Layout/SideBar/constants";
import type {
  RemoteHostSummary,
  RemoteSessionSummary,
} from "@/lib/claudeSessions/types";
import {
  buildSessionTree,
  type HostNode,
  messageCount,
  type ProjectNode,
  type SessionNode,
} from "./sessionTree";
import {
  refreshSessions,
  syncHost,
  type SyncState,
  useSessionsStore,
} from "./sessionsStore";
import { useForget } from "./useForget";
import { SessionTreeRow } from "./SessionTreeRow";
import { GoneBadge, relativeTime } from "./SessionBits";

type MenuTarget =
  | { kind: "host"; node: HostNode }
  | { kind: "project"; node: ProjectNode }
  | { kind: "session"; node: SessionNode }
  | { kind: "subagent"; session: RemoteSessionSummary };

interface MenuState {
  target: MenuTarget;
  anchor: { top: number; left: number };
}

const activeSessionId = (pathname: string): string | null =>
  /^\/sessions\/([^/]+)$/.exec(pathname)?.[1] ?? null;

const sessionSecondary = (s: RemoteSessionSummary) => {
  const n = messageCount(s);
  return `${relativeTime(s.endedAt ?? s.startedAt, "no activity")} · ${n} ${
    n === 1 ? "message" : "messages"
  }`;
};

/** Opens the actions menu at a right-click, or under the "⋯" button. */
const anchorOf = (e: React.MouseEvent): MenuState["anchor"] => {
  if (e.type === "contextmenu") return { top: e.clientY, left: e.clientX };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { top: r.bottom, left: r.left };
};

const MoreButton: React.FC<{ label: string; onOpen: (e: React.MouseEvent) => void }> = (
  { label, onOpen },
) => (
  <IconButton
    size="small"
    className="row-actions-btn"
    aria-label={label}
    aria-haspopup="menu"
    onClick={onOpen}
    sx={{ p: 0.25 }}
  >
    <MoreHorizontal size={ICON_SIZE.inline} />
  </IconButton>
);

/** ssh's message, verbatim, two lines until expanded (§4.7). */
const HostError: React.FC<{ message: string }> = ({ message }) => {
  const [open, setOpen] = useState(false);
  const long = message.length > 120 || message.includes("\n");
  return (
    <Box
      role="alert"
      sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", color: "error.main" }}
    >
      <Box component="span" sx={{ display: "flex", pt: "2px", flexShrink: 0 }}>
        <AlertCircle size={ICON_SIZE.micro} aria-hidden />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="p"
          sx={{
            fontSize: SB_FONT.meta,
            fontFamily: MONO_FONT,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            ...(!open && {
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }),
          }}
        >
          {message}
        </Typography>
        {long && (
          <Button
            size="small"
            variant="text"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            sx={{ fontSize: SB_FONT.meta, p: 0, minWidth: 0, color: "inherit" }}
          >
            {open ? "Show less" : "Show all"}
          </Button>
        )}
      </Box>
    </Box>
  );
};

const HostStatus: React.FC<{
  host: RemoteHostSummary;
  sync: SyncState | undefined;
  syncError: string | undefined;
}> = ({ host, sync, syncError }) => {
  const error = syncError ?? host.lastError;
  return (
    <Box sx={{ pl: 5.25, pr: 1.5, pb: 0.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
      {sync
        ? (
          <Box role="status" aria-live="polite">
            <Typography sx={{ fontSize: SB_FONT.meta, color: "text.secondary" }}>
              {sync.phase === "indexing"
                ? "Indexing…"
                : sync.total > 0
                ? `Reading… ${Math.floor((sync.done / sync.total) * 100)}%`
                : "Listing…"}
            </Typography>
            <LinearProgress
              variant={sync.phase === "reading" && sync.total > 0 ? "determinate" : "indeterminate"}
              value={sync.phase === "reading" && sync.total > 0 ? (sync.done / sync.total) * 100 : undefined}
              aria-label={`Syncing ${host.label}`}
              sx={{ height: 2, borderRadius: 1 }}
            />
          </Box>
        )
        : (
          <Tooltip title={host.lastSyncAt ? new Date(host.lastSyncAt).toLocaleString() : ""}>
            <Typography sx={{ fontSize: SB_FONT.meta, color: "text.disabled" }}>
              {host.lastSyncAt ? `Synced ${relativeTime(host.lastSyncAt)}` : "Never synced"}
            </Typography>
          </Tooltip>
        )}
      {!sync && error && <HostError message={error} />}
    </Box>
  );
};

const RowsSkeleton = () => (
  <Box sx={{ px: 2, py: 1, display: "flex", flexDirection: "column", gap: 1 }} aria-busy>
    {[0.7, 0.9, 0.6, 0.8].map((w, i) => (
      <Skeleton key={i} variant="text" width={`${w * 100}%`} />
    ))}
  </Box>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    component="p"
    sx={{ fontSize: SB_FONT.meta, color: "text.secondary", px: 2, py: 2, textAlign: "center" }}
  >
    {children}
  </Typography>
);

export const SessionsSidebarView: React.FC = () => {
  const store = useSessionsStore();
  const pathname = usePathname();
  const activeId = activeSessionId(pathname);
  const { forgetSession, forgetProject, forgetHost } = useForget();
  const [filter, setFilter] = useState("");
  const [collapsedHosts, setCollapsedHosts] = useState<Set<string>>(new Set());
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [openSubagents, setOpenSubagents] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (IS_DESKTOP_CLIENT && store.status === "idle") void refreshSessions();
  }, [store.status]);

  const hosts = useMemo(
    () => (store.tree ? buildSessionTree(store.tree, filter) : []),
    [store.tree, filter],
  );
  const filtering = filter.trim() !== "";

  // The project holding the open session starts expanded, so following a link
  // into a transcript shows where it sits.
  useEffect(() => {
    if (!activeId || !store.tree) return;
    const s = store.tree.sessions.find((x) => x.id === activeId);
    if (!s) return;
    const top = s.isSubagent && s.parentId
      ? store.tree.sessions.find((x) => x.id === s.parentId) ?? s
      : s;
    const key = `${top.hostId}:${top.projectDir}`;
    setOpenProjects((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    if (top !== s) {
      setOpenSubagents((prev) => (prev.has(top.id) ? prev : new Set(prev).add(top.id)));
    }
  }, [activeId, store.tree]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openMenu = (target: MenuTarget) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ target, anchor: anchorOf(e) });
  };

  const runMenu = () => {
    if (!menu) return;
    const { target } = menu;
    setMenu(null);
    if (target.kind === "host") {
      void forgetHost(
        target.node.host,
        target.node.projects.flatMap((p) =>
          p.sessions.flatMap((n) => [n.session.id, ...n.subagents.map((s) => s.id)])
        ),
      );
    } else if (target.kind === "project") void forgetProject(target.node);
    else if (target.kind === "session") void forgetSession(target.node.session, target.node.subagents);
    else void forgetSession(target.session);
  };

  const menuLabel = menu
    ? { host: "Remove host…", project: "Forget project…", session: "Forget session…", subagent: "Forget subagent run…" }[
      menu.target.kind
    ]
    : "";

  if (!IS_DESKTOP_CLIENT) {
    return <Note>The web build has no sessions.</Note>;
  }

  const renderSession = (node: SessionNode, depth: number) => {
    const { session, subagents } = node;
    const subsOpen = filtering || openSubagents.has(session.id);
    return (
      <Box key={session.id}>
        <SessionTreeRow
          depth={depth}
          icon={<MessageSquare size={ICON_SIZE.inline} />}
          primary={session.title ?? "Untitled session"}
          secondary={sessionSecondary(session)}
          trailing={session.goneAt ? <GoneBadge sidebar /> : undefined}
          href={`/sessions/${session.id}`}
          selected={activeId === session.id}
          title={session.title ?? undefined}
          onContextMenu={openMenu({ kind: "session", node })}
          actions={
            <>
              {subagents.length > 0 && (
                <Tooltip title={subsOpen ? "Hide subagent runs" : "Show subagent runs"}>
                  <Button
                    size="small"
                    onClick={() => toggle(setOpenSubagents, session.id)}
                    aria-expanded={subsOpen}
                    aria-label={`${subagents.length} subagent runs`}
                    startIcon={<Bot size={ICON_SIZE.micro} />}
                    sx={{
                      minWidth: 0,
                      px: 0.5,
                      py: 0,
                      fontSize: SB_FONT.meta,
                      fontFamily: MONO_FONT,
                      color: "text.secondary",
                      "& .MuiButton-startIcon": { mr: 0.25 },
                    }}
                  >
                    {subagents.length}
                  </Button>
                </Tooltip>
              )}
              <MoreButton label="Session actions" onOpen={openMenu({ kind: "session", node })} />
            </>
          }
        />
        {subagents.length > 0 && (
          <Collapse in={subsOpen} timeout="auto" unmountOnExit>
            {subagents.map((sub) => (
              <SessionTreeRow
                key={sub.id}
                depth={depth + 1}
                icon={<Bot size={ICON_SIZE.inline} />}
                primary={sub.title ?? "Untitled subagent run"}
                secondary={sessionSecondary(sub)}
                trailing={sub.goneAt ? <GoneBadge sidebar /> : undefined}
                href={`/sessions/${sub.id}`}
                selected={activeId === sub.id}
                title={sub.title ?? undefined}
                onContextMenu={openMenu({ kind: "subagent", session: sub })}
                actions={
                  <MoreButton
                    label="Subagent run actions"
                    onOpen={openMenu({ kind: "subagent", session: sub })}
                  />
                }
              />
            ))}
          </Collapse>
        )}
      </Box>
    );
  };

  const renderProject = (project: ProjectNode) => {
    const open = filtering || openProjects.has(project.key);
    return (
      <Box key={project.key}>
        <SessionTreeRow
          depth={1}
          icon={open ? <FolderOpen size={ICON_SIZE.inline} /> : <Folder size={ICON_SIZE.inline} />}
          primary={
            <Tooltip
              title={project.guessed
                ? "Guessed from the directory name — no event recorded the real path"
                : project.label}
              placement="right"
            >
              <Box
                component="span"
                sx={{ fontFamily: MONO_FONT, fontStyle: project.guessed ? "italic" : "normal" }}
              >
                {project.label}
              </Box>
            </Tooltip>
          }
          trailing={
            <Typography
              component="span"
              sx={{ fontSize: SB_FONT.meta, fontFamily: MONO_FONT, color: "text.disabled" }}
            >
              {project.sessions.length}
            </Typography>
          }
          expanded={open}
          onClick={() => toggle(setOpenProjects, project.key)}
          onContextMenu={openMenu({ kind: "project", node: project })}
          actions={
            <MoreButton label="Project actions" onOpen={openMenu({ kind: "project", node: project })} />
          }
        />
        <Collapse in={open} timeout="auto" unmountOnExit>
          {project.sessions.map((node) => renderSession(node, 2))}
        </Collapse>
      </Box>
    );
  };

  const renderHost = (node: HostNode) => {
    const { host } = node;
    const open = filtering || !collapsedHosts.has(host.id);
    const sync = store.syncing[host.id];
    return (
      <Box key={host.id} sx={{ mb: 0.5 }}>
        <SessionTreeRow
          depth={0}
          icon={<Server size={ICON_SIZE.inline} />}
          primary={host.label}
          secondary={<Box component="span" sx={{ fontFamily: MONO_FONT }}>{host.alias}</Box>}
          expanded={open}
          onClick={() => toggle(setCollapsedHosts, host.id)}
          onContextMenu={openMenu({ kind: "host", node })}
          actionsVisible
          actions={
            <>
              <Tooltip title={sync ? "Syncing…" : `Sync ${host.label}`}>
                <span>
                  <IconButton
                    size="small"
                    disabled={Boolean(sync)}
                    onClick={() => void syncHost(host.id)}
                    aria-label={`Sync ${host.label}`}
                    sx={{ p: 0.25 }}
                  >
                    <RefreshCw size={ICON_SIZE.inline} />
                  </IconButton>
                </span>
              </Tooltip>
              <MoreButton label="Host actions" onOpen={openMenu({ kind: "host", node })} />
            </>
          }
        />
        <HostStatus host={host} sync={sync} syncError={store.syncErrors[host.id]} />
        <Collapse in={open} timeout="auto" unmountOnExit>
          {node.projects.length === 0
            ? (
              <Typography
                component="p"
                sx={{ fontSize: SB_FONT.meta, color: "text.secondary", pl: 5.25, py: 0.5 }}
              >
                No sessions on this host yet —{" "}
                <Button
                  size="small"
                  variant="text"
                  disabled={Boolean(sync)}
                  onClick={() => void syncHost(host.id)}
                  sx={{ fontSize: "inherit", p: 0, minWidth: 0, verticalAlign: "baseline" }}
                >
                  Sync
                </Button>
              </Typography>
            )
            : node.projects.map(renderProject)}
        </Collapse>
      </Box>
    );
  };

  let body: React.ReactNode;
  if (store.status === "idle" || store.status === "loading") {
    body = <RowsSkeleton />;
  } else if (store.status === "error") {
    body = (
      <Box sx={{ px: 1.5, py: 1 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refreshSessions()}>
              Retry
            </Button>
          }
          sx={{ fontSize: SB_FONT.meta }}
        >
          {store.error}
        </Alert>
      </Box>
    );
  } else if (store.tree && store.tree.hosts.length === 0) {
    body = <Note>No hosts yet — add one in Settings → Remote hosts.</Note>;
  } else if (hosts.length === 0) {
    body = <Note>No sessions match “{filter}”.</Note>;
  } else {
    body = (
      <Box component="nav" aria-label="Remote sessions">
        {store.error && (
          // A refresh failed but an older tree is still on screen.
          <Box sx={{ px: 1.5, pb: 1 }}>
            <Alert severity="warning" sx={{ fontSize: SB_FONT.meta }}>{store.error}</Alert>
          </Box>
        )}
        {hosts.map(renderHost)}
      </Box>
    );
  }

  return (
    <Box sx={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, pt: 0.5, pb: 1, flexShrink: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.input",
            "&:focus-within": { borderColor: "primary.main" },
          }}
        >
          <Search
            size={ICON_SIZE.inline}
            style={{ color: "var(--mui-palette-text-secondary)", flexShrink: 0 }}
            aria-hidden
          />
          <InputBase
            fullWidth
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, path or branch…"
            inputProps={{ "aria-label": "Filter sessions" }}
            sx={{ fontSize: SB_FONT.body, color: "text.primary" }}
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>{body}</Box>

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu?.anchor}
      >
        <MenuItem onClick={runMenu}>
          <ListItemIcon>
            <Trash2 size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>{menuLabel}</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SessionsSidebarView;
