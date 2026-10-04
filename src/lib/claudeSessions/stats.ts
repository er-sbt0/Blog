/**
 * The shaping half of the sessions dashboard (docs/plans/remote-claude.md
 * §4.10): which time zone, which 30 days, and zero-filling what SQL grouped.
 * Import-free so a spec pins it; the repository runs the aggregates.
 */
import type { Parsed } from "./search";

export const STATS_DAYS = 30;

/**
 * IANA names only. An offset such as `+05:00` is refused even though `Intl`
 * accepts it, because Postgres reads a bare offset in `AT TIME ZONE` with the
 * POSIX sign — the opposite of what the viewer meant.
 */
const ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

export function isValidTimeZone(tz: string): boolean {
  if (tz.length > 64 || !ZONE_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface StatsParams {
  hostId: string | null;
  tz: string;
}

/** `?host=&tz=` → validated parameters. `host` ownership is `requireRemoteHost`'s. */
export function parseStatsParams(sp: URLSearchParams): Parsed<StatsParams> {
  const tz = sp.get("tz") || "UTC";
  if (!isValidTimeZone(tz)) {
    return { ok: false, error: "tz must be an IANA time zone, such as Europe/London" };
  }
  return { ok: true, value: { hostId: sp.get("host") || null, tz } };
}

/** `YYYY-MM-DD` of an instant, in `tz`. */
export function dayInZone(at: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The `n` calendar days ending on `today` (`YYYY-MM-DD`), oldest first. */
export function lastNDays(today: string, n = STATS_DAYS): string[] {
  // Calendar arithmetic on a UTC midnight, so no zone's DST can skip a day.
  const end = Date.parse(`${today}T00:00:00Z`);
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

/** Grouped `(day, sessions)` rows → every day of `days`, zero where SQL had none. */
export function fillDays(
  days: string[],
  rows: { day: string; sessions: number }[],
): { day: string; sessions: number }[] {
  const by = new Map(rows.map((r) => [r.day, r.sessions]));
  return days.map((day) => ({ day, sessions: by.get(day) ?? 0 }));
}

/** Grouped `(hour, count)` rows → 24 buckets, index = hour of day. */
export function fillHours(rows: { hour: number; count: number }[]): number[] {
  const out = new Array<number>(24).fill(0);
  for (const r of rows) {
    if (Number.isInteger(r.hour) && r.hour >= 0 && r.hour < 24) out[r.hour] += r.count;
  }
  return out;
}
