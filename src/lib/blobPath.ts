import path from "path";
import { resolveWithin } from "@/lib/safePath";

/**
 * Turning a blob's hash into a path on disk — docs/plans/desktop-app.md §4.3.
 *
 * This module exists because of what changes when the blob store is a
 * filesystem rather than S3. Under S3 the hash is an *object key*, and a key
 * space has no traversal: `a/../b` is simply a key, which is why
 * `src/lib/storage.ts` defends by constructing keys only from validated hashes
 * rather than by sanitising paths. On the desktop build the same
 * attacker-controlled URL segment — `GET /api/blob/<hash>` — becomes a real
 * path, so the defence has to be both halves at once: the hash is validated as
 * a 64-character digest *and* the resulting path is re-resolved against the
 * blob root, as `resolveWithin`'s docblock insists.
 *
 * Kept import-free apart from `path`/`safePath` so the refusals can be
 * exercised without a filesystem — see `__tests__/blobPath.test.ts`, which is
 * the half that matters here.
 */

/** 64 lowercase hex characters, and nothing else. */
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Whether `hash` is well-formed.
 *
 * Lives here rather than in `src/lib/storage.ts` — which re-exports it, so every
 * existing caller is unaffected — because it is now the first half of a path
 * derivation as well as a key check, and the two must not be able to drift
 * apart. See blob-storage.md §4 and the note in `archive/storage-uploads.md`
 * §Security.
 *
 * Uppercase hex is rejected rather than lowercased: a digest that differs only
 * in case would be a second name for the same content, which is exactly what
 * content addressing exists to prevent, and on a case-insensitive filesystem it
 * would be a second name for the same *file*.
 */
export const isValidHash = (hash: string): boolean => HASH_RE.test(hash);

/** How many leading hex characters name the shard directory. */
export const BLOB_SHARD_LENGTH = 2;

/**
 * The file a blob's bytes live in, or null if `hash` could not name one.
 *
 * `<root>/<hash[0:2]>/<hash>`. The shard is there for the directory's sake
 * rather than the lookup's: a flat directory of tens of thousands of entries is
 * slow to list and unpleasant to look at, and the first two hex characters of a
 * SHA-256 spread 256 ways uniformly for free.
 *
 * Three checks, in order, and none of them is redundant:
 *
 * 1. `isValidHash` — after this the value provably contains no separator, no
 *    `.`, and nothing a filesystem treats specially. Everything below is a
 *    backstop for a future caller that reaches this without it.
 * 2. `resolveWithin` — takes the basename and re-resolves it against the shard
 *    directory, which is the guarantee `safePath` exists to make whole.
 * 3. The resolved path is checked against the *root*, not just the shard.
 *    `resolveWithin` proves containment in the directory it was handed, and the
 *    shard directory is itself derived from the same untrusted string.
 */
export function tryBlobFilePath(root: string, hash: string): string | null {
  if (!root) return null;
  if (!isValidHash(hash)) return null;

  const base = path.resolve(root);
  const shard = path.join(base, hash.slice(0, BLOB_SHARD_LENGTH));

  const resolved = resolveWithin(shard, hash);
  if (!resolved) return null;
  if (!resolved.startsWith(base + path.sep)) return null;

  return resolved;
}

/**
 * {@link tryBlobFilePath}, throwing rather than returning null.
 *
 * The throwing form is what the store uses, mirroring `keyFor` in
 * `src/lib/storage.ts`: a malformed hash must never reach the filesystem at
 * all, and a caller that has not checked should fail loudly rather than operate
 * on a path that quietly became something else. The message repeats the S3
 * one's shape so the two branches fail the same way.
 */
export function blobFilePath(root: string, hash: string): string {
  const resolved = tryBlobFilePath(root, hash);
  if (!resolved) throw new Error(`Invalid blob hash: ${hash}`);
  return resolved;
}
