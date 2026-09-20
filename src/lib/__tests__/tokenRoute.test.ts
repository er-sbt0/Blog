/**
 * `tokenRoute` — the fourth route wrapper (docs/plans/archive/mcp-support.md §4.2).
 *
 * CLAUDE.md's standing warning is that **no automated check covers API
 * authorization**, which is true of every route resolved through a session:
 * the wrapper reaches for NextAuth and there is nothing to point it at. Bearer
 * auth has no such excuse — the credential arrives in a header — so the checks
 * §7 lists for the endpoint are written here, against the wrapper that decides
 * them, rather than left to a manual pass against a running server.
 *
 * The property under test throughout is that **a refusal tells the caller
 * nothing**. Unknown, revoked and expired must be one indistinguishable
 * answer; anything else reports on credentials to whoever asks about them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAgentToken = vi.fn();
const touchAgentToken = vi.fn();

vi.mock("@/lib/agentTokens", () => ({
  verifyAgentToken: (...args: unknown[]) => verifyAgentToken(...args),
  touchAgentToken: (...args: unknown[]) => touchAgentToken(...args),
}));
// Neither is reached on a token route; they are mocked so importing the module
// does not drag NextAuth's server half into a node test.
vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve(null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const { tokenRoute } = await import("../api-utils");

const TOKEN = {
  id: "tok-1",
  userId: "author-a",
  name: "laptop",
  scopes: ["read", "propose"],
  createdAt: new Date(),
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
};

/** A route that reports which token reached it. */
const handler = vi.fn(async (_request: Request, { token }: { token: typeof TOKEN }) =>
  Response.json({ sawUserId: token.userId })
);
const route = tokenRoute(handler as never, { errorLabel: "test route" });

const request = (authorization?: string) =>
  new Request("https://blog.example/api/mcp", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  touchAgentToken.mockResolvedValue(undefined);
});

describe("tokenRoute", () => {
  it("hands a verified token to the handler", async () => {
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });

    const response = await route(request("Bearer blog_pat_x"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sawUserId: "author-a" });
  });

  it("accepts the scheme case-insensitively, and passes only the secret", async () => {
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });

    await route(request("bearer blog_pat_x"));

    // The scheme must be stripped: verifying "Bearer blog_pat_x" would hash the
    // whole header and never match anything.
    expect(verifyAgentToken).toHaveBeenCalledWith("blog_pat_x");
  });

  it("records the use, throttled inside", async () => {
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });
    await route(request("Bearer blog_pat_x"));
    expect(touchAgentToken).toHaveBeenCalledWith(TOKEN);
  });

  it("answers a missing, malformed, unknown, revoked or expired credential identically", async () => {
    const answers: string[] = [];
    const cases: Array<[string | undefined, unknown]> = [
      [undefined, { ok: false, reason: "malformed" }],
      ["Basic abc", { ok: false, reason: "malformed" }],
      ["Bearer nonsense", { ok: false, reason: "malformed" }],
      ["Bearer blog_pat_x", { ok: false, reason: "unknown" }],
      ["Bearer blog_pat_x", { ok: false, reason: "revoked" }],
      ["Bearer blog_pat_x", { ok: false, reason: "expired" }],
    ];

    for (const [header, verdict] of cases) {
      verifyAgentToken.mockResolvedValue(verdict);
      const response = await route(request(header));

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
      answers.push(JSON.stringify(await response.json()));
    }

    // One distinct body across every refusal. If this ever fails, the endpoint
    // has started confirming which secrets were once real.
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).not.toMatch(/revoked|expired|unknown|malformed/i);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 403 when the owning account is disabled", async () => {
    // Distinguishable on purpose, and safe: getting here already required a
    // valid credential, so it tells the caller nothing they did not hold.
    verifyAgentToken.mockResolvedValue({ ok: false, reason: "disabled" });

    const response = await route(request("Bearer blog_pat_x"));

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("never runs the handler without a token", async () => {
    verifyAgentToken.mockResolvedValue({ ok: false, reason: "unknown" });
    await route(request());
    await route(request("Bearer blog_pat_x"));
    expect(handler).not.toHaveBeenCalled();
  });
});

/**
 * The desktop build has no remote agent surface (docs/plans/desktop-app.md §5).
 *
 * The endpoint exists so an agent *elsewhere* can reach the content; on desktop
 * the stdio MCP server is in the same process tree, so what is left is a bearer
 * credential accepted by a loopback listener — and the three token budgets on
 * `/api/mcp` exist to bound a public credential that cannot leak in that build.
 *
 * Two claims, and the second is the one that matters. It is not enough that the
 * route answers 404: the refusal has to land **before** `requireAgentToken`
 * reads the header, or a desktop build is still a process that authenticates
 * bearer tokens and merely declines to serve them.
 */
describe("tokenRoute in the desktop build", () => {
  const original = process.env.DESKTOP;
  beforeEach(() => {
    process.env.DESKTOP = "1";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DESKTOP;
    else process.env.DESKTOP = original;
  });

  it("answers 404 with a valid token", async () => {
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });

    const response = await route(request("Bearer blog_pat_x"));

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("never reads the credential at all", async () => {
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });

    await route(request("Bearer blog_pat_x"));

    expect(verifyAgentToken).not.toHaveBeenCalled();
    expect(touchAgentToken).not.toHaveBeenCalled();
  });

  /**
   * 404 rather than 403 or 401: the route is not refusing *this caller*, it is
   * not in this build. A 401 with `WWW-Authenticate: Bearer` would invite
   * someone to go and find a token that cannot work.
   */
  it("does not advertise a credential that would work", async () => {
    const response = await route(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("leaves the route intact once the flag is off again", async () => {
    delete process.env.DESKTOP;
    verifyAgentToken.mockResolvedValue({ ok: true, token: TOKEN });

    const response = await route(request("Bearer blog_pat_x"));

    expect(response.status).toBe(200);
    expect(verifyAgentToken).toHaveBeenCalledOnce();
  });
});
