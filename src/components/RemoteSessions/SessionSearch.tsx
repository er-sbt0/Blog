"use client";
/**
 * The Sessions sidebar's "Search transcripts" mode (docs/plans/remote-claude.md
 * §4.9): a debounced full-text query against every synced transcript, narrowed
 * by host, kind and thinking, with hits grouped under their session. Clicking a
 * hit opens the session at that entry with the query found.
 *
 * Presented like the sidebar's own Search view (`SideBar/SidebarSearchView`):
 * flat rows, a meta count under the box, mono paths. A snippet is transcript
 * bytes, so it renders through `Highlight.tsx`'s `Snippet` — text children
 * only (§2.4) — and `__tests__/TranscriptEntry.test.tsx` pins that.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, Skeleton, Typography } from "@mui/material";
import { Bot, MessageSquare } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT, SB_FONT, SB_ITEM_RADIUS } from "@/components/Layout/SideBar/constants";
import { SafeNavigationLink } from "@/components/Layout/SideBar/SafeNavigationLink";
import { errorMessage, remoteSessionsApi } from "@/api/remoteSessions";
import type { EntryKind } from "@/lib/claudeSessions/parse";
import {
  type RemoteHostSummary,
  type RemoteSearchResult,
  SEARCH_MAX_HITS,
} from "@/lib/claudeSessions/types";
import {
  debounce,
  groupHits,
  type HitGroup,
  hitHref,
  hitLabel,
  projectLabel,
  SEARCH_DEBOUNCE_MS,
  SEARCH_KINDS,
  type SearchParams,
  searchGate,
} from "./searchModel";
import { Snippet } from "./Highlight";
import { relativeTime } from "./SessionBits";

type SearchState =
  | { state: "idle" }
  | { state: "short"; hint: string }
  | { state: "loading"; previous: RemoteSearchResult | null }
  | { state: "ready"; result: RemoteSearchResult; q: string }
  | { state: "error"; message: string };

const rowSx = {
  display: "block",
  textDecoration: "none",
  color: "inherit",
  px: 1,
  py: 0.5,
  borderRadius: SB_ITEM_RADIUS,
  "&:hover": { bgcolor: "action.hover" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "-2px" },
} as const;

/** One session's hits. Exported for the security spec. */
export const SearchHitGroup: React.FC<{ group: HitGroup; q: string; activeId?: string | null }> = (
  { group, q, activeId },
) => {
  const Icon = group.isSubagent ? Bot : MessageSquare;
  const title = group.title ?? (group.isSubagent ? "Untitled subagent run" : "Untitled session");
  return (
    <Box component="li" sx={{ listStyle: "none", mb: 0.75 }}>
      <Box sx={{ px: 1, pt: 0.5, display: "flex", alignItems: "center", gap: 0.75 }}>
        <Icon size={ICON_SIZE.inline} aria-hidden style={{ color: "var(--mui-palette-text-secondary)", flexShrink: 0 }} />
        <Typography
          component="h3"
          noWrap
          title={title}
          sx={{ fontSize: SB_FONT.body, fontWeight: 500, color: "text.primary", minWidth: 0 }}
        >
          {title}
        </Typography>
      </Box>
      <Typography
        component="p"
        noWrap
        title={group.cwd ?? group.projectDir}
        sx={{ pl: "30px", pr: 1, fontSize: SB_FONT.meta, fontFamily: MONO_FONT, color: "text.disabled" }}
      >
        {projectLabel(group.cwd, group.projectDir)} · {relativeTime(group.endedAt, "no activity")}
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, pl: "22px" }}>
        {group.hits.map((hit) => (
          <Box component="li" key={hit.idx} sx={{ listStyle: "none" }}>
            <Box
              component={SafeNavigationLink}
              href={hitHref(hit, q)}
              aria-current={activeId === hit.sessionId ? "page" : undefined}
              sx={rowSx}
            >
              <Typography
                component="span"
                sx={{ display: "block", fontSize: SB_FONT.meta, color: "text.secondary" }}
              >
                {hitLabel(hit)}
              </Typography>
              <Typography
                component="span"
                sx={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  fontSize: SB_FONT.meta,
                  fontFamily: MONO_FONT,
                  color: "text.primary",
                  wordBreak: "break-word",
                }}
              >
                <Snippet text={hit.snippet} start={hit.matchStart} length={hit.matchLength} />
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const FilterChip: React.FC<{ label: string; selected: boolean; onClick: () => void }> = (
  { label, selected, onClick },
) => (
  <Chip
    size="small"
    label={label}
    clickable
    onClick={onClick}
    aria-pressed={selected}
    color={selected ? "primary" : "default"}
    variant={selected ? "filled" : "outlined"}
    sx={{ fontSize: SB_FONT.meta, height: "auto", "& .MuiChip-label": { px: 0.75, py: 0.125 } }}
  />
);

const Note: React.FC<{ children: React.ReactNode; role?: string }> = ({ children, role }) => (
  <Typography
    component="p"
    role={role}
    sx={{ fontSize: SB_FONT.meta, color: "text.secondary", px: 2, py: 2, textAlign: "center" }}
  >
    {children}
  </Typography>
);

export const SessionSearch: React.FC<{
  query: string;
  hosts: RemoteHostSummary[];
  activeId: string | null;
}> = ({ query, hosts, activeId }) => {
  const [hostId, setHostId] = useState<string | null>(null);
  const [kinds, setKinds] = useState<EntryKind[]>([]);
  const [thinking, setThinking] = useState(false);
  const [search, setSearch] = useState<SearchState>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = useMemo(
    () =>
      debounce((params: SearchParams) => {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        remoteSessionsApi
          .search(params, ctl.signal)
          .then((result) => !ctl.signal.aborted && setSearch({ state: "ready", result, q: params.q }))
          .catch((error) => !ctl.signal.aborted && setSearch({ state: "error", message: errorMessage(error) }));
      }, SEARCH_DEBOUNCE_MS),
    [],
  );

  useEffect(() => () => {
    run.cancel();
    abortRef.current?.abort();
  }, [run]);

  // A host that has since been removed stops filtering.
  const effectiveHost = hostId && hosts.some((h) => h.id === hostId) ? hostId : null;

  useEffect(() => {
    const gate = searchGate(query);
    if (gate.state !== "ready") {
      run.cancel();
      abortRef.current?.abort();
      setSearch(gate);
      return;
    }
    setSearch((prev) => ({
      state: "loading",
      previous: prev.state === "ready" ? prev.result : prev.state === "loading" ? prev.previous : null,
    }));
    run({ q: gate.q, hostId: effectiveHost, kinds, thinking });
  }, [query, effectiveHost, kinds, thinking, run]);

  const toggleKind = (k: EntryKind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const shown = search.state === "ready"
    ? search.result
    : search.state === "loading"
    ? search.previous
    : null;
  const groups = useMemo(() => (shown ? groupHits(shown.hits) : []), [shown]);
  const q = search.state === "ready" ? search.q : query.trim();

  let body: React.ReactNode;
  if (search.state === "idle") {
    body = <Note>Search every synced transcript — prompts, replies, commands, file paths and tool output.</Note>;
  } else if (search.state === "short") {
    body = <Note role="status">{search.hint}</Note>;
  } else if (search.state === "error") {
    body = (
      <Box sx={{ px: 1.5, py: 1 }}>
        <Alert severity="error" sx={{ fontSize: SB_FONT.meta, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {search.message}
        </Alert>
      </Box>
    );
  } else if (search.state === "loading" && !shown) {
    body = (
      <Box sx={{ px: 2, py: 1, display: "flex", flexDirection: "column", gap: 1 }} aria-busy>
        {[0.6, 0.9, 0.8, 0.5, 0.85].map((w, i) => <Skeleton key={i} variant="text" width={`${w * 100}%`} />)}
      </Box>
    );
  } else if (groups.length === 0) {
    body = <Note role="status">No matches</Note>;
  } else {
    body = (
      <Box
        component="ul"
        aria-label="Search results"
        aria-busy={search.state === "loading"}
        sx={{
          m: 0,
          p: 0,
          px: 0.5,
          opacity: search.state === "loading" ? 0.6 : 1,
          transition: "opacity 120ms",
        }}
      >
        {groups.map((g) => <SearchHitGroup key={g.sessionId} group={g} q={q} activeId={activeId} />)}
      </Box>
    );
  }

  const count = shown?.hits.length ?? 0;
  const sessions = groups.length;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box
        role="group"
        aria-label="Search filters"
        sx={{ px: 1.5, pb: 1, display: "flex", flexWrap: "wrap", gap: 0.5, flexShrink: 0 }}
      >
        {hosts.length > 1 && (
          <>
            <FilterChip label="All hosts" selected={effectiveHost === null} onClick={() => setHostId(null)} />
            {hosts.map((h) => (
              <FilterChip
                key={h.id}
                label={h.label}
                selected={effectiveHost === h.id}
                onClick={() => setHostId(effectiveHost === h.id ? null : h.id)}
              />
            ))}
            <Box sx={{ flexBasis: "100%", height: 0 }} />
          </>
        )}
        {SEARCH_KINDS.map(({ kind, label }) => (
          <FilterChip key={kind} label={label} selected={kinds.includes(kind)} onClick={() => toggleKind(kind)} />
        ))}
        <FilterChip label="Thinking" selected={thinking} onClick={() => setThinking((v) => !v)} />
      </Box>
      {shown && (
        <Typography
          component="p"
          aria-live="polite"
          sx={{ px: 2, pb: 0.75, fontSize: SB_FONT.meta, color: "text.secondary", flexShrink: 0 }}
        >
          {shown.truncated
            ? `Showing first ${SEARCH_MAX_HITS.toLocaleString("en-US")} matches`
            : `${count} ${count === 1 ? "match" : "matches"}`} in {sessions} {sessions === 1 ? "session" : "sessions"}
        </Typography>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>{body}</Box>
    </Box>
  );
};

export default SessionSearch;
