import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertDesktopBundle, PWA_ARTIFACTS } from "../server.js";

/**
 * Which build the shell is about to serve (docs/plans/desktop-app.md §5).
 *
 * Phase 5 turns three things off — the service worker, `/api/mcp`, and the
 * sign-out button — and two of them can only be decided while the bundle is
 * written: `next-pwa` injects its registration from a webpack plugin, and
 * `NEXT_PUBLIC_*` is inlined as a literal that no runtime variable can reach.
 * So there are now two builds, and the dangerous one is the *wrong* build
 * starting successfully.
 *
 * That is what makes this worth a spec rather than a comment. A VPS bundle
 * under Electron does not error. It boots, serves, and looks right — while
 * registering a service worker whose NetworkFirst rule caches `/api/*` from a
 * port that will not exist next launch, keeping a bearer-token endpoint open on
 * loopback, and offering a Logout button with no way back. Every symptom is an
 * absence, so nothing reports it.
 *
 * Same shape as `cluster.js`'s post-hoc `_prisma_migrations` count (§11.3):
 * the flag is read back out of the artifact, not assumed from the path it was
 * found at.
 */

const bundle = (env: unknown, buildDir = ".next-desktop") => {
  const standalone = mkdtempSync(path.join(tmpdir(), "desktop-bundle-"));
  mkdirSync(path.join(standalone, buildDir), { recursive: true });
  writeFileSync(
    path.join(standalone, buildDir, "required-server-files.json"),
    JSON.stringify({ config: { distDir: buildDir, ...(env === undefined ? {} : { env }) } }),
  );
  return standalone;
};

describe("assertDesktopBundle", () => {
  const made: string[] = [];
  const make = (env: unknown, buildDir?: string) => {
    const dir = bundle(env, buildDir);
    made.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a bundle built with DESKTOP=1", () => {
    expect(() => assertDesktopBundle(make({ NEXT_PUBLIC_DESKTOP: "1" })))
      .not.toThrow();
  });

  /**
   * The case that matters: `pnpm build`'s output, which is what is sitting in
   * `.next` on every developer's machine and what phase 6 could package by
   * mistake. `next.config.ts` writes the key as `""` there rather than omitting
   * it, so "the key is present" is not the question — its value is.
   */
  it("refuses the VPS bundle, whose flag is the empty string", () => {
    expect(() => assertDesktopBundle(make({ NEXT_PUBLIC_DESKTOP: "" })))
      .toThrow(/not a desktop build/);
  });

  it("refuses a bundle from a Next that never saw the flag", () => {
    expect(() => assertDesktopBundle(make({}))).toThrow(/not a desktop build/);
    expect(() => assertDesktopBundle(make(undefined))).toThrow(/not a desktop build/);
  });

  it("names the command that produces the right one", () => {
    expect(() => assertDesktopBundle(make({ NEXT_PUBLIC_DESKTOP: "" })))
      .toThrow(/pnpm build:desktop/);
  });

  it("reads the manifest from the bundle's own distDir", () => {
    // `output: "standalone"` reproduces the dist directory by name inside the
    // copy, so the manifest is at `standalone/<distDir>/…` and there is no
    // `.next` to fall back on. Looking in the wrong place must fail loudly
    // rather than wave the bundle through.
    const dir = make({ NEXT_PUBLIC_DESKTOP: "1" }, ".next-elsewhere");
    expect(() => assertDesktopBundle(dir, ".next-elsewhere")).not.toThrow();
    expect(() => assertDesktopBundle(dir, ".next-desktop"))
      .toThrow(/Could not read/);
  });

  it("refuses rather than assumes when the manifest is unreadable", () => {
    const standalone = mkdtempSync(path.join(tmpdir(), "desktop-bundle-"));
    made.push(standalone);
    expect(() => assertDesktopBundle(standalone)).toThrow(/Could not read/);
  });
});

/**
 * `next-pwa`'s `dest: "public"` writes the service worker into the *source*
 * tree, so `public/` is the one directory the two builds share. A desktop
 * bundle assembled from it would serve a `/sw.js` the web build left behind —
 * inert, since nothing registers it, but a loose end where the whole claim is
 * "there is no service worker here".
 */
describe("PWA_ARTIFACTS", () => {
  it.each([
    "sw.js",
    "sw.js.map",
    "workbox-b5e64f81.js",
    "workbox-b5e64f81.js.map",
    "worker-abc123.js",
    "fallback-cPOqacKSHD5_EGu7nCf2f.js",
  ])("excludes %s", (name) => {
    expect(PWA_ARTIFACTS.test(name)).toBe(true);
  });

  it.each([
    "favicon.ico",
    "manifest.json",
    "logo.svg",
    "attachment-viewer.js",
    "pwa-512x512.png",
    "maskable-icon-512x512.png",
    "fonts",
    "geogebra",
    "icons",
    // Not ours, and not matched: a `sw.js` nested under a directory is reached
    // through that directory's own link, and the test is per top-level entry.
    "swagger.js",
    "workbox.md",
  ])("keeps %s", (name) => {
    expect(PWA_ARTIFACTS.test(name)).toBe(false);
  });
});
