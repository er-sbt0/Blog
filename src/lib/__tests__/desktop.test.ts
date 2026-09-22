import {
  type DesktopEnv,
  isDesktopBuild,
  publicSiteUrl,
} from "@/lib/desktop";

/**
 * The phase 5 gate (docs/plans/desktop-app.md §5).
 *
 * Almost every assertion here is about the flag being **off**, because off is
 * the VPS. A gate that fires when it should is a desktop build behaving oddly;
 * a gate that fires when it should not is the production site losing its
 * sitemap, its remote MCP endpoint and its sign-out button. The second is the
 * failure worth a spec.
 *
 * The other half is §4.2 and §13.2's shared rule, restated as tests: this is
 * decided by an explicit flag, never inferred from something else being absent.
 * Both of those sections record the same shape of bug — a misconfigured VPS
 * satisfying the "is this local?" condition and silently taking the local path.
 */

describe("isDesktopBuild", () => {
  it("is true only for DESKTOP=1", () => {
    expect(isDesktopBuild({ DESKTOP: "1" })).toBe(true);
  });

  it.each([
    ["unset", {}],
    ["empty", { DESKTOP: "" }],
    ["zero", { DESKTOP: "0" }],
    ["true", { DESKTOP: "true" }],
    ["yes", { DESKTOP: "yes" }],
    ["padded", { DESKTOP: " 1" }],
  ])("is false when %s", (_name, env: DesktopEnv) => {
    expect(isDesktopBuild(env)).toBe(false);
  });

  /**
   * The rule the plan states twice. `""` is what the shell's own closed
   * environment writes over every variable it means to suppress (§11.3), so a
   * flag that accepted "anything not undefined" would be true in the one build
   * that sets the most empty strings — and, worse, false-negative nowhere
   * visible on a VPS that simply never sets it.
   */
  it("does not infer desktop-ness from other configuration being absent", () => {
    const misconfiguredVps: DesktopEnv & { S3_ENDPOINT?: string } = {
      PUBLIC_URL: "",
      S3_ENDPOINT: "",
    };
    expect(isDesktopBuild(misconfiguredVps)).toBe(false);
  });
});

describe("publicSiteUrl", () => {
  it("is PUBLIC_URL on a web deployment", () => {
    expect(publicSiteUrl({ PUBLIC_URL: "https://blog.example" }))
      .toBe("https://blog.example");
  });

  it("is null on a web deployment that did not set PUBLIC_URL", () => {
    expect(publicSiteUrl({})).toBeNull();
    expect(publicSiteUrl({ PUBLIC_URL: "" })).toBeNull();
  });

  /**
   * The finding that made this a function rather than a `||`.
   *
   * The desktop shell *does* set `PUBLIC_URL`, to the loopback origin it picked
   * this launch, because the root layout's `metadataBase` would otherwise fall
   * back to `http://localhost:3000`. (`src/app/api/utils.ts` used to be the
   * louder reason — it self-fetched `/api/embed` through it — and no longer
   * reads an origin at all.) So "is PUBLIC_URL set" and "does this site have a
   * public address" are two questions with two different answers in exactly one
   * build, and every §5 caller wants the second.
   */
  it("is null in the desktop build even though PUBLIC_URL is set", () => {
    expect(publicSiteUrl({ DESKTOP: "1", PUBLIC_URL: "http://127.0.0.1:41234" }))
      .toBeNull();
  });

  it("leaves a loopback PUBLIC_URL alone when the flag is off", () => {
    expect(publicSiteUrl({ PUBLIC_URL: "http://127.0.0.1:3000" }))
      .toBe("http://127.0.0.1:3000");
  });
});
