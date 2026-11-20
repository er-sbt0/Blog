import {
  ACCEPT_EDITS,
  createCanUseTool,
  createPermissionBroker,
  grantsFromSuggestions,
  grantsToOptions,
  grantsToUpdates,
  isGrant,
  reconcileGrants,
} from "../agentPermissions.js";

/**
 * The permission broker behind an agent block's cards
 * (docs/plans/archive/agent-block.md phase 2). The claims are all about what happens
 * when the author does *not* say yes: every way a question can end unanswered
 * is a deny, an answer counts only from the window that was asked, and
 * "always" grants exactly what main derived — never what a renderer names.
 */

type Owner = { id: string; isDestroyed: () => boolean };
const owner = (id: string): Owner => ({ id, isDestroyed: () => false });

/** A broker with a hand-cranked clock and a record of what it sent. */
function harness(timeoutMs = 1000) {
  const sent: { owner: Owner; event: Record<string, unknown> }[] = [];
  const timers: { fire: () => void; at: number; cleared: boolean }[] = [];
  let n = 0;
  const broker = createPermissionBroker({
    notify: (to: Owner, event: Record<string, unknown>) => sent.push({ owner: to, event }),
    timeoutMs,
    mintId: () => `req-${++n}`,
    setTimer: (fire: () => void, at: number) => {
      const timer = { fire, at, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer: { cleared: boolean }) => {
      timer.cleared = true;
    },
  });
  const elapse = () => {
    for (const timer of timers) if (!timer.cleared) timer.fire();
  };
  return { broker, sent, timers, elapse };
}

const card = (always: string[] = []) => ({ kind: "tool", tool: "Bash", label: "Bash · ls", always });

describe("the permission broker", () => {
  it("sends the card to the owner with a minted id and resolves on its answer", async () => {
    const { broker, sent } = harness();
    const a = owner("a");
    const answer = broker.request({ owner: a, sessionId: "s1", card: card() });
    expect(sent[0].owner).toBe(a);
    expect(sent[0].event).toMatchObject({ type: "permission", requestId: "req-1", sessionId: "s1" });
    expect(broker.answer(a, "req-1", "allow")).toBe(true);
    await expect(answer).resolves.toEqual({ decision: "allow", reason: "answered" });
    expect(sent[1].event).toMatchObject({
      type: "permission-resolved",
      requestId: "req-1",
      decision: "allow",
      reason: "answered",
    });
  });

  it("denies a card nobody answers once the timeout passes", async () => {
    const { broker, timers, elapse } = harness(600_000);
    const answer = broker.request({ owner: owner("a"), sessionId: "s1", card: card() });
    expect(timers[0].at).toBe(600_000);
    elapse();
    await expect(answer).resolves.toEqual({ decision: "deny", reason: "expired" });
    // Too late: the question is gone.
    expect(broker.answer(owner("a"), "req-1", "allow")).toBe(false);
  });

  it("ignores an answer from another window, for an unknown id, or with a bad decision", async () => {
    const { broker } = harness();
    const a = owner("a");
    const answer = broker.request({ owner: a, sessionId: "s1", card: card() });
    expect(broker.answer(owner("b"), "req-1", "allow")).toBe(false);
    expect(broker.answer(a, "req-404", "allow")).toBe(false);
    expect(broker.answer(a, "req-1", "yes please")).toBe(false);
    expect(broker.answer(a, 42 as unknown as string, "allow")).toBe(false);
    expect(broker.pendingFor("s1")).toEqual(["req-1"]);
    broker.answer(a, "req-1", "deny");
    await expect(answer).resolves.toEqual({ decision: "deny", reason: "answered" });
  });

  it("refuses 'always' on a card that did not offer it", () => {
    const { broker } = harness();
    const a = owner("a");
    broker.request({ owner: a, sessionId: "s1", card: card([]) });
    expect(broker.answer(a, "req-1", "always")).toBe(false);
    broker.request({ owner: a, sessionId: "s1", card: card(["Bash(ls *)"]) });
    expect(broker.answer(a, "req-2", "always")).toBe(true);
  });

  it("denies a session's cards on interrupt, and only that session's", async () => {
    const { broker } = harness();
    const a = owner("a");
    const one = broker.request({ owner: a, sessionId: "s1", card: card() });
    const two = broker.request({ owner: a, sessionId: "s1", card: card() });
    broker.request({ owner: a, sessionId: "s2", card: card() });
    expect(broker.denySession("s1")).toBe(2);
    await expect(one).resolves.toEqual({ decision: "deny", reason: "interrupted" });
    await expect(two).resolves.toEqual({ decision: "deny", reason: "interrupted" });
    expect(broker.pendingFor("s2")).toEqual(["req-3"]);
  });

  it("denies a window's cards when it goes, and a destroyed window is never asked", async () => {
    const { broker, sent } = harness();
    const a = owner("a");
    const open = broker.request({ owner: a, sessionId: "s1", card: card() });
    broker.denyOwner(a);
    await expect(open).resolves.toEqual({ decision: "deny", reason: "closed" });

    const gone = { id: "gone", isDestroyed: () => true };
    const count = sent.length;
    await expect(broker.request({ owner: gone, sessionId: "s1", card: card() })).resolves
      .toEqual({ decision: "deny", reason: "closed" });
    expect(sent.length).toBe(count);
  });

  it("denies when the SDK cancels the request", async () => {
    const { broker } = harness();
    const controller = new AbortController();
    const open = broker.request({ owner: owner("a"), sessionId: "s1", card: card(), signal: controller.signal });
    controller.abort();
    await expect(open).resolves.toEqual({ decision: "deny", reason: "cancelled" });
  });
});

describe("canUseTool", () => {
  const options = (extra: Record<string, unknown> = {}) => ({
    signal: new AbortController().signal,
    toolUseID: "t",
    requestId: "r",
    ...extra,
  });

  it("allows the session's own doc tools without asking", async () => {
    const ask = vi.fn();
    const canUseTool = createCanUseTool({ docServer: "doc", ask, onGrant: vi.fn() });
    await expect(
      canUseTool("mcp__doc__apply_ops", { ops: [] }, options({ mcpServer: { name: "doc", source: "sdk" } })),
    ).resolves.toMatchObject({ behavior: "allow" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks for a configured server that is merely named `doc`", async () => {
    const ask = vi.fn(async () => ({ decision: "deny", reason: "answered" }));
    const canUseTool = createCanUseTool({ docServer: "doc", ask, onGrant: vi.fn() });
    const result = await canUseTool(
      "mcp__doc__apply_ops",
      {},
      options({ mcpServer: { name: "doc", source: "user" } }),
    );
    expect(ask).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ behavior: "deny" });
  });

  it("puts the command on a Bash card and offers the CLI's rule as 'always'", async () => {
    const ask = vi.fn(async (_card: Record<string, unknown>, _signal?: AbortSignal) => ({
      decision: "allow",
      reason: "answered",
    }));
    const canUseTool = createCanUseTool({ docServer: "doc", ask, onGrant: vi.fn() });
    const input = { command: "touch a.txt", description: "Create a file" };
    await expect(
      canUseTool("Bash", input, options({
        suggestions: [
          {
            type: "addRules",
            rules: [{ toolName: "Bash", ruleContent: "touch *" }],
            behavior: "allow",
            destination: "localSettings",
          },
          { type: "addDirectories", directories: ["/elsewhere"], destination: "session" },
        ],
      })),
    ).resolves.toEqual({ behavior: "allow", updatedInput: input });
    expect(ask.mock.calls[0][0]).toMatchObject({
      kind: "tool",
      tool: "Bash",
      summary: "touch a.txt",
      detail: "Create a file",
      always: ["Bash(touch *)"],
    });
  });

  it("'always' records the grant and scopes the update to the session", async () => {
    const onGrant = vi.fn();
    const canUseTool = createCanUseTool({
      docServer: "doc",
      ask: async () => ({ decision: "always", reason: "answered" }),
      onGrant,
    });
    const result = await canUseTool("Bash", { command: "touch a" }, options({
      suggestions: [{
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "touch *" }],
        behavior: "allow",
        destination: "localSettings",
      }],
    }));
    expect(onGrant).toHaveBeenCalledWith(["Bash(touch *)"]);
    // Never `localSettings`: that would write the grant into the folder.
    expect(result).toMatchObject({
      behavior: "allow",
      updatedPermissions: [{
        type: "addRules",
        destination: "session",
        rules: [{ toolName: "Bash", ruleContent: "touch *" }],
      }],
    });
  });

  it("offers no 'always' without a suggestion, or when the CLI suppresses one", async () => {
    const ask = vi.fn(async (_card: Record<string, unknown>, _signal?: AbortSignal) => ({
      decision: "always",
      reason: "answered",
    }));
    const onGrant = vi.fn();
    const canUseTool = createCanUseTool({ docServer: "doc", ask, onGrant });
    const result = await canUseTool("Bash", { command: "rm -rf build" }, options());
    expect(ask.mock.calls[0][0]).toMatchObject({ always: [] });
    // A forged "always" on a card that offered none is not an allow.
    expect(result).toMatchObject({ behavior: "deny" });
    expect(onGrant).not.toHaveBeenCalled();

    await canUseTool("Bash", { command: "x" }, options({
      suppressAlwaysAllowRule: true,
      suggestions: [{ type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" }],
    }));
    expect(ask.mock.calls[1][0]).toMatchObject({ always: [] });
  });

  it("denies an unanswered card and tells the model to stop", async () => {
    const canUseTool = createCanUseTool({
      docServer: "doc",
      ask: async () => ({ decision: "deny", reason: "expired" }),
      onGrant: vi.fn(),
    });
    const result = await canUseTool("WebFetch", { url: "https://x.test" }, options());
    expect(result).toMatchObject({ behavior: "deny" });
    expect(result.message).toMatch(/No one answered/);
    // Not an SDK interrupt: that ends the turn as an error (see the source).
    expect(result).not.toHaveProperty("interrupt");
  });
});

describe("grants", () => {
  it("come from the CLI's suggestions, accept-edits included", () => {
    expect(
      grantsFromSuggestions([
        { type: "setMode", mode: "acceptEdits", destination: "session" },
        {
          type: "addRules",
          rules: [{ toolName: "WebFetch", ruleContent: "domain:example.com" }],
          behavior: "allow",
          destination: "localSettings",
        },
        { type: "addRules", rules: [{ toolName: "Bash" }], behavior: "deny", destination: "session" },
      ]),
    ).toEqual([ACCEPT_EDITS, "WebFetch(domain:example.com)"]);
  });

  it("become allowedTools rules and a permission mode for each turn", () => {
    expect(grantsToOptions([ACCEPT_EDITS, "Bash(touch *)"])).toEqual({
      allowedRules: ["Bash(touch *)"],
      permissionMode: "acceptEdits",
    });
    expect(grantsToOptions([])).toEqual({ allowedRules: [], permissionMode: "default" });
    expect(grantsToUpdates([ACCEPT_EDITS])).toEqual([
      { type: "setMode", mode: "acceptEdits", destination: "session" },
    ]);
  });

  it("are narrowed by the block's claims and never widened by them", () => {
    const recorded = ["Bash(touch *)", "WebFetch(domain:example.com)"];
    // Withdrawn on the block: dropped.
    expect(reconcileGrants(recorded, ["Bash(touch *)"])).toEqual(["Bash(touch *)"]);
    // Claimed but never recorded by main: ignored.
    expect(reconcileGrants(recorded, ["Bash(touch *)", "Bash(*)", "Bash"])).toEqual([
      "Bash(touch *)",
    ]);
    expect(reconcileGrants(recorded, undefined)).toEqual([]);
    expect(reconcileGrants([], ["Bash(touch *)"])).toEqual([]);
  });

  it("reject what main would never have produced", () => {
    expect(isGrant("Bash(npm test *)")).toBe(true);
    expect(isGrant("mcp__blog-content__apply_ops")).toBe(true);
    expect(isGrant(ACCEPT_EDITS)).toBe(true);
    expect(isGrant("Bash(echo hi\nrm -rf /)")).toBe(false);
    expect(isGrant("")).toBe(false);
    expect(isGrant("@bypassPermissions")).toBe(false);
    expect(isGrant(7)).toBe(false);
  });
});
