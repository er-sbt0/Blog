"use client";
/**
 * Settings → Remote hosts (docs/plans/remote-claude.md §4.2, §4.8): the hosts
 * whose Claude Code transcripts the sessions view mirrors. Add one by ssh alias
 * (or `user@host`) and a display label; removing one forgets it and every
 * session synced from it. Desktop-only — `SettingsPanel` mounts it behind
 * `IS_DESKTOP_CLIENT`.
 *
 * The alias is validated on the server, and again in the main process before it
 * becomes an argv element; the server's message is shown as it was worded.
 */
import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Server, Trash2 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { errorMessage, remoteSessionsApi } from "@/api/remoteSessions";
import { refreshSessions, useSessionsStore } from "./sessionsStore";
import { useForget } from "./useForget";
import { relativeTime } from "./SessionBits";

const RemoteHostsSettings: React.FC = () => {
  const store = useSessionsStore();
  const { forgetHost } = useForget();
  const [alias, setAlias] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void refreshSessions();
  }, []);

  const add = async () => {
    const a = alias.trim();
    if (!a) return;
    setBusy(true);
    setFormError(null);
    try {
      await remoteSessionsApi.hosts.create(a, label.trim() || a);
      setAlias("");
      setLabel("");
      await refreshSessions();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const hosts = store.tree?.hosts ?? [];
  const sessionIdsOf = (hostId: string) =>
    store.tree?.sessions.filter((s) => s.hostId === hostId).map((s) => s.id) ?? [];
  const countOf = (hostId: string) =>
    store.tree?.sessions.filter((s) => s.hostId === hostId && !s.isSubagent).length ?? 0;

  let list: React.ReactNode;
  if (store.status === "idle" || store.status === "loading") {
    list = <Skeleton variant="rounded" height={36} />;
  } else if (store.status === "error") {
    list = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refreshSessions()}>
            Retry
          </Button>
        }
      >
        {store.error}
      </Alert>
    );
  } else if (hosts.length === 0) {
    list = (
      <Typography variant="body2" color="text.secondary">
        No hosts yet. Add one below.
      </Typography>
    );
  } else {
    list = hosts.map((host) => (
      <Box
        key={host.id}
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.5 }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Server size={ICON_SIZE.dense} aria-hidden />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>{host.label}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="p">
              {host.alias} · {countOf(host.id)} sessions · synced {relativeTime(host.lastSyncAt)}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Remove host">
          <span>
            <IconButton
              size="small"
              disabled={Boolean(store.syncing[host.id])}
              onClick={() => void forgetHost(host, sessionIdsOf(host.id))}
              aria-label={`Remove ${host.label} and forget its sessions`}
            >
              <Trash2 size={ICON_SIZE.dense} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    ));
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Claude Code transcripts are read over your system ssh, with your keys and
        ~/.ssh/config. Run <code>ssh &lt;alias&gt;</code> once in a terminal first
        — a password or host-key prompt fails the sync rather than waiting.
      </Typography>

      {list}

      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          void add();
        }}
        sx={{ display: "flex", alignItems: "flex-start", gap: 1, mt: 1, flexWrap: "wrap" }}
      >
        <TextField
          size="small"
          label="ssh alias or user@host"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          sx={{ flex: "1 1 180px" }}
          slotProps={{ htmlInput: { style: { fontFamily: "monospace" } } }}
        />
        <TextField
          size="small"
          label="Display name"
          placeholder="Optional"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
          sx={{ flex: "1 1 140px" }}
        />
        <Button
          type="submit"
          variant="contained"
          size="small"
          disabled={busy || !alias.trim()}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ mt: 0.5 }}
        >
          Add host
        </Button>
      </Box>
      {formError && (
        <Alert severity="error" onClose={() => setFormError(null)}>
          {formError}
        </Alert>
      )}
    </Box>
  );
};

export default RemoteHostsSettings;
