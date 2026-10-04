import { ApiError, refuseOffDesktop, refuseOnDesktop } from "@/lib/api-utils";

/**
 * The two build gates (docs/plans/desktop-app.md §5, remote-claude.md §3). Both
 * answer 404, never 403: in the wrong build the route is not forbidden, it is
 * not there. And both key on `DESKTOP=1` exactly — a gate inferred from some
 * other setting being absent is one a misconfigured VPS also satisfies.
 */

const statusOf = (fn: () => void): number | null => {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return (error as ApiError).status;
  }
};

describe("build gates", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a desktop-only feature off the desktop build, with 404", () => {
    for (const value of [undefined, "", "0", "true"]) {
      vi.stubEnv("DESKTOP", value);
      expect(statusOf(() => refuseOffDesktop("Remote sessions"))).toBe(404);
    }
    vi.stubEnv("DESKTOP", "1");
    expect(statusOf(() => refuseOffDesktop("Remote sessions"))).toBeNull();
  });

  it("refuses a server-only feature on the desktop build, with 404", () => {
    vi.stubEnv("DESKTOP", "1");
    expect(statusOf(() => refuseOnDesktop("Cache revalidation"))).toBe(404);
    vi.stubEnv("DESKTOP", undefined);
    expect(statusOf(() => refuseOnDesktop("Cache revalidation"))).toBeNull();
  });
});
