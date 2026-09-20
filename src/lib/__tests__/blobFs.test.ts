import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fsBlobExists, fsDeleteBlob, fsGetBlob, fsPutBlob } from "@/lib/blobFs";

/**
 * The filesystem blob store — docs/plans/desktop-app.md §4.3.
 *
 * Two things are being pinned, and neither is "a file was written". The first is
 * that the properties the rest of the system already assumes of the store still
 * hold when it is a directory: an identical re-write is a no-op, a delete of
 * something absent succeeds (the collector's crash-recovery path depends on it),
 * and `exists` answers about *bytes* rather than about a database row. The
 * second is that every operation refuses a malformed hash before it touches the
 * disk — `blobPath.test.ts` covers which strings are malformed; this covers that
 * these four entry points are actually gated on it, which is the half a caller
 * could quietly lose.
 */

const hashOf = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blobfs-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("round trip", () => {
  it("stores bytes at <root>/<hash[0:2]>/<hash> and reads them back", async () => {
    const bytes = randomBytes(1024);
    const hash = hashOf(bytes);

    await fsPutBlob(root, hash, bytes);

    const expected = path.join(root, hash.slice(0, 2), hash);
    expect(await readFile(expected)).toEqual(bytes);
    expect(await fsGetBlob(root, hash)).toEqual(bytes);
    expect(await fsBlobExists(root, hash)).toBe(true);
  });

  it("stores bytes whose digest is what they are named by", async () => {
    const bytes = randomBytes(64);
    const hash = hashOf(bytes);
    await fsPutBlob(root, hash, bytes);
    expect(hashOf(await fsGetBlob(root, hash))).toBe(hash);
  });

  it("handles an empty blob", async () => {
    const bytes = Buffer.alloc(0);
    const hash = hashOf(bytes);
    await fsPutBlob(root, hash, bytes);
    expect(await fsGetBlob(root, hash)).toEqual(bytes);
  });
});

describe("idempotence", () => {
  it("re-writing identical bytes leaves exactly one file", async () => {
    const bytes = randomBytes(256);
    const hash = hashOf(bytes);

    await fsPutBlob(root, hash, bytes);
    await fsPutBlob(root, hash, bytes);
    await fsPutBlob(root, hash, bytes);

    const shard = path.join(root, hash.slice(0, 2));
    expect(await readdir(shard)).toEqual([hash]);
    expect(await fsGetBlob(root, hash)).toEqual(bytes);
  });

  it("concurrent writes of the same blob converge and leave no temporaries", async () => {
    const bytes = randomBytes(4096);
    const hash = hashOf(bytes);

    await Promise.all(
      Array.from({ length: 8 }, () => fsPutBlob(root, hash, bytes)),
    );

    const shard = path.join(root, hash.slice(0, 2));
    expect(await readdir(shard)).toEqual([hash]);
    expect(await fsGetBlob(root, hash)).toEqual(bytes);
  });

  it("does not leave a temporary file behind when the write fails", async () => {
    const bytes = randomBytes(32);
    const hash = hashOf(bytes);
    // A file where the shard directory should be: `mkdir` fails with ENOTDIR
    // before anything is written.
    await writeFile(path.join(root, hash.slice(0, 2)), "not a directory");

    await expect(fsPutBlob(root, hash, bytes)).rejects.toThrow();
    expect(await readdir(root)).toEqual([hash.slice(0, 2)]);
  });
});

describe("existence and deletion", () => {
  it("reports a blob that was never written as absent", async () => {
    expect(await fsBlobExists(root, "b".repeat(64))).toBe(false);
  });

  it("deleting a blob that is not there succeeds", async () => {
    await expect(fsDeleteBlob(root, "c".repeat(64))).resolves.toBeUndefined();
  });

  it("deleting removes the bytes and nothing else", async () => {
    const kept = randomBytes(16);
    const keptHash = hashOf(kept);
    const going = randomBytes(16);
    const goingHash = hashOf(going);

    await fsPutBlob(root, keptHash, kept);
    await fsPutBlob(root, goingHash, going);
    await fsDeleteBlob(root, goingHash);

    expect(await fsBlobExists(root, goingHash)).toBe(false);
    expect(await fsBlobExists(root, keptHash)).toBe(true);
    expect(await fsGetBlob(root, keptHash)).toEqual(kept);
  });

  it("reading a blob that is not there throws ENOENT, as the object store does", async () => {
    await expect(fsGetBlob(root, "d".repeat(64))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("every entry point is gated on the hash", () => {
  const hostile = [
    "..",
    "../../secrets.json",
    "/etc/passwd",
    "..\\..\\secrets.json",
    `${"a".repeat(31)}/${"a".repeat(32)}`,
    "%2e%2e%2fsecrets.json",
    "",
    "A".repeat(64),
    "a".repeat(4096),
  ];

  it.each(hostile)("fsPutBlob refuses %j", async (hash) => {
    await expect(fsPutBlob(root, hash, Buffer.from("x"))).rejects.toThrow(
      /Invalid blob hash/,
    );
    // Nothing was created on the way to the refusal.
    expect(await readdir(root)).toEqual([]);
  });

  it.each(hostile)("fsGetBlob refuses %j", async (hash) => {
    await expect(fsGetBlob(root, hash)).rejects.toThrow(/Invalid blob hash/);
  });

  it.each(hostile)("fsBlobExists refuses %j", async (hash) => {
    await expect(fsBlobExists(root, hash)).rejects.toThrow(
      /Invalid blob hash/,
    );
  });

  it.each(hostile)("fsDeleteBlob refuses %j", async (hash) => {
    await expect(fsDeleteBlob(root, hash)).rejects.toThrow(
      /Invalid blob hash/,
    );
  });

  it("cannot be pointed at a file outside the root by a hash-shaped escape", async () => {
    const outside = path.join(root, "..", `escape-${path.basename(root)}`);
    await writeFile(outside, "secret");
    try {
      const escape = path.relative(path.join(root, "aa"), outside);
      await expect(fsGetBlob(root, escape)).rejects.toThrow(
        /Invalid blob hash/,
      );
      // And the file is still there — nothing deleted it either.
      await expect(fsDeleteBlob(root, escape)).rejects.toThrow(
        /Invalid blob hash/,
      );
      expect(await readFile(outside, "utf8")).toBe("secret");
    } finally {
      await rm(outside, { force: true });
    }
  });
});
