"use client";
/**
 * The `/sessions` stats dashboard (docs/plans/remote-claude.md §4.10): every
 * number `report.py` shows, from `GET /api/remote-sessions/stats`.
 *
 * Charts are drawn as MUI boxes rather than with `@mui/x-charts`. Every chart
 * here is one series of counts, so the form is a plain column or bar in one
 * hue, and drawing it with `sx` keeps that hue a palette token —
 * `primary.main` through the CSS variables — which changes with `html.dark`
 * (DESIGN.md §19). x-charts takes its colours as JS values, and
 * `theme.palette.*` there is the light value baked into both schemes (§2).
 *
 * Following the dataviz rules: one hue for magnitude, bars ≤ 24px with a 4px
 * rounded data end and a 2px gap, a hairline baseline, the peak labelled and
 * nothing else, text in text tokens. Each column is its own hover target and
 * shows its value on hover and on keyboard focus (one tab stop per chart,
 * arrow keys between columns); its `aria-label` carries the same value, so the
 * tooltip never gates it. The per-project table is the table view.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { BarChart3 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { errorMessage, remoteSessionsApi, viewerTimeZone } from "@/api/remoteSessions";
import type { RemoteHostSummary, RemoteStats } from "@/lib/claudeSessions/types";
import { formatDuration } from "./transcriptModel";
import {
  barFractions,
  compactNumber,
  dayTicks,
  formatDay,
  formatHour,
  HOUR_TICKS,
  hourRange,
  peakIndex,
  statsEmpty,
  topTools,
} from "./statsModel";
import { absoluteTime, relativeTime } from "./SessionBits";

const tabular = { fontVariantNumeric: "tabular-nums" } as const;

// ─── Stat tiles ────────────────────────────────────────────────────────────

const StatTile: React.FC<{ label: string; value: string; hint?: string; title?: string }> = (
  { label, value, hint, title },
) => (
  <Card variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
    <Typography variant="micro" component="h3" color="text.secondary">{label}</Typography>
    <Tooltip title={title ?? ""}>
      <Typography variant="h5" component="p" noWrap>{value}</Typography>
    </Tooltip>
    {hint && <Typography variant="micro" component="p" color="text.secondary" noWrap>{hint}</Typography>}
  </Card>
);

const plural = (n: number, one: string, many = `${one}s`) => `${compactNumber(n)} ${n === 1 ? one : many}`;

const shortDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

// ─── Column chart ──────────────────────────────────────────────────────────

interface ColumnChartProps {
  values: readonly number[];
  /** Spoken and shown for column `i`: what it covers. */
  labelOf: (i: number) => string;
  /** The value with its unit, e.g. "3 sessions". */
  valueOf: (v: number) => string;
  ticks: { index: number; label: string }[];
  ariaLabel: string;
  height?: number;
}

const ColumnChart: React.FC<ColumnChartProps> = ({ values, labelOf, valueOf, ticks, ariaLabel, height = 96 }) => {
  const fractions = barFractions(values);
  const peak = peakIndex(values);
  const [focus, setFocus] = useState(() => peak ?? Math.max(0, values.length - 1));
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const n = values.length;
  const active = Math.min(focus, Math.max(0, n - 1));

  const move = (to: number) => {
    const i = Math.max(0, Math.min(n - 1, to));
    setFocus(i);
    refs.current[i]?.focus();
  };

  return (
    <Box>
      <Box
        role="list"
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
          if (step) move(active + step);
          else if (e.key === "Home") move(0);
          else if (e.key === "End") move(n - 1);
          else return;
          e.preventDefault();
        }}
        sx={{
          height,
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        {values.map((v, i) => (
          <Tooltip
            key={i}
            placement="top"
            title={
              <>
                <Box component="strong" sx={{ display: "block" }}>{valueOf(v)}</Box>
                {labelOf(i)}
              </>
            }
          >
            <Box
              role="listitem"
              ref={(el: HTMLDivElement | null) => {
                refs.current[i] = el;
              }}
              tabIndex={i === active ? 0 : -1}
              aria-label={`${labelOf(i)}: ${valueOf(v)}`}
              onFocus={() => setFocus(i)}
              sx={{
                flex: 1,
                minWidth: 0,
                px: "1px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
                borderRadius: "4px 4px 0 0",
                outline: "none",
                "&:hover, &:focus-visible": { bgcolor: "action.hover" },
                "&:focus-visible": { boxShadow: "inset 0 0 0 2px var(--mui-palette-primary-main)" },
              }}
            >
              {i === peak && (
                <Typography variant="micro" component="span" color="text.secondary" aria-hidden sx={{ ...tabular, lineHeight: 1.2, mb: 0.25 }}>
                  {compactNumber(v)}
                </Typography>
              )}
              <Box
                aria-hidden
                sx={{
                  width: "100%",
                  maxWidth: 24,
                  // 80% at the peak leaves the peak's label room above it.
                  height: `${fractions[i] * 80}%`,
                  bgcolor: "primary.main",
                  borderRadius: "4px 4px 0 0",
                }}
              />
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Box aria-hidden sx={{ position: "relative", height: 18, mt: 0.5 }}>
        {ticks.map(({ index, label }) => {
          const edge = index === 0 ? "start" : index === n - 1 ? "end" : "mid";
          return (
            <Typography
              key={index}
              variant="micro"
              component="span"
              color="text.secondary"
              sx={{
                ...tabular,
                position: "absolute",
                whiteSpace: "nowrap",
                ...(edge === "start" && { left: 0 }),
                ...(edge === "end" && { right: 0 }),
                ...(edge === "mid" && {
                  left: `${((index + 0.5) / n) * 100}%`,
                  transform: "translateX(-50%)",
                }),
              }}
            >
              {label}
            </Typography>
          );
        })}
      </Box>
    </Box>
  );
};

// ─── Tool bars ─────────────────────────────────────────────────────────────

const ToolBars: React.FC<{ tools: RemoteStats["tools"] }> = ({ tools }) => {
  const rows = topTools(tools);
  const fractions = barFractions(rows.map((r) => r.count));
  if (rows.length === 0) {
    return <Typography variant="body2" color="text.secondary">No tool calls yet.</Typography>;
  }
  return (
    <Box
      component="ul"
      aria-label="Tool calls by tool"
      sx={{ m: 0, p: 0, display: "grid", gridTemplateColumns: "minmax(0, 9rem) 1fr auto", columnGap: 1.5, rowGap: 0.5 }}
    >
      {rows.map((r, i) => (
        <Box
          component="li"
          key={r.name}
          aria-label={`${r.name}: ${r.count} calls`}
          sx={{ display: "contents", listStyle: "none" }}
        >
          <Typography
            variant="dense"
            noWrap
            title={r.name}
            sx={{ fontFamily: r.other ? undefined : MONO_FONT, color: r.other ? "text.secondary" : "text.primary" }}
          >
            {r.name}
          </Typography>
          <Box aria-hidden sx={{ display: "flex", alignItems: "center" }}>
            <Box
              sx={{
                height: 12,
                width: `${fractions[i] * 100}%`,
                minWidth: r.count > 0 ? 2 : 0,
                bgcolor: r.other ? "text.disabled" : "primary.main",
                borderRadius: "0 4px 4px 0",
              }}
            />
          </Box>
          <Typography variant="dense" color="text.secondary" sx={{ ...tabular, textAlign: "right" }}>
            {compactNumber(r.count)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── Per-project table ─────────────────────────────────────────────────────

const ProjectTable: React.FC<{ rows: RemoteStats["perProject"]; hostLabel: (id: string) => string | null }> = (
  { rows, hostLabel },
) => {
  if (rows.length === 0) {
    return <Typography variant="body2" color="text.secondary">No projects yet.</Typography>;
  }
  const num = { ...tabular, textAlign: "right" as const, whiteSpace: "nowrap" as const };
  return (
    <TableContainer>
      <Table size="small" aria-label="Activity by project">
        <TableHead>
          <TableRow>
            <TableCell>Project</TableCell>
            <TableCell sx={num}>Sessions</TableCell>
            <TableCell sx={num}>Subagent runs</TableCell>
            <TableCell sx={num}>Prompts</TableCell>
            <TableCell sx={num}>Tool calls</TableCell>
            <TableCell sx={num}>Active</TableCell>
            <TableCell sx={num}>Last</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p) => {
            const host = hostLabel(p.hostId);
            return (
              <TableRow key={`${p.hostId}:${p.projectDir}`}>
                <TableCell sx={{ maxWidth: 320 }}>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, minWidth: 0 }}>
                    <Typography
                      variant="dense"
                      noWrap
                      title={p.cwd ?? p.projectDir}
                      sx={{ fontFamily: MONO_FONT, fontStyle: p.cwdGuessed ? "italic" : "normal", minWidth: 0 }}
                    >
                      {p.cwd ?? p.projectDir}
                    </Typography>
                    {p.cwdGuessed && (
                      <Tooltip title="Guessed from the directory name — no event recorded the real path">
                        <Typography variant="micro" component="span" color="text.secondary" sx={{ flexShrink: 0 }}>
                          guessed
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>
                  {host && <Typography variant="micro" component="p" color="text.secondary">{host}</Typography>}
                </TableCell>
                <TableCell sx={num}>{compactNumber(p.sessions)}</TableCell>
                <TableCell sx={num}>{compactNumber(p.subagentRuns)}</TableCell>
                <TableCell sx={num}>{compactNumber(p.userMsgs)}</TableCell>
                <TableCell sx={num}>{compactNumber(p.toolCalls)}</TableCell>
                <TableCell sx={num}>{formatDuration(p.activeMs)}</TableCell>
                <TableCell sx={num}>
                  <Tooltip title={absoluteTime(p.last)}>
                    <span>{relativeTime(p.last, "—")}</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ─── Dashboard ─────────────────────────────────────────────────────────────

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = (
  { title, subtitle, children },
) => (
  <Card variant="outlined" component="section" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
    <Box>
      <Typography variant="subtitle2" component="h3">{title}</Typography>
      {subtitle && <Typography variant="micro" component="p" color="text.secondary">{subtitle}</Typography>}
    </Box>
    {children}
  </Card>
);

const tileGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 1.5,
} as const;

const chartGrid = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
  gap: 1.5,
} as const;

const DashboardSkeleton = () => (
  <Box aria-busy sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <Box sx={tileGrid}>
      {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" height={76} />)}
    </Box>
    <Box sx={chartGrid}>
      <Skeleton variant="rounded" height={170} />
      <Skeleton variant="rounded" height={170} />
    </Box>
    <Skeleton variant="rounded" height={220} />
  </Box>
);

type Load =
  | { state: "loading"; previous: RemoteStats | null }
  | { state: "ready"; stats: RemoteStats }
  | { state: "error"; message: string };

export const StatsDashboard: React.FC<{
  hosts: RemoteHostSummary[];
  /** Changes when a host finishes a sync, to refetch the stats with it. */
  refreshKey?: unknown;
}> = ({ hosts, refreshKey }) => {
  const [hostId, setHostId] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading", previous: null });
  const [attempt, setAttempt] = useState(0);
  const effectiveHost = hostId && hosts.some((h) => h.id === hostId) ? hostId : null;

  useEffect(() => {
    const ctl = new AbortController();
    setLoad((prev) => ({
      state: "loading",
      previous: prev.state === "ready" ? prev.stats : prev.state === "loading" ? prev.previous : null,
    }));
    remoteSessionsApi
      .stats(effectiveHost, ctl.signal)
      .then((stats) => !ctl.signal.aborted && setLoad({ state: "ready", stats }))
      .catch((error) => !ctl.signal.aborted && setLoad({ state: "error", message: errorMessage(error) }));
    return () => ctl.abort();
  }, [effectiveHost, refreshKey, attempt]);

  const stats = load.state === "ready" ? load.stats : load.state === "loading" ? load.previous : null;
  const hostLabel = (id: string) =>
    hosts.length > 1 && !effectiveHost ? hosts.find((h) => h.id === id)?.label ?? null : null;

  let body: React.ReactNode;
  if (load.state === "error") {
    body = (
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}
        sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {load.message}
      </Alert>
    );
  } else if (!stats) {
    body = <DashboardSkeleton />;
  } else if (statsEmpty(stats)) {
    body = (
      <Box
        role="status"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          py: 5,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          color: "text.secondary",
          textAlign: "center",
        }}
      >
        <BarChart3 size={ICON_SIZE.large} strokeWidth={1.5} aria-hidden />
        <Typography variant="body2">Sync a host to see stats.</Typography>
      </Box>
    );
  } else {
    const t = stats.totals;
    const daySessions = stats.perDay.map((d) => d.sessions);
    const last30 = daySessions.reduce((a, b) => a + b, 0);
    const prompts24 = stats.byHour.reduce((a, b) => a + b, 0);
    body = (
      <Box
        aria-busy={load.state === "loading"}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          opacity: load.state === "loading" ? 0.6 : 1,
          transition: "opacity 120ms",
        }}
      >
        <Box sx={tileGrid}>
          <StatTile
            label="Sessions"
            value={compactNumber(t.sessions)}
            hint={`${plural(t.projects, "project")} · ${plural(t.hosts, "host")}`}
          />
          <StatTile label="Subagent runs" value={compactNumber(t.subagentRuns)} />
          <StatTile label="Prompts" value={compactNumber(t.userMsgs)} />
          <StatTile label="Assistant messages" value={compactNumber(t.assistantMsgs)} />
          <StatTile label="Tool calls" value={compactNumber(t.toolCalls)} />
          <StatTile label="Active time" value={formatDuration(t.activeMs)} hint="5-minute idle gap" />
          <StatTile label="First" value={shortDate(t.first)} title={absoluteTime(t.first)} />
          <StatTile label="Last" value={relativeTime(t.last, "—")} title={absoluteTime(t.last)} />
        </Box>

        <Box sx={chartGrid}>
          <ChartCard title="Sessions per day" subtitle={`Last 30 days · ${plural(last30, "session")}`}>
            <ColumnChart
              values={daySessions}
              labelOf={(i) => formatDay(stats.perDay[i]?.day ?? "")}
              valueOf={(v) => plural(v, "session")}
              ticks={dayTicks(daySessions.length).map((i) => ({ index: i, label: formatDay(stats.perDay[i].day) }))}
              ariaLabel="Sessions per day, last 30 days"
            />
          </ChartCard>
          <ChartCard title="Prompts by hour" subtitle={`${viewerTimeZone()} · ${plural(prompts24, "prompt")}`}>
            <ColumnChart
              values={stats.byHour}
              labelOf={hourRange}
              valueOf={(v) => plural(v, "prompt")}
              ticks={HOUR_TICKS.map((h) => ({ index: h, label: formatHour(h) }))}
              ariaLabel="Prompts by hour of day"
            />
          </ChartCard>
        </Box>

        <ChartCard title="Tool calls by tool" subtitle={plural(t.toolCalls, "call")}>
          <ToolBars tools={stats.tools} />
        </ChartCard>

        <ChartCard title="By project">
          <ProjectTable rows={stats.perProject} hostLabel={hostLabel} />
        </ChartCard>
      </Box>
    );
  }

  return (
    <Box component="section" aria-labelledby="sessions-stats-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography id="sessions-stats-heading" variant="h6" component="h2">Activity</Typography>
        {hosts.length > 1 && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={effectiveHost ?? "all"}
            onChange={(_, v: string | null) => v !== null && setHostId(v === "all" ? null : v)}
            aria-label="Host"
          >
            <ToggleButton value="all" sx={{ py: 0.25, typography: "dense" }}>All hosts</ToggleButton>
            {hosts.map((h) => (
              <ToggleButton key={h.id} value={h.id} sx={{ py: 0.25, typography: "dense" }}>{h.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      </Box>
      {body}
    </Box>
  );
};

export default StatsDashboard;
