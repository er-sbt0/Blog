"use client";
/**
 * `/sessions/[id]` — one remote Claude Code transcript
 * (docs/plans/remote-claude.md §4.7).
 *
 * Entries arrive in pages by `idx` and render through `@tanstack/react-virtual`
 * (MIT) with measured row heights, so a session of thousands of entries is
 * neither sent nor mounted whole. What is loaded is one contiguous window of
 * positions (`transcriptWindow.ts`): it starts at the page holding `?entry=`
 * when a search hit opened the session (§4.9), else at 0, and grows downwards
 * as its end scrolls into view and upwards on "Load earlier entries".
 *
 * Find-in-session searches the entries loaded so far, client-side, and marks
 * the query inside every rendered row (`Highlight.tsx` — still text children,
 * §2.4); `?q=` prefills it. The server-side search is the sidebar's
 * (`SessionSearch.tsx`). n / p step between prompts; `/` focuses
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
import { HighlightContext } from "./Highlight";
import {
  type EntryWindow,
  nextPage,
  pageStartFor,
  placePage,
  prevPage,
  rowForEntry,
} from "./transcriptWindow";
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
      <Skeleton key={i} variant="rounded" width={`${w}%`} height={i % 2 ? 72 : 36} />
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

/** The loaded entries: one contiguous window of positions (`transcriptWindow.ts`). */
interface Loaded extends EntryWindow {
  entries: RemoteEntryRow[];
}

type PageDir = "next" | "prev";

/** Rows whose body is hidden until expanded — what opening at a hit unfolds. */
const collapsible = (kind: RemoteEntryRow["kind"]) =>
  kind === "tool_use" || kind === "thinking" || kind === "meta";

interface TranscriptViewProps {
  id: string;
  /** `?entry=` — open at this entry (a search hit) rather than at the top. */
  entry?: number | null;
  /** `?q=` — the search that led here; prefills find and is highlighted. */
  q?: string | null;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({ id, entry = null, q = null }) => {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [data, setData] = useState<Loaded | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [firstError, setFirstError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<{ dir: PageDir; message: string } | null>(null);
  const [pageLoading, setPageLoading] = useState<PageDir | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  /** Rows toggled away from the `expandAll` default, by entry idx. */
  const [toggled, setToggled] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState(q ?? "");
  const [matchPos, setMatchPos] = useState(0);
  /**
   * The entry last jumped to by n / p / find / a search hit, outlined so the
   * eye can find it. An entry idx rather than a row position, because loading
   * an earlier page shifts every row position.
   */
  const [cursor, setCursor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  /** Bumped on every reset; a response from an older generation is dropped. */
  const genRef = useRef(0);
  /** An entry to scroll to once the rows holding it exist (a search hit). */
  const pendingRef = useRef<number | null>(null);
  /** The entry to keep at the top while an earlier page is prepended. */
  const anchorRef = useRef<number | null>(null);
  /** Set when `query` is filled from the URL, so it does not also jump. */
  const skipQueryJumpRef = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  // The header, once per session.
  useEffect(() => {
    if (!IS_DESKTOP_CLIENT) return;
    let live = true;
    setLoad({ state: "loading" });
    remoteSessionsApi.sessions
      .get(id)
      .then((detail) => live && setLoad({ state: "ready", detail }))
      .catch((error) => live && setLoad({ state: "error", message: errorMessage(error) }));
    return () => {
      live = false;
    };
  }, [id]);

  // The first window: the page holding `entry`, or the first page. A new id or
  // a new hit starts from scratch.
  useEffect(() => {
    if (!IS_DESKTOP_CLIENT) return;
    const gen = ++genRef.current;
    setData(null);
    setTotal(null);
    setFirstError(null);
    setPageError(null);
    setPageLoading(null);
    setToggled(new Set());
    setCursor(null);
    const nextQuery = q ?? "";
    if (nextQuery !== queryRef.current) {
      skipQueryJumpRef.current = entry !== null;
      setQuery(nextQuery);
    }
    pendingRef.current = entry;
    anchorRef.current = null;
    loadingRef.current = true;

    const fetchFrom = (from: number): Promise<void> =>
      remoteSessionsApi.sessions.entries(id, from, PAGE).then((page): Promise<void> | void => {
        if (gen !== genRef.current) return;
        // A link past the end (the session was re-synced shorter): start at the top.
        if (page.entries.length === 0 && from > 0) return fetchFrom(0);
        const last = page.entries[page.entries.length - 1];
        setData({ start: from, end: last ? last.idx + 1 : page.total, entries: page.entries });
        setTotal(page.total);
        const hit = entry === null ? undefined : page.entries.find((e) => e.idx === entry);
        if (hit?.kind === "thinking") setShowThinking(true);
        if (hit?.kind === "meta") setShowMeta(true);
      });
    fetchFrom(entry === null ? 0 : pageStartFor(entry, PAGE))
      .catch((error) => gen === genRef.current && setFirstError(errorMessage(error)))
      .finally(() => {
        if (gen === genRef.current) loadingRef.current = false;
      });
    // `q` is read once per hit; editing find afterwards must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entry]);

  const hasMore = Boolean(data && total !== null && data.end < total);
  const hasEarlier = Boolean(data && data.start > 0);
  const lead = hasEarlier ? 1 : 0;

  const rows = useMemo(
    () => buildRows(data?.entries ?? [], { showThinking, showMeta }),
    [data, showThinking, showMeta],
  );
  const prompts = useMemo(() => promptRowIndices(rows), [rows]);
  const matches = useMemo(() => findRows(rows, query), [rows, query]);
  const trail = hasMore || pageError?.dir === "next" ? 1 : 0;

  const virtualizer = useVirtualizer({
    count: lead + rows.length + trail,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 8,
    getItemKey: (i) =>
      i < lead ? "earlier" : i < lead + rows.length ? rows[i - lead].entry.idx : "more",
  });
  const items = virtualizer.getVirtualItems();
  /** What is on screen now, for `loadPage`, which must not re-create per scroll frame. */
  const viewRef = useRef({ items, rows, lead });
  viewRef.current = { items, rows, lead };

  /** The first row on screen, as an entry idx. */
  const firstVisibleEntry = (): number | null => {
    const v = viewRef.current;
    const first = v.items.find((it) => it.index >= v.lead && it.index < v.lead + v.rows.length);
    return first ? v.rows[first.index - v.lead].entry.idx : null;
  };

  const loadPage = useCallback((dir: PageDir) => {
    if (loadingRef.current || !data || total === null) return;
    const req = dir === "next" ? nextPage(data, total, PAGE) : prevPage(data, PAGE);
    if (!req) return;
    const gen = genRef.current;
    if (dir === "prev") anchorRef.current = firstVisibleEntry() ?? data.entries[0]?.idx ?? null;
    loadingRef.current = true;
    setPageLoading(dir);
    setPageError(null);
    remoteSessionsApi.sessions
      .entries(id, req.from, req.limit)
      .then((page) => {
        if (gen !== genRef.current) return;
        setData((prev) => {
          if (!prev) return prev;
          const place = placePage(prev, req);
          if (place === "append") {
            const last = page.entries[page.entries.length - 1];
            return { ...prev, end: last ? last.idx + 1 : page.total, entries: [...prev.entries, ...page.entries] };
          }
          if (place === "prepend") {
            return { ...prev, start: req.from, entries: [...page.entries, ...prev.entries] };
          }
          return prev;
        });
        setTotal(page.total);
      })
      .catch((error) => gen === genRef.current && setPageError({ dir, message: errorMessage(error) }))
      .finally(() => {
        if (gen !== genRef.current) return;
        loadingRef.current = false;
        setPageLoading(null);
      });
  }, [data, total, id]);

  // The bottom sentinel is in view: fetch the next page.
  const lastItem = items[items.length - 1];
  useEffect(() => {
    if (lastItem && lastItem.index >= lead + rows.length && !pageError) loadPage("next");
  }, [lastItem, lead, rows.length, loadPage, pageError]);

  // Once the rows exist: scroll to a search hit (unfolding its row), or keep
  // the anchored row in place after an earlier page was prepended.
  const listReady = load.state === "ready";
  useEffect(() => {
    // The list mounts only once the header is in; scrolling before that has no
    // content to scroll.
    if (rows.length === 0 || !listReady) return;
    const target = pendingRef.current;
    if (target !== null) {
      const ri = rowForEntry(rows, target);
      if (ri < 0) return;
      pendingRef.current = null;
      const row = rows[ri];
      if (collapsible(row.entry.kind)) {
        setToggled((prev) => (expandAll ? prev : new Set(prev).add(row.entry.idx)));
      }
      setCursor(row.entry.idx);
      const mi = matches.indexOf(ri);
      if (mi >= 0) setMatchPos(mi);
      requestAnimationFrame(() => virtualizer.scrollToIndex(ri + lead, { align: "center" }));
      return;
    }
    const anchor = anchorRef.current;
    if (anchor !== null) {
      anchorRef.current = null;
      const ri = rowForEntry(rows, anchor);
      if (ri >= 0) virtualizer.scrollToIndex(ri + lead, { align: "start" });
    }
    // Only when the rows change; `matches` and `lead` are read alongside them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, listReady]);

  const jumpTo = useCallback((rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;
    setCursor(row.entry.idx);
    virtualizer.scrollToIndex(rowIndex + lead, { align: "start" });
  }, [rows, lead, virtualizer]);

  const stepPrompt = useCallback((dir: 1 | -1) => {
    const top = Math.max(0, (items[0]?.index ?? 0) - lead);
    const from = cursor !== null ? rowForEntry(rows, cursor) : dir === 1 ? top - 1 : top;
    const next = stepIndex(prompts, from, dir);
    if (next !== null) jumpTo(next);
    else if (dir === 1 && hasMore) loadPage("next");
    else if (dir === -1 && hasEarlier) loadPage("prev");
  }, [cursor, items, lead, rows, prompts, jumpTo, hasMore, hasEarlier, loadPage]);

  const stepMatch = useCallback((dir: 1 | -1) => {
    if (matches.length === 0) return;
    const pos = (matchPos + dir + matches.length) % matches.length;
    setMatchPos(pos);
    jumpTo(matches[pos]);
  }, [matches, matchPos, jumpTo]);

  // A new query starts at its first match — unless it came with a hit, which
  // has already said where to go.
  useEffect(() => {
    if (skipQueryJumpRef.current) {
      skipQueryJumpRef.current = false;
      return;
    }
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

  const failure = load.state === "error" ? load.message : firstError;
  if (failure) {
    return (
      <Box sx={{ py: 3, maxWidth: 820, mx: "auto", width: "100%" }}>
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {failure}
        </Alert>
        <Button component={RouterLink} href="/sessions" sx={{ mt: 2 }}>Back to sessions</Button>
      </Box>
    );
  }

  const detail = load.state === "ready" ? load.detail : null;
  const loaded = data?.entries.length ?? 0;
  const partial = hasMore || hasEarlier;
  const highlight = query.trim();

  const pageAlert = (dir: PageDir) =>
    pageError?.dir === dir && (
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => setPageError(null)}>Retry</Button>}
        sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {pageError.message}
      </Alert>
    );

  const renderItem = (index: number): React.ReactNode => {
    if (index < lead) {
      return pageAlert("prev") || (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button
            size="small"
            onClick={() => loadPage("prev")}
            disabled={pageLoading !== null}
            startIcon={<ChevronUp size={ICON_SIZE.inline} />}
            aria-busy={pageLoading === "prev"}
          >
            {pageLoading === "prev"
              ? "Loading earlier entries…"
              : `Load earlier entries (${data?.start ?? 0} before this)`}
          </Button>
        </Box>
      );
    }
    const row = rows[index - lead];
    if (row) {
      const current = cursor !== null && (row.entry.idx === cursor || row.result?.idx === cursor);
      return (
        <Box
          sx={{
            borderRadius: 2,
            ...(current && {
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
            subagents={detail?.subagents ?? []}
          />
        </Box>
      );
    }
    return pageAlert("next") || (
      <Box aria-busy={pageLoading === "next"} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Skeleton variant="rounded" height={36} />
        <Typography variant="micro" component="p" color="text.secondary" sx={{ textAlign: "center" }}>
          Loading entries {(data?.end ?? 0) + 1}–{Math.min((data?.end ?? 0) + PAGE, total ?? 0)} of {total}
        </Typography>
      </Box>
    );
  };

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
            n / p: next / previous prompt{partial ? " · find searches what is loaded" : ""}
          </Typography>
        </Box>
      </Box>

      {/* Entries */}
      <Box
        ref={scrollRef}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid", borderColor: "divider" }}
      >
        <Box sx={{ maxWidth: 900, mx: "auto", width: "100%" }}>
          {!detail || !data
            ? <SkeletonRows />
            : rows.length === 0 && !partial
            ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                {loaded === 0
                  ? "This transcript has no messages yet."
                  : "Everything here is thinking or meta — turn those on above to see it."}
              </Typography>
            )
            : (
              <HighlightContext.Provider value={highlight}>
                <Box sx={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {items.map((item) => (
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
                      {renderItem(item.index)}
                    </Box>
                  ))}
                </Box>
              </HighlightContext.Provider>
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default TranscriptView;
