import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { blobFilePath } from "@/lib/blobPath";

/**
 * The blob store, on a filesystem — docs/plans/desktop-app.md §4.3.
 *
 * The desktop build has no object store, because running MinIO on a laptop is
 * absurd, so the four byte-moving operations behind `src/lib/storage.ts` get a
 * second implementation that writes content-addressed files under the user's
 * data directory. Nothing above the seam knows which one it got: the route
 * still streams through `getBlob`, and `presignBlobGet` has no callers, so
 * there is no URL shape to imitate.
 *
 * Content addressing is what makes this small, and the two properties the S3
 * implementation's docblock names hold here for the same reason rather than by
 * accident:
 *
 * - **Writes are idempotent.** The path *is* the content, so re-storing the same
 *   bytes overwrites a file with itself. Two concurrent writers cannot diverge.
 * - **Files are immutable.** A given path's bytes never change, so a reader
 *   never has to coordinate with a writer — only with a *partial* one, which is
 *   what the rename below rules out.
 *
 * What is deliberately *not* here is the mime type. S3 stores one per object and
 * this does not, because nothing reads it from the store: `/api/blob/[hash]`
 * takes `Content-Type` from the `Blob` row, which is the authority either way.
 * Writing a sidecar to hold a value no one reads would be a second source of
 * truth for free.
 *
 * `root` is passed in rather than read from the environment so this module can
 * be exercised against a temporary directory — `storage.ts` owns the decision of
 * *which* store, and this owns only the bytes.
 */

/** Node's errors carry `code`; nothing else about them is load bearing here. */
const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;

/**
 * Write `bytes` for `hash`.
 *
 * Written to a temporary name in the same directory and `rename`d into place,
 * which on a POSIX filesystem is atomic within a directory. That matters more
 * than it looks: a reader that opened a half-written file would get bytes whose
 * digest is not the name they are stored under, which is the one thing content
 * addressing must never allow — and unlike a failed read, it would be cached and
 * believed.
 *
 * The temporary name carries random bytes so two writers of the same blob cannot
 * share one, and both renames then land the same content.
 */
export async function fsPutBlob(
  root: string,
  hash: string,
  bytes: Buffer | Uint8Array,
): Promise<void> {
  const target = blobFilePath(root, hash);
  await mkdir(path.dirname(target), { recursive: true });

  const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    // A temporary file left behind would never be collected: the collector
    // walks `Blob` rows, and this name is not one.
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/** Read a blob's bytes. Throws `ENOENT` when the file is not there, as S3 throws. */
export async function fsGetBlob(root: string, hash: string): Promise<Buffer> {
  return readFile(blobFilePath(root, hash));
}

/**
 * Whether the bytes are on disk.
 *
 * Asks the filesystem, not the database — the same distinction the S3
 * implementation draws. A `Blob` row can outlive its file after a half-finished
 * collection, and a file can outlive its row after a crashed upload.
 */
export async function fsBlobExists(
  root: string,
  hash: string,
): Promise<boolean> {
  const target = blobFilePath(root, hash);
  try {
    await stat(target);
    return true;
  } catch (error) {
    const code = errorCode(error);
    // ENOTDIR: the shard directory has never been created.
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/**
 * Remove a blob's bytes.
 *
 * Deleting something that is not there succeeds, because the S3 implementation
 * does and `prisma/scripts/collect-blobs.ts` depends on it: a run interrupted
 * between the object and the row leaves a row whose bytes are already gone, and
 * the next run has to finish the job rather than fail on it.
 *
 * The empty shard directory is left behind on purpose. Removing it would race a
 * concurrent `fsPutBlob` between its `mkdir` and its `rename` — cheap to avoid,
 * and 256 empty directories cost nothing.
 */
export async function fsDeleteBlob(root: string, hash: string): Promise<void> {
  const target = blobFilePath(root, hash);
  try {
    await unlink(target);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return;
    throw error;
  }
}
