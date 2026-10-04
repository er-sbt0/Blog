/**
 * The decisions in a transcript search (docs/plans/remote-claude.md §4.9):
 * what a query string may be, how it becomes a `LIKE` pattern, and how a hit's
 * snippet is cut. Import-free so a spec pins them; the repository runs the SQL.
 */
import type { EntryKind } from "./parse";
import { SEARCH_MIN_LENGTH } from "./types";

export const SEARCH_MAX_LENGTH = 500;
/** Characters either side of the match in a snippet. */
export const SNIPPET_RADIUS = 40;

export const ENTRY_KINDS = [
  "prompt",
  "assistant",
  "thinking",
  "tool_use",
  "tool_result",
  "meta",
  "command",
] as const satisfies readonly EntryKind[];

// Fails to compile if `EntryKind` gains a member this list lacks.
type MissingKind = Exclude<EntryKind, (typeof ENTRY_KINDS)[number]>;
const _exhaustive: [MissingKind] extends [never] ? true : never = true;
void _exhaustive;

/** A project directory under `~/.claude/projects` — the first path segment. */
export const PROJECT_DIR_RE = /^[A-Za-z0-9._-]{1,255}$/;

/**
 * Escapes `LIKE`'s metacharacters so a query is matched literally — a search
 * for `foo_bar` or `100%` must not mean "any character" or "anything". Paired
 * with `ESCAPE '\'` in the SQL.
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface SearchParams {
  /** Lower-cased, as `RemoteEntry.text` is at ingest. */
  q: string;
  hostId: string | null;
  project: string | null;
  /** Empty means every kind. */
  kinds: EntryKind[];
  /** True when thinking entries are wanted — `thinking=1`, or asked for by kind. */
  thinking: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * `?q=&host=&project=&kind=&thinking=1` → validated parameters, or the reason
 * they are not. `host` is checked only for presence here; ownership (and the
 * UUID shape) is `requireRemoteHost`'s.
 */
export function parseSearchParams(sp: URLSearchParams): Parsed<SearchParams> {
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  if (q.length < SEARCH_MIN_LENGTH) {
    return {
      ok: false,
      error: `Search needs at least ${SEARCH_MIN_LENGTH} characters — shorter queries cannot use the index.`,
    };
  }
  if (q.length > SEARCH_MAX_LENGTH) {
    return { ok: false, error: `Search is limited to ${SEARCH_MAX_LENGTH} characters.` };
  }
  const host = sp.get("host") || null;
  const project = sp.get("project") || null;
  if (project !== null && (!PROJECT_DIR_RE.test(project) || project.includes(".."))) {
    return { ok: false, error: "project must be a project directory name" };
  }
  const kinds: EntryKind[] = [];
  for (const k of sp.getAll("kind")) {
    if (!(ENTRY_KINDS as readonly string[]).includes(k)) {
      return { ok: false, error: `kind must be one of ${ENTRY_KINDS.join(", ")}` };
    }
    if (!kinds.includes(k as EntryKind)) kinds.push(k as EntryKind);
  }
  const thinking = sp.get("thinking") === "1" || kinds.includes("thinking");
  return { ok: true, value: { q, hostId: host, project, kinds, thinking } };
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

export interface Snippet {
  snippet: string;
  matchStart: number;
  matchLength: number;
}

/**
 * Up to `radius` UTF-16 units either side of the first occurrence of `q` in
 * `text` (both already lower-cased). Never splits a surrogate pair, so an emoji
 * at the edge is kept whole or dropped whole. Whitespace becomes a space one
 * for one, so offsets are unchanged and a snippet is one line.
 *
 * The SQL hands over a window around `strpos` rather than the whole text; the
 * window is in code points, at least as wide as this cut, so cutting it again
 * here is exact.
 */
export function snippetAround(text: string, q: string, radius = SNIPPET_RADIUS): Snippet {
  const at = q ? text.indexOf(q) : -1;
  if (at < 0) {
    let end = Math.min(text.length, 2 * radius);
    if (end < text.length && isLow(text.charCodeAt(end))) end--;
    return { snippet: oneLine(text.slice(0, end)), matchStart: 0, matchLength: 0 };
  }
  let start = Math.max(0, at - radius);
  if (start > 0 && isLow(text.charCodeAt(start))) start++;
  let end = Math.min(text.length, at + q.length + radius);
  if (end < text.length && isLow(text.charCodeAt(end)) && isHigh(text.charCodeAt(end - 1))) end--;
  return {
    snippet: oneLine(text.slice(start, end)),
    matchStart: at - start,
    matchLength: q.length,
  };
}

const oneLine = (s: string) => s.replace(/\s/g, " ");
