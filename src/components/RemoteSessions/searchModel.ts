/**
 * Full-text search over transcripts, without React (docs/plans/remote-claude.md
 * §4.9): when a query may go to the server, what the request says, how hits
 * group under their session, and how a match is cut out of a snippet so it can
 * be highlighted as **text** — a snippet is transcript bytes, and §2.4's rule
 * (React text children, never markup) holds for it exactly as for an entry.
 *
 * Import-free apart from `SEARCH_MIN_LENGTH`, whose module has no runtime
 * imports of its own — so every rule here is a plain spec.
 */
import {
  type RemoteSearchHit,
  SEARCH_MIN_LENGTH,
} from "@/lib/claudeSessions/types";
import type { EntryKind } from "@/lib/claudeSessions/parse";

/** How long typing must pause before a query goes to the server. */
export const SEARCH_DEBOUNCE_MS = 250;

/** The kinds a search can be narrowed to, in the order the filter shows them. */
export const SEARCH_KINDS: { kind: EntryKind; label: string }[] = [
  { kind: "prompt", label: "Prompts" },
  { kind: "assistant", label: "Replies" },
  { kind: "tool_use", label: "Tool calls" },
  { kind: "tool_result", label: "Results" },
  { kind: "command", label: "Commands" },
  { kind: "meta", label: "Meta" },
];

export type SearchGate =
  | { state: "idle" }
  | { state: "short"; hint: string }
  | { state: "ready"; q: string };

/**
 * May this query be sent? Blank is idle; under `SEARCH_MIN_LENGTH` characters
 * the server would refuse it (the trigram index cannot serve it), so the hint
 * is shown locally rather than spending a round trip on a 400.
 */
export function searchGate(raw: string): SearchGate {
  const q = raw.trim();
  if (q === "") return { state: "idle" };
  if ([...q].length < SEARCH_MIN_LENGTH) {
    return { state: "short", hint: `Type at least ${SEARCH_MIN_LENGTH} characters to search transcripts.` };
  }
  return { state: "ready", q };
}

export interface SearchParams {
  q: string;
  hostId?: string | null;
  projectDir?: string | null;
  /** Empty means every kind. */
  kinds?: readonly EntryKind[];
  thinking?: boolean;
}

/** `?q=…&host=…&kind=a&kind=b&thinking=1`, every value encoded. */
export function searchQueryString({ q, hostId, projectDir, kinds = [], thinking }: SearchParams): string {
  const p = new URLSearchParams();
  p.set("q", q);
  if (hostId) p.set("host", hostId);
  if (projectDir) p.set("project", projectDir);
  for (const k of kinds) p.append("kind", k);
  if (thinking) p.set("thinking", "1");
  return p.toString();
}

export interface HitGroup {
  sessionId: string;
  hostId: string;
  title: string | null;
  projectDir: string;
  cwd: string | null;
  isSubagent: boolean;
  endedAt: string | null;
  hits: RemoteSearchHit[];
}

/**
 * Hits → one group per session, in the order the server ranked them (newest
 * session first), hits within a group by position in the transcript.
 */
export function groupHits(hits: readonly RemoteSearchHit[]): HitGroup[] {
  const groups = new Map<string, HitGroup>();
  for (const h of hits) {
    let g = groups.get(h.sessionId);
    if (!g) {
      g = {
        sessionId: h.sessionId,
        hostId: h.hostId,
        title: h.title,
        projectDir: h.projectDir,
        cwd: h.cwd,
        isSubagent: h.isSubagent,
        endedAt: h.endedAt,
        hits: [],
      };
      groups.set(h.sessionId, g);
    }
    g.hits.push(h);
  }
  for (const g of groups.values()) g.hits.sort((a, b) => a.idx - b.idx);
  return [...groups.values()];
}

/** The last path segment of the cwd, else the project directory name. */
export function projectLabel(cwd: string | null, projectDir: string): string {
  const seg = cwd?.replace(/\/+$/, "").split("/").pop();
  return seg || projectDir;
}

const KIND_LABEL: Record<EntryKind, string> = {
  prompt: "prompt",
  assistant: "reply",
  thinking: "thinking",
  tool_use: "tool call",
  tool_result: "result",
  meta: "meta",
  command: "command",
};

/** "Bash call", "Read result", "prompt"… */
export function hitLabel(hit: Pick<RemoteSearchHit, "kind" | "tool">): string {
  if (hit.tool && hit.kind === "tool_use") return `${hit.tool} call`;
  if (hit.tool && hit.kind === "tool_result") return `${hit.tool} result`;
  return KIND_LABEL[hit.kind] ?? hit.kind;
}

/** Where a hit opens: the transcript, at the entry, with the query to find. */
export function hitHref(hit: Pick<RemoteSearchHit, "sessionId" | "idx">, q: string): string {
  const p = new URLSearchParams({ entry: String(hit.idx), q });
  return `/sessions/${encodeURIComponent(hit.sessionId)}?${p.toString()}`;
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * A snippet split around the server's match offsets. Offsets outside the text
 * are clamped rather than trusted, so a stale or off-by-one answer degrades to
 * a shorter (or absent) highlight, never to a thrown error or lost text.
 */
export function sliceMatch(text: string, start: number, length: number): TextSegment[] {
  const s = Math.max(0, Math.min(text.length, Number.isFinite(start) ? Math.floor(start) : 0));
  const e = Math.max(s, Math.min(text.length, s + (Number.isFinite(length) ? Math.floor(length) : 0)));
  const out: TextSegment[] = [];
  if (s > 0) out.push({ text: text.slice(0, s), match: false });
  if (e > s) out.push({ text: text.slice(s, e), match: true });
  if (e < text.length) out.push({ text: text.slice(e), match: false });
  return out;
}

/**
 * Every case-insensitive occurrence of `query` in `text`, as segments. A blank
 * query gives the text whole. Case folding that changes a string's length
 * (rare, e.g. `İ`) falls back to no highlight rather than misplaced offsets.
 */
export function highlightSegments(text: string, query: string): TextSegment[] {
  const q = query.trim().toLowerCase();
  if (!q || !text) return text ? [{ text, match: false }] : [];
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return [{ text, match: false }];
  const out: TextSegment[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) {
    if (i > at) out.push({ text: text.slice(at, i), match: false });
    out.push({ text: text.slice(i, i + q.length), match: true });
    at = i + q.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/** Trailing-edge debounce: only the last call in a quiet `ms` runs. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = ((...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as Debounced<A>;
  run.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return run;
}
