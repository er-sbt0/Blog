"use client";
/**
 * `/sessions/[id]` — one remote Claude Code transcript
 * (docs/plans/remote-claude.md §4.7).
 *
 * Entries arrive in pages by `idx` and render through `@tanstack/react-virtual`
 * (MIT) with measured row heights, so a session of thousands of entries is
 * neither sent nor mounted whole. Pages load in order as the end of what is
 * loaded scrolls into view.
 *
 * Find-in-session searches the entries loaded so far, client-side; the
 * server-side search of §4.9 is phase 4. n / p step between prompts; `/` focuses
 * find. All three are bare keys, which none of the app's chords use (they all
 * carry a modifier — `menuTemplate.js`'s `APP_SHORTCUTS`), and they stand down
 * while typing in a field, inside an editor, or with the terminal focused.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RouterLink from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  IconButton,
  InputBase,
  Link,
  Skeleton,
  ToggleButton,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
  Search,
} from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { IS_DESKTOP_CLIENT } from "@/lib/desktop";
import { isTerminalFocused } from "@/lib/terminalFocus";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { errorMessage, remoteSessionsApi } from "@/api/remoteSessions";
import type {
  RemoteEntryRow,
  RemoteSessionDetail,
} from "@/lib/claudeSessions/types";
import {
  buildRows,
  findRows,
  formatDuration,
  promptRowIndices,
  stepIndex,
} from "./transcriptModel";
import { TranscriptEntry } from "./TranscriptEntry";
import { absoluteTime, GoneBadge, SessionsUnavailable } from "./SessionBits";

const PAGE = 500;

/** Is the keyboard busy with something that wants bare letters? */
const typingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role='textbox']") !== null;
};

const SkeletonRows = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, py: 2 }} aria-busy>
    {[60, 90, 40, 75, 55].map((w, i) => (
      <Box key={i} sx={{ display: "flex", justifyContent: i % 2 ? "flex-start" : "flex-end" }}>
        <Skeleton variant="rounded" width={`${w}%`} height={i % 2 ? 72 : 36} />
      </Box>
    ))}
  </Box>
);

const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box sx={{ display: "flex", flexDirection: "column" }}>
    <Typography variant="micro" component="span" color="text.secondary">{label}</Typography>
    <Typography variant="dense" component="span">{children}</Typography>
  </Box>
);

const Header: React.FC<{ detail: RemoteSessionDetail }> = ({ detail }) => (
  <Box component="header" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
    <Breadcrumbs aria-label="Breadcrumb" sx={{ typography: "dense" }}>
      <Link component={RouterLink} href="/sessions" underline="hover" color="inherit">
        Sessions
      </Link>
      <Typography variant="dense" component="span" color="text.secondary">{detail.host.label}</Typography>
      {detail.parent && (
        <Link component={RouterLink} href={`/sessions/${detail.parent.id}`} underline="hover" color="inherit">
          {detail.parent.title ?? "Untitled session"}
        </Link>
      )}
    </Breadcrumbs>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Typography variant="h5" component="h1" sx={{ wordBreak: "break-word" }}>
        {detail.title ?? (detail.isSubagent ? "Untitled subagent run" : "Untitled session")}
      </Typography>
      {detail.goneAt && <GoneBadge />}
    </Box>
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", color: "text.secondary" }}>
      <Tooltip title={detail.cwdGuessed ? "Guessed from the directory name" : ""}>
        <Typography
          variant="dense"
          component="span"
          sx={{ fontFamily: MONO_FONT, fontStyle: detail.cwdGuessed ? "italic" : "normal", wordBreak: "break-all" }}
        >
          {detail.cwd ?? detail.projectDir}
        </Typography>
      </Tooltip>
      {detail.gitBranch && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          <GitBranch size={ICON_SIZE.inline} aria-hidden />
          <Typography variant="dense" component="span" sx={{ fontFamily: MONO_FONT }}>
            {detail.gitBranch}
          </Typography>
        </Box>
      )}
    </Box>
    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      <Stat label="Started">{absoluteTime(detail.startedAt)}</Stat>
      <Stat label="Ended">{absoluteTime(detail.endedAt)}</Stat>
      <Stat label="Active">{formatDuration(detail.activeMs)}</Stat>
      <Stat label="Prompts">{detail.userMsgs}</Stat>
      <Stat label="Replies">{detail.assistantMsgs}</Stat>
      <Stat label="Tool calls">{detail.toolCalls}</Stat>
      {detail.subagents.length > 0 && <Stat label="Subagent runs">{detail.subagents.length}</Stat>}
    </Box>
  </Box>
);

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; detail: RemoteSessionDetail };

export const TranscriptView: React.FC<{ id: string }> = ({ id }) => {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [entries, setEntries] = useState<RemoteEntryRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  /** Rows toggled away from the `expandAll` default, by entry idx. */
  const [toggled, setToggled] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);
  /** The row last jumped to by n / p / find, outlined so the eye can find it. */
  const [cursor, setCursor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);

  // Session + first page, together. A new id starts from scratch.
  useEffect(() => {
    if (!IS_DESKTOP_CLIENT) return;
    let live = true;
    setLoad({ state: "loading" });
    setEntries([]);
    setTotal(null);
    setPageError(null);
    setToggled(new Set());
    setCursor(null);
    loadingRef.current = true;
    Promise.all([remoteSessionsApi.sessions.get(id), remoteSessionsApi.sessions.entries(id, 0, PAGE)])
      .then(([detail, page]) => {
        if (!live) return;
        setLoad({ state: "ready", detail });
        setEntries(page.entries);
        setTotal(page.total);
      })
      .catch((error) => live && setLoad({ state: "error", message: errorMessage(error) }))
      .finally(() => {
        if (live) loadingRef.current = false;
      });
    return () => {
      live = false;
    };
  }, [id]);

  const hasMore = total !== null && entries.length < total;

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setPageLoading(true);
    setPageError(null);
    const from = entries.length;
    remoteSessionsApi.sessions
      .entries(id, from, PAGE)
      .then((page) => {
        setEntries((prev) => (prev.length === from ? [...prev, ...page.entries] : prev));
        setTotal(page.total);
      })
      .catch((error) => setPageError(errorMessage(error)))
      .finally(() => {
        loadingRef.current = false;
        setPageLoading(false);
      });
  }, [entries.length, hasMore, id]);

  const rows = useMemo(
    () => buildRows(entries, { showThinking, showMeta }),
    [entries, showThinking, showMeta],
  );
  const prompts = useMemo(() => promptRowIndices(rows), [rows]);
  const matches = useMemo(() => findRows(rows, query), [rows, query]);

  const virtualizer = useVirtualizer({
    count: rows.length + (hasMore || pageError ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
    getItemKey: (i) => (i < rows.length ? rows[i].entry.idx : "more"),
  });
  const items = virtualizer.getVirtualItems();

  // The sentinel row is in view: fetch the next page.
  const lastItem = items[items.length - 1];
  useEffect(() => {
    if (lastItem && lastItem.index >= rows.length && !pageError) loadMore();
  }, [lastItem, rows.length, loadMore, pageError]);

  const jumpTo = useCallback((rowIndex: number) => {
    setCursor(rowIndex);
    virtualizer.scrollToIndex(rowIndex, { align: "start" });
  }, [virtualizer]);

  const stepPrompt = useCallback((dir: 1 | -1) => {
    const from = cursor ?? (dir === 1 ? (items[0]?.index ?? 0) - 1 : (items[0]?.index ?? 0));
    const next = stepIndex(prompts, from, dir);
    if (next !== null) jumpTo(next);
    else if (dir === 1 && hasMore) loadMore();
  }, [cursor, items, prompts, jumpTo, hasMore, loadMore]);

  const stepMatch = useCallback((dir: 1 | -1) => {
    if (matches.length === 0) return;
    const pos = (matchPos + dir + matches.length) % matches.length;
    setMatchPos(pos);
    jumpTo(matches[pos]);
  }, [matches, matchPos, jumpTo]);

  // A new query starts at its first match.
  useEffect(() => {
    setMatchPos(0);
    if (matches.length > 0) jumpTo(matches[0]);
    // Only when the query changes — not when more pages add matches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (load.state !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typingTarget(e.target) || isTerminalFocused()) return;
      if (e.key === "n") {
        e.preventDefault();
        stepPrompt(1);
      } else if (e.key === "p") {
        e.preventDefault();
        stepPrompt(-1);
      } else if (e.key === "/") {
        e.preventDefault();
        findRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load.state, stepPrompt]);

  const isExpanded = (idx: number) => expandAll !== toggled.has(idx);
  const toggleRow = (idx: number) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  if (!IS_DESKTOP_CLIENT) return <SessionsUnavailable />;

  if (load.state === "error") {
    return (
      <Box sx={{ py: 3, maxWidth: 820, mx: "auto", width: "100%" }}>
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {load.message}
        </Alert>
        <Button component={RouterLink} href="/sessions" sx={{ mt: 2 }}>Back to sessions</Button>
      </Box>
    );
  }

  const detail = load.state === "ready" ? load.detail : null;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ flexShrink: 0, maxWidth: 900, width: "100%", mx: "auto" }}>
        {detail
          ? <Header detail={detail} />
          : (
            <Box aria-busy>
              <Skeleton variant="text" width={160} />
              <Skeleton variant="text" width="60%" height={36} />
              <Skeleton variant="text" width="40%" />
            </Box>
          )}

        {/* Toolbar */}
        <Box
          role="toolbar"
          aria-label="Transcript"
          sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1.5 }}
        >
          <ToggleButton
            size="small"
            value="thinking"
            selected={showThinking}
            onChange={() => setShowThinking((v) => !v)}
            sx={{ py: 0.25, typography: "dense" }}
          >
            Thinking
          </ToggleButton>
          <ToggleButton
            size="small"
            value="meta"
            selected={showMeta}
            onChange={() => setShowMeta((v) => !v)}
            sx={{ py: 0.25, typography: "dense" }}
          >
            Meta
          </ToggleButton>
          <Button
            size="small"
            onClick={() => {
              setExpandAll((v) => !v);
              setToggled(new Set());
            }}
            aria-pressed={expandAll}
            startIcon={expandAll
              ? <ChevronsDownUp size={ICON_SIZE.inline} />
              : <ChevronsUpDown size={ICON_SIZE.inline} />}
          >
            {expandAll ? "Collapse all" : "Expand all"}
          </Button>

          <Box sx={{ flex: 1 }} />

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "background.input",
              "&:focus-within": { borderColor: "primary.main" },
              minWidth: 220,
            }}
          >
            <Search size={ICON_SIZE.inline} aria-hidden style={{ flexShrink: 0 }} />
            <InputBase
              inputRef={findRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  stepMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") {
                  setQuery("");
                  (e.target as HTMLElement).blur();
                }
              }}
              placeholder="Find in session  /"
              inputProps={{ "aria-label": "Find in session (loaded entries)" }}
              sx={{ typography: "dense", flex: 1 }}
            />
            {query && (
              <Typography variant="micro" component="span" color="text.secondary" aria-live="polite" sx={{ flexShrink: 0 }}>
                {matches.length ? `${matchPos + 1}/${matches.length}` : "0/0"}
              </Typography>
            )}
            <IconButton size="small" aria-label="Previous match" disabled={!matches.length} onClick={() => stepMatch(-1)}>
              <ChevronUp size={ICON_SIZE.inline} />
            </IconButton>
            <IconButton size="small" aria-label="Next match" disabled={!matches.length} onClick={() => stepMatch(1)}>
              <ChevronDown size={ICON_SIZE.inline} />
            </IconButton>
          </Box>
          <Typography variant="micro" component="span" color="text.disabled" sx={{ width: "100%", textAlign: "right" }}>
            n / p: next / previous prompt{hasMore ? " · find searches what is loaded" : ""}
          </Typography>
        </Box>
      </Box>

      {/* Entries */}
      <Box
        ref={scrollRef}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid", borderColor: "divider" }}
      >
        <Box sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
          {!detail
            ? <SkeletonRows />
            : rows.length === 0 && !hasMore
            ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                {entries.length === 0
                  ? "This transcript has no messages yet."
                  : "Everything here is thinking or meta — turn those on above to see it."}
              </Typography>
            )
            : (
              <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {items.map((item) => {
                  const row = rows[item.index];
                  return (
                    <Box
                      key={item.key}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${item.start}px)`,
                        py: 1,
                      }}
                    >
                      {row
                        ? (
                          <Box
                            sx={{
                              borderRadius: 2,
                              ...(cursor === item.index && {
                                outline: "2px solid",
                                outlineColor: "primary.main",
                                outlineOffset: "4px",
                              }),
                            }}
                          >
                            <TranscriptEntry
                              row={row}
                              expanded={isExpanded(row.entry.idx)}
                              onToggle={() => toggleRow(row.entry.idx)}
                              subagents={detail.subagents}
                            />
                          </Box>
                        )
                        : pageError
                        ? (
                          <Alert
                            severity="error"
                            action={<Button color="inherit" size="small" onClick={() => setPageError(null)}>Retry</Button>}
                          >
                            {pageError}
                          </Alert>
                        )
                        : (
                          <Box aria-busy={pageLoading} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <Skeleton variant="rounded" height={36} />
                            <Typography variant="micro" component="p" color="text.secondary" sx={{ textAlign: "center" }}>
                              Loading entries {entries.length + 1}–{Math.min(entries.length + PAGE, total ?? 0)} of {total}
                            </Typography>
                          </Box>
                        )}
                    </Box>
                  );
                })}
              </Box>
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default TranscriptView;
