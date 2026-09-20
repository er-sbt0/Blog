import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import path from "path";
import { fsBlobExists, fsDeleteBlob, fsGetBlob, fsPutBlob } from "@/lib/blobFs";
import { isValidHash } from "@/lib/blobPath";

/**
 * The blob store: bytes addressed by the SHA-256 of their own content.
 *
 * See docs/plans/blob-storage.md. Two properties of content addressing are load
 * bearing here rather than incidental:
 *
 * - **Writes are idempotent by construction.** The key *is* the content, so
 *   re-uploading the same bytes is a no-op rather than a conflict, and two
 *   concurrent uploads of the same image cannot race into different objects.
 * - **Objects are immutable.** A given key's bytes never change, which is what
 *   makes `immutable` caching unconditionally safe for anything servable — no
 *   invalidation problem exists.
 *
 * ## One bucket, not two
 *
 * The plan (§7) originally carried over the two-bucket public/private split from
 * `archive/storage-uploads.md`. That does not survive content addressing, for the
 * same reason §4 gives for ACLs: a blob deduplicated across a published post and
 * a private draft belongs in *both* buckets, and would have to be moved whenever
 * either document's visibility changed. Bucket placement is per-blob; visibility
 * is per-document; deduplication severs the two.
 *
 * So: one private bucket, and `/api/blob/[hash]` decides cacheability per
 * request from the *documents* referencing the blob. Public content still gets
 * CDN-cached — by Cloudflare, off the immutable response — without the store
 * having to model an access rule it cannot see.
 *
 * ## Two backends, and how one is chosen
 *
 * S3 is the store. `BLOB_DIR` selects a filesystem one instead
 * (`src/lib/blobFs.ts`), for the desktop build, which has no object store —
 * docs/plans/desktop-app.md §4.3.
 *
 * **The signal is a variable that names the directory, and that is the whole
 * point.** The obvious alternative — "S3 is not configured, so write to disk" —
 * is a condition a *misconfigured VPS* also satisfies, and the failure mode is
 * silent and expensive: a production server that quietly writes every uploaded
 * image into a container filesystem which is discarded on the next deploy,
 * looking healthy the entire time. A directory cannot be arrived at by omission,
 * only by being named. (`DESKTOP=1` exists and would also be explicit, but it
 * says which *build* this is rather than where the bytes go, and it would leave
 * the location implicit at exactly the point where being wrong loses data.)
 *
 * Configuring both is refused rather than resolved by precedence: whichever way
 * it were resolved, the other half of the configuration would be a deployment
 * asking for something it is silently not getting.
 */

const endpoint = process.env.S3_ENDPOINT || undefined;
const region = process.env.S3_REGION || "auto";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";

/** The one bucket. See the docblock above for why there is not a second. */
const BLOB_BUCKET = process.env.S3_BUCKET || "blog-blobs";

/**
 * The filesystem store's root, or `""` for "not selected". See the docblock
 * above for why this is a directory name and not an inference.
 */
const BLOB_DIR = process.env.BLOB_DIR || "";

/**
 * `||` rather than `??` throughout: `.env.example` ships every key as `""`, so a
 * copied-but-unedited env file must fall through to the default rather than
 * configure the client with an empty string. Same reasoning as
 * `src/lib/uploads.ts`.
 */
const isS3Configured = (): boolean =>
  !!endpoint && !!accessKeyId && !!secretAccessKey;

/**
 * Whether *a* store is configured. Callers use it to decide whether to attempt
 * a write at all (`blobIngest`, the two blob scripts), so it must answer for
 * both backends or the desktop build would keep skipping the work.
 */
export const isStorageConfigured = (): boolean =>
  !!BLOB_DIR || isS3Configured();

/**
 * The filesystem root when that backend is selected, else null.
 *
 * Resolved lazily, like {@link s3}, so the ambiguity refusal below is a runtime
 * error on the operations that would have lost bytes rather than a build
 * failure — and so a misconfiguration names itself instead of being discovered
 * later from an empty directory.
 */
function fsRoot(): string | null {
  if (!BLOB_DIR) return null;
  if (isS3Configured()) {
    throw new Error(
      "Both BLOB_DIR and S3_* are configured — refusing to guess which store " +
        "owns the blobs. Unset one.",
    );
  }
  return path.resolve(BLOB_DIR);
}

let client: S3Client | null = null;

/**
 * The S3 client, built once.
 *
 * Deliberately lazy: constructing it at module scope would run during
 * `next build`, where none of these variables are set, and turn a missing
 * credential into a build failure rather than a runtime error on the one route
 * that needs it. The blob route is the only caller, and it is dynamic.
 */
function s3(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Blob storage is not configured — set S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  }
  client ??= new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // MinIO and most non-AWS endpoints address buckets by path, not by
    // subdomain. R2 accepts either.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
  return client;
}

/** Lowercase hex SHA-256 of `bytes` — the key this module addresses by. */
export function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Whether `hash` is well-formed.
 *
 * This is the key-space equivalent of the traversal check on the filesystem
 * path it replaces. `resolveWithin` had something to assert — that a resolved
 * path stayed inside a directory — and an object key space does not: `a/../b`
 * is simply a key. So the defence has to move to *constructing* the key, which
 * is why every entry point validates rather than sanitising. See
 * blob-storage.md §4 and the note in `archive/storage-uploads.md` §Security.
 *
 * It now lives in `src/lib/blobPath.ts`, because with a filesystem backend the
 * same string derives a path as well as a key and the two rules must be one
 * rule. Re-exported here so `src/lib/access.ts` and the import route keep
 * importing it from the store, which is where it belongs conceptually.
 */
export { isValidHash };

/** The object key for a blob. Flat: the hash is already uniformly distributed. */
const keyFor = (hash: string): string => {
  if (!isValidHash(hash)) throw new Error(`Invalid blob hash: ${hash}`);
  return hash;
};

/**
 * Store `bytes` under `hash`.
 *
 * The caller is responsible for `hash` being the digest of `bytes`; this does
 * not re-verify, because every caller has just computed it and re-hashing a
 * large upload on the write path is pure cost. Use {@link hashBytes}.
 */
export async function putBlob(
  hash: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const root = fsRoot();
  // The filesystem store holds bytes only; `Blob.mimeType` is what the route
  // serves, in both backends. See `src/lib/blobFs.ts`.
  if (root) return fsPutBlob(root, hash, bytes);

  await s3().send(
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: keyFor(hash),
      Body: bytes,
      ContentType: mimeType,
    }),
  );
}

/** Fetch a blob's bytes. */
export async function getBlob(hash: string): Promise<Buffer> {
  const root = fsRoot();
  if (root) return fsGetBlob(root, hash);

  const result = await s3().send(
    new GetObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
  );
  if (!result.Body) throw new Error(`Blob ${hash} has no body`);
  return Buffer.from(await result.Body.transformToByteArray());
}

/**
 * Whether the object exists in the bucket.
 *
 * Note this asks the *store*, not the database. The `Blob` row and the object
 * can disagree — a crashed upload leaves a row with no object, and a
 * half-finished GC leaves an object with no row — so a caller that needs the
 * truth about bytes must ask here.
 */
export async function blobExists(hash: string): Promise<boolean> {
  const root = fsRoot();
  if (root) return fsBlobExists(root, hash);

  try {
    await s3().send(
      new HeadObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
    );
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return false;
    throw error;
  }
}

/**
 * Remove a blob's bytes — docs/plans/blob-storage.md §5.
 *
 * The only destructive operation in this module, and the only one with no
 * caller on a request path. Deleting is never a write-path decision: under
 * deduplication a blob can be re-referenced between the check and the delete by
 * a concurrent paste of the same image, which is the *common* case rather than
 * the unlucky one. `prisma/scripts/collect-blobs.ts` is the only thing that
 * calls this, offline, against blobs that have been unreferenced for a week.
 *
 * Deleting a key that is not there succeeds. That is S3 semantics rather than a
 * convenience, and the collector depends on it: a run interrupted between the
 * object and the row leaves a row whose object is already gone, and the next run
 * has to be able to finish the job rather than fail on it.
 *
 * `keyFor` validates before anything leaves the process, for the same reason
 * every other entry point here does — but the stake is higher on this one. A
 * traversal-shaped key that merely fails to *read* is a 404; one that reached a
 * delete would remove bytes that were never this blob's.
 */
export async function deleteBlob(hash: string): Promise<void> {
  const root = fsRoot();
  if (root) return fsDeleteBlob(root, hash);

  await s3().send(
    new DeleteObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
  );
}

/**
 * A time-limited URL that serves the blob directly from the store.
 *
 * The authorization decision is made *before* this is called and is not encoded
 * in the URL beyond its expiry — so a signed URL must only ever be handed to a
 * caller `requireBlobRead` has already admitted.
 *
 * **It has no callers** (desktop-app.md §2.3): `/api/blob/[hash]` streams bytes
 * through `getBlob`. That is why the filesystem backend implements six
 * functions and not seven — there is nothing on disk that a URL could name
 * without a second server in front of it, and inventing one would be inventing
 * an access path that bypasses `requireBlobRead`. It refuses rather than
 * silently signing against an S3 endpoint that is not the store in use.
 */
export function presignBlobGet(
  hash: string,
  expiresIn = 300,
): Promise<string> {
  if (fsRoot()) {
    return Promise.reject(
      new Error(
        "The filesystem blob store cannot presign URLs — serve the bytes " +
          "through /api/blob/[hash], which authorizes them.",
      ),
    );
  }

  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
    { expiresIn },
  );
}
