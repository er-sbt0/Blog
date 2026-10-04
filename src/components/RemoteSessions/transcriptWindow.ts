/**
 * Which part of a transcript is loaded, and which page comes next in either
 * direction (docs/plans/remote-claude.md §4.7, §4.9). Opening a session at a
 * search hit starts at the page holding that entry rather than at 0, so the
 * loaded entries are one contiguous window `[start, end)` of positions that
 * grows at either edge — never two islands, which is what keeps tool results
 * folding into their calls and n / p stepping in transcript order.
 *
 * Import-free (type imports are erased).
 */
import type { TranscriptRow } from "./transcriptModel";

export interface EntryWindow {
  /** Position of the first loaded entry. */
  start: number;
  /** One past the last loaded entry. */
  end: number;
}

export interface PageRequest {
  from: number;
  limit: number;
}

/** The page boundary at or below `idx`. Bad input starts at 0. */
export function pageStartFor(idx: number, pageSize: number): number {
  if (!Number.isFinite(idx) || idx <= 0 || pageSize <= 0) return 0;
  return Math.floor(idx / pageSize) * pageSize;
}

/** The page after the window, or null when it already reaches `total`. */
export function nextPage(w: EntryWindow, total: number, pageSize: number): PageRequest | null {
  if (w.end >= total) return null;
  return { from: w.end, limit: pageSize };
}

/**
 * The page before the window, ending exactly at `start` so the two never
 * overlap — or null at the top.
 */
export function prevPage(w: EntryWindow, pageSize: number): PageRequest | null {
  if (w.start <= 0) return null;
  const from = Math.max(0, w.start - pageSize);
  return { from, limit: w.start - from };
}

/**
 * Where a fetched page goes: after the window, before it, or nowhere (a
 * response for a window that has since moved on, which is dropped rather than
 * leaving a hole).
 */
export function placePage(w: EntryWindow, req: PageRequest): "append" | "prepend" | "stale" {
  if (req.from === w.end) return "append";
  if (req.from + req.limit === w.start) return "prepend";
  return "stale";
}

/** Parses `?entry=` — a non-negative integer, or null. */
export function parseEntryParam(v: string | string[] | undefined | null): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s == null || !/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

/**
 * The row showing entry `idx` — as the row's own entry, or as the result
 * folded into a call. When that entry is hidden (thinking or meta switched
 * off), the next row after it, else the last row before it; -1 when there are
 * no rows at all.
 */
export function rowForEntry(rows: readonly TranscriptRow[], idx: number): number {
  let after = -1;
  let before = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.entry.idx === idx || r.result?.idx === idx) return i;
    if (r.entry.idx > idx) {
      if (after === -1) after = i;
    } else {
      before = i;
    }
  }
  return after !== -1 ? after : before;
}
