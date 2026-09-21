import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildServerEnv } from "../server.js";

/**
 * The closed child environment (docs/plans/desktop-app.md §11.3, and §4.3 for
 * the blob half).
 *
 * The failure this guards is the one phase 2 found and phase 4 inherits: `next
 * build` traces the working tree's `.env` into the bundle, and `@next/env` fills
 * in anything the launcher did not set. So "we did not configure S3" is not the
 * same as "S3 is not configured", and the difference is a desktop app writing a
 * user's images into the developer's MinIO — or, since the store now refuses a
 * configuration naming both backends, failing every image upload with a
 * message about a bucket the user has never heard of.
 *
 * Everything asserted here is therefore about what the child is *handed*, not
 * about what the store does with it.
 */

/**
 * `server.js` is plain JavaScript, so the environment it returns is inferred
 * from its initialiser rather than declared. The cast is to the shape the
 * function actually produces — a bag of string values — not a claim about any
 * particular key being present, which is what each test asserts for itself.
 */
const build = (
  envFile: string | null,
  overrides: Record<string, unknown> = {},
  files: Record<string, string> = {},
): Record<string, string | undefined> => {
  const envRoot = mkdtempSync(path.join(tmpdir(), "desktop-env-"));
  if (envFile !== null) {
    writeFileSync(path.join(envRoot, ".env"), envFile);
  }
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(envRoot, name), contents);
  }
  try {
    return buildServerEnv({
      envRoot,
      port: 41234,
      url: "http://127.0.0.1:41234",
      databaseUrl: "postgresql://postgres:pw@127.0.0.1:42673/blog",
      nextAuthSecret: "secret",
      uploadsDir: "/home/someone/.config/blog-desktop/uploads",
      blobDir: "/home/someone/.config/blog-desktop/blobs",
      ...overrides,
    });
  } finally {
    rmSync(envRoot, { recursive: true, force: true });
  }
};

describe("buildServerEnv", () => {
  it("names the blob directory, which is what selects the filesystem store", () => {
    expect(build(null).BLOB_DIR).toBe(
      "/home/someone/.config/blog-desktop/blobs",
    );
  });

  it("keeps blobs and attachments in separate directories", () => {
    const env = build(null);
    expect(env.BLOB_DIR).not.toBe(env.UPLOADS_DIR);
  });

  it("blanks S3, so the store is never handed two backends at once", () => {
    const env = build(
      [
        'S3_ENDPOINT="http://localhost:9000"',
        'S3_ACCESS_KEY_ID="blogblobs"',
        'S3_SECRET_ACCESS_KEY="blogblobs"',
        'S3_BUCKET="blog-blobs"',
      ].join("\n"),
    );
    for (const key of [
      "S3_ENDPOINT",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_BUCKET",
    ]) {
      expect(env[key]).toBe("");
    }
    expect(env.BLOB_DIR).toBe("/home/someone/.config/blog-desktop/blobs");
  });

  it("wins over a BLOB_DIR traced into the bundle from the working tree", () => {
    // The dangerous shape: a developer with BLOB_DIR set for their own reasons.
    // Blanking runs first and the deliberate values are assigned last, so what
    // the child gets is ours and not theirs.
    const env = build('BLOB_DIR="/home/dev/code/blog-simple/var/blobs"');
    expect(env.BLOB_DIR).toBe("/home/someone/.config/blog-desktop/blobs");
  });

  it("still blanks the OAuth credentials phase 2 went after", () => {
    const env = build('GITHUB_CLIENT_ID="real"\nGITHUB_CLIENT_SECRET="alsoreal"');
    expect(env.GITHUB_CLIENT_ID).toBe("");
    expect(env.GITHUB_CLIENT_SECRET).toBe("");
  });

  it("does not inherit the ambient environment wholesale", () => {
    const env = build(null);
    expect(env.S3_ENDPOINT ?? "").toBe("");
    expect(Object.keys(env)).not.toContain("SSH_AUTH_SOCK");
  });
});

/**
 * Watch mode (`pnpm desktop:dev`), where the child is `next dev` over the
 * working tree rather than the traced bundle.
 *
 * The env files are read from the repository itself here, which is the closest
 * this environment ever gets to the developer's own — so the interesting
 * question is not what the dev server needs but whether the blanking still
 * covers it. `next dev` loads the *development* half of the `.env` set, and a
 * list that names only the production half would walk straight past
 * `.env.development`.
 */
describe("buildServerEnv in development", () => {
  const dev = (
    envFile: string | null,
    files: Record<string, string> = {},
  ) => build(envFile, { dev: true, buildDir: ".next-desktop-dev" }, files);

  it("names the dev output directory, so no build artifact is written over", () => {
    expect(dev(null).BUILD_DIR).toBe(".next-desktop-dev");
    // `.next` is the VPS bundle and `.next-desktop` is what the packaged app
    // serves; `assertDesktopBundle` reads the second to decide whether it may
    // be served at all.
    expect(dev(null).BUILD_DIR).not.toBe(".next-desktop");
  });

  it("is still a desktop build as far as the config is concerned", () => {
    // `next dev` reads `next.config.ts` from this environment, so the client's
    // NEXT_PUBLIC_DESKTOP is derived from the same variable the server reads.
    expect(dev(null).DESKTOP).toBe("1");
  });

  it("does not claim to be production", () => {
    expect(dev(null).NODE_ENV).toBe("development");
    expect(build(null).NODE_ENV).toBe("production");
  });

  it("blanks S3 named in .env.development, which the production list never reads", () => {
    const env = dev(null, {
      ".env.development": 'S3_ENDPOINT="http://localhost:9000"\nS3_BUCKET="blog-blobs"',
    });
    expect(env.S3_ENDPOINT).toBe("");
    expect(env.S3_BUCKET).toBe("");
    expect(env.BLOB_DIR).toBe("/home/someone/.config/blog-desktop/blobs");
  });

  it("blanks .env.development.local too, which beats every other file", () => {
    const env = dev(null, { ".env.development.local": 'GITHUB_CLIENT_ID="real"' });
    expect(env.GITHUB_CLIENT_ID).toBe("");
  });

  it("keeps blanking the plain .env both modes read", () => {
    expect(dev('GOOGLE_CLIENT_SECRET="real"').GOOGLE_CLIENT_SECRET).toBe("");
  });
});
