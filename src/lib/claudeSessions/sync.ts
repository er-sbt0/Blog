/**
 * The decisions in an incremental sync: what to fetch, and what a fetched
 * range does to a stored file. docs/plans/remote-claude.md §4.3.
 *
 * Import-free so a spec pins them. The repository does the I/O and calls in
 * here for every choice, which is why hashing arrives as a boolean rather than
 * as bytes: the caller has `node:crypto`, this module does not.
 */

/**
 * An ssh destination: an alias from `~/.ssh/config`, or `user@host` (§4.2,
 * §7.1). No leading `-`, so it can never be read as an ssh option. The main
 * process checks the same pattern again before spawning
 * (`packages/desktop/src/remoteSessions.js`), and a spec pins that the two agree.
 */
export const SSH_HOST_RE =
  /^(?:[A-Za-z0-9_][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** What the server already holds for one remote path. */
export interface StoredFile {
  path: string;
  size: number;
  mtime: number;
  consumed: number;
  gone: boolean;
}

/** One line of the remote listing. `mtime` is whole milliseconds. */
export interface ListedFile {
  path: string;
  size: number;
  mtime: number;
}

/** A byte range to read: `[from, to)`. `from === to` is a rewrite probe. */
export interface WantedRange {
  path: string;
  from: number;
  to: number;
}

export interface ManifestPlan {
  wanted: WantedRange[];
  /** Shrunk since last time: rewritten in place, so stored bytes are dropped. */
  reset: string[];
  /** Stored but no longer listed — badge it, keep every byte (§4.8). */
  gone: string[];
  /** Listed again after being marked gone. */
  returned: string[];
}

/**
 * The longest prefix the read script hashes. The remote hashes the first
 * `min(from, HEAD_BYTES)` bytes — bytes the server already holds — so a match
 * means "what I stored is still what is there", including for a file shorter
 * than this that has merely grown.
 */
export const HEAD_BYTES = 4096;

/** Relative, `.jsonl`, no `..`, nothing outside the character set the read script accepts. */
const PATH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.jsonl$/;

export function isValidRemotePath(path: string): boolean {
  return path.length <= 1024 && PATH_RE.test(path) && !path.includes("..");
}

/**
 * Diffs the remote listing against what is stored.
 *
 * - unknown path → the whole file;
 * - smaller than last listed → rewritten: reset, then the whole file;
 * - same size and mtime → nothing;
 * - otherwise → from what was consumed to the new size. When that range is
 *   empty (same size, new mtime) it is still requested: the read returns the
 *   head hash, and that is the only way to notice a same-length rewrite.
 */
export function diffManifest(stored: StoredFile[], listed: ListedFile[]): ManifestPlan {
  const byPath = new Map(stored.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const plan: ManifestPlan = { wanted: [], reset: [], gone: [], returned: [] };

  for (const l of listed) {
    if (!isValidRemotePath(l.path) || seen.has(l.path)) continue;
    seen.add(l.path);
    const s = byPath.get(l.path);
    if (!s) {
      plan.wanted.push({ path: l.path, from: 0, to: l.size });
      continue;
    }
    if (s.gone) plan.returned.push(l.path);
    if (l.size < s.size || l.size < s.consumed) {
      plan.reset.push(l.path);
      plan.wanted.push({ path: l.path, from: 0, to: l.size });
    } else if (l.size !== s.size || l.mtime !== s.mtime) {
      plan.wanted.push({ path: l.path, from: s.consumed, to: l.size });
    }
  }

  for (const s of stored) {
    if (!s.gone && !seen.has(s.path)) plan.gone.push(s.path);
  }
  return plan;
}

/** The bytes a range may store: through its last newline (§4.3). */
export function consumableLength(data: Uint8Array): number {
  return data.lastIndexOf(10) + 1;
}

export type IngestAction =
  /** Store `data[0, keep)` as a chunk at `from`; consumed becomes `from + keep`. */
  | { action: "append"; keep: number }
  /** Rewritten since stored: drop everything, read the whole file again. */
  | { action: "reset" }
  /** Not where we are — a concurrent or repeated sync. Ignore it. */
  | { action: "stale" };

/**
 * What one fetched range does to a stored file. `headMatches` is whether the
 * remote's hash of its first `min(from, HEAD_BYTES)` bytes equals the hash of
 * the same prefix of what is stored; it is irrelevant when `from` is 0.
 */
export function planIngest(
  stored: { consumed: number } | null,
  range: { from: number; data: Uint8Array },
  headMatches: boolean,
): IngestAction {
  const consumed = stored?.consumed ?? 0;
  if (range.from !== consumed) return { action: "stale" };
  if (range.from > 0 && !headMatches) return { action: "reset" };
  return { action: "append", keep: consumableLength(range.data) };
}

/**
 * A subagent run lives at `<project>/<session>/subagents/agent-<id>.jsonl`; its
 * parent session is `<project>/<session>.jsonl`. Null for a top-level session.
 */
export function parentPathOf(path: string): string | null {
  const m = /^([^/]+)\/([^/]+)\/subagents\/[^/]+\.jsonl$/.exec(path);
  return m ? `${m[1]}/${m[2]}.jsonl` : null;
}

/** The project directory: the first path segment. */
export function projectDirOf(path: string): string {
  return path.split("/")[0];
}
