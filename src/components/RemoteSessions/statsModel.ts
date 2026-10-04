/**
 * The `/sessions` dashboard's arithmetic and labels, without React
 * (docs/plans/remote-claude.md §4.10). Import-free (type imports are erased).
 */
import type { RemoteStats } from "@/lib/claudeSessions/types";

/** How many tools the breakdown names before folding the rest into "Other". */
export const TOP_TOOLS = 10;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `"2026-10-04"` → `"Oct 4"`. The server has already bucketed by the viewer's
 * zone, so this is read as a calendar date — never through `new Date`, which
 * would shift it by the local offset. Anything else comes back unchanged.
 */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : day;
}

/** `9` → `"09:00"`. */
export const formatHour = (h: number): string => `${String(h).padStart(2, "0")}:00`;

/** `9` → `"09:00–10:00"`, the bucket a bar covers. */
export const hourRange = (h: number): string => `${formatHour(h)}–${formatHour((h + 1) % 24)}`;

/** `1284` → `"1,284"`; from 10,000 up, `12.9K` / `4.2M`. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim1(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim1(n / 1_000)}K`;
  return Math.round(n).toLocaleString("en-US");
}
const trim1 = (v: number) => v.toFixed(1).replace(/\.0$/, "");

/** Each value as a fraction of the largest, 0 when everything is 0. */
export function barFractions(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** The first index holding the largest value, or null when all are 0. */
export function peakIndex(values: readonly number[]): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v > 0 && (best === null || v > values[best])) best = i;
  });
  return best;
}

/**
 * The `n` most-used tools, plus one "Other" row summing the rest when there
 * is a rest — never a generated (n+1)th row of its own.
 */
export function topTools(
  tools: RemoteStats["tools"],
  n = TOP_TOOLS,
): { name: string; count: number; other?: boolean }[] {
  const sorted = [...tools].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n).reduce((sum, t) => sum + t.count, 0);
  return [...sorted.slice(0, n), { name: `Other (${sorted.length - n})`, count: rest, other: true }];
}

/** Nothing has been synced (or nothing matched the host filter). */
export const statsEmpty = (s: RemoteStats): boolean =>
  s.totals.sessions === 0 && s.totals.subagentRuns === 0;

/** Which day labels the 30-day axis shows: first, middle, last. */
export function dayTicks(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  return [...new Set([0, Math.floor((count - 1) / 2), count - 1])];
}

/** Hour-axis ticks: every six hours. */
export const HOUR_TICKS = [0, 6, 12, 18];
