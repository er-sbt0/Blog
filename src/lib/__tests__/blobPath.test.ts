import path from "path";
import { blobFilePath, isValidHash, tryBlobFilePath } from "@/lib/blobPath";

/**
 * The traversal surface that filesystem blobs create — docs/plans/desktop-app.md
 * §4.3.
 *
 * Worth stating what is actually at stake, because a happy-path test here would
 * be worthless. `GET /api/blob/<hash>` takes its hash from a URL segment. Under
 * S3 that string indexes into a key space, where `../` is an ordinary character
 * sequence and the worst case is a 404. On the desktop build the same string
 * derives a **path on disk**, so the same request that used to miss a key can
 * now read a file — `secrets.json` sits two directories above the blob root, and
 * `deleteBlob` would remove rather than read.
 *
 * So nearly all of this file is refusals. Each case is a shape that has, in some
 * other codebase, been the whole bug.
 */

const ROOT = "/data/blobs";
const HASH = "a".repeat(64);

describe("isValidHash", () => {
  it("accepts 64 lowercase hex characters", () => {
    expect(isValidHash(HASH)).toBe(true);
    expect(isValidHash("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("rejects uppercase, so one blob cannot have two names", () => {
    expect(isValidHash("A".repeat(64))).toBe(false);
  });

  it("rejects the wrong length in both directions", () => {
    expect(isValidHash("a".repeat(63))).toBe(false);
    expect(isValidHash("a".repeat(65))).toBe(false);
    expect(isValidHash("")).toBe(false);
  });

  it("rejects non-hex characters and whitespace", () => {
    expect(isValidHash("g".repeat(64))).toBe(false);
    expect(isValidHash(` ${"a".repeat(63)}`)).toBe(false);
    expect(isValidHash(`${"a".repeat(64)}\n`)).toBe(false);
  });
});

describe("tryBlobFilePath", () => {
  it("shards on the first two characters", () => {
    expect(tryBlobFilePath(ROOT, HASH)).toBe(
      path.join(ROOT, "aa", HASH),
    );
    const mixed = `0f${"1".repeat(62)}`;
    expect(tryBlobFilePath(ROOT, mixed)).toBe(path.join(ROOT, "0f", mixed));
  });

  it("is a pure function of its inputs", () => {
    expect(tryBlobFilePath(ROOT, HASH)).toBe(tryBlobFilePath(ROOT, HASH));
  });

  it("resolves a relative root so the answer is always absolute", () => {
    const resolved = tryBlobFilePath("var/blobs", HASH);
    expect(resolved).toBe(path.resolve("var/blobs", "aa", HASH));
    expect(path.isAbsolute(resolved!)).toBe(true);
  });

  it("refuses an empty root rather than writing into the cwd", () => {
    expect(tryBlobFilePath("", HASH)).toBeNull();
  });

  // ─── The refusals ──────────────────────────────────────────────────────────

  it.each([
    ["dot-dot alone", ".."],
    ["a single dot", "."],
    ["relative traversal", "../../etc/passwd"],
    ["traversal to a real neighbour", "../secrets.json"],
    ["deep traversal", "../".repeat(12) + "etc/shadow"],
    ["an absolute path", "/etc/passwd"],
    ["an absolute path inside the root", "/data/blobs/aa/" + HASH],
    ["a windows separator", "..\\..\\secrets.json"],
    ["a windows absolute path", "C:\\Windows\\System32\\config\\SAM"],
    ["a separator inside a hash-shaped string", `${"a".repeat(31)}/${"a".repeat(32)}`],
    ["a trailing separator", `${HASH}/`],
    ["a leading separator", `/${HASH}`],
    ["url-encoded traversal", "%2e%2e%2f%2e%2e%2fsecrets.json"],
    ["double-encoded traversal", "%252e%252e%252fsecrets.json"],
    ["decoded traversal in a hash-shaped wrapper", `${"a".repeat(60)}/../..`],
    ["a null byte", `${"a".repeat(63)}\0`],
    ["a null byte truncating a traversal", `${HASH}\0../../secrets.json`],
    ["empty", ""],
    ["whitespace", "   "],
    ["overlong", "a".repeat(4096)],
    ["overlong traversal", "../".repeat(1024) + "a".repeat(64)],
    ["a home-relative path", "~/.ssh/id_rsa"],
    ["a glob", "*"],
    ["dots only", "...."],
    ["uppercase hex", "A".repeat(64)],
    ["a hash with a newline", `${HASH}\n${HASH}`],
  ])("refuses %s", (_label, hash) => {
    expect(tryBlobFilePath(ROOT, hash)).toBeNull();
  });

  it("never returns a path outside the root, whatever it is handed", () => {
    const hostile = [
      "..",
      "../..",
      "../../../../../../etc/passwd",
      "/etc/passwd",
      `${HASH}/../../../../secrets.json`,
      "%2e%2e/%2e%2e/secrets.json",
      "\0",
      "a/../../b",
    ];
    const root = path.resolve(ROOT);
    for (const candidate of hostile) {
      const resolved = tryBlobFilePath(ROOT, candidate);
      // Either refused outright, or — if a future edit ever makes one of these
      // resolvable — provably still inside the blob root.
      if (resolved !== null) {
        expect(resolved.startsWith(root + path.sep)).toBe(true);
      } else {
        expect(resolved).toBeNull();
      }
    }
  });
});

describe("blobFilePath", () => {
  it("returns the same path as the nullable form", () => {
    expect(blobFilePath(ROOT, HASH)).toBe(tryBlobFilePath(ROOT, HASH));
  });

  it("throws rather than returning a path for anything refused", () => {
    expect(() => blobFilePath(ROOT, "../secrets.json")).toThrow(
      /Invalid blob hash/,
    );
    expect(() => blobFilePath(ROOT, "")).toThrow(/Invalid blob hash/);
    expect(() => blobFilePath("", HASH)).toThrow(/Invalid blob hash/);
  });
});
