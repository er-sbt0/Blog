import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * `agentIpc.js` end to end over a fake `ipcMain` and a fake `agent.js`
 * (docs/plans/archive/agent-block.md phase 2): the permission round trip as the
 * renderer sees it, "always" enforced in main across a restart, and the
 * confirmation a claimed session needs before it runs. No window, no SDK — the
 * session is a stand-in that records what main handed it.
 */

const ipc = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Map<string, (...args: unknown[]) => unknown>(),
  folder: "",
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, fn),
    on: (channel: string, fn: (...args: unknown[]) => unknown) => ipc.listeners.set(channel, fn),
    removeHandler: (channel: string) => ipc.handlers.delete(channel),
    removeAllListeners: (channel: string) => ipc.listeners.delete(channel),
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [ipc.folder] }),
  },
}));

type Gate = ((signal: AbortSignal) => Promise<boolean>) | undefined;
type FakeSession = {
  sessionId: string;
  canUseTool: (name: string, input: unknown, options: unknown) => Promise<Record<string, unknown>>;
  grants: () => string[];
  executeTool: (name: string, input: unknown) => Promise<Record<string, unknown>>;
  sends: { prompt: string; gate: Gate }[];
  running: boolean;
  interrupted: number;
};
const created = vi.hoisted(() => [] as FakeSession[]);

vi.mock("../agent.js", () => ({
  createAgentSession: (options: {
    sessionId?: string;
    canUseTool: FakeSession["canUseTool"];
    grants: () => string[];
    executeTool: FakeSession["executeTool"];
  }) => {
    const session: FakeSession & { send: unknown; interrupt: unknown; close: unknown } = {
      sessionId: options.sessionId ?? "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10",
      canUseTool: options.canUseTool,
      grants: options.grants,
      executeTool: options.executeTool,
      sends: [],
      running: false,
      interrupted: 0,
      send(prompt: string, _context: unknown, extra: { gate?: Gate } = {}) {
        session.sends.push({ prompt, gate: extra.gate });
        return { ok: true };
      },
      interrupt() {
        session.interrupted += 1;
        return true;
      },
      close() {},
    };
    created.push(session);
    return session;
  },
}));

const { installAgent } = await import("../agentIpc.js");

type Sent = { channel: string; payload: Record<string, unknown> };
function window() {
  const sent: Sent[] = [];
  const contents = {
    sent,
    isDestroyed: () => false,
    send: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload }),
    once: () => {},
    on: () => {},
    events: (type: string) =>
      sent.filter((m) => m.channel === "agent:event" && m.payload.type === type).map((m) => m.payload),
  };
  return contents;
}

const invoke = (channel: string, sender: unknown, ...args: unknown[]) =>
  ipc.handlers.get(channel)!({ sender }, ...args) as Promise<Record<string, unknown>>;
const answer = (sender: unknown, requestId: unknown, decision: string) =>
  ipc.listeners.get("agent:permission-answer")!({ sender }, requestId, decision);

const BASH_SUGGESTION = {
  suggestions: [{
    type: "addRules",
    rules: [{ toolName: "Bash", ruleContent: "touch *" }],
    behavior: "allow",
    destination: "localSettings",
  }],
};
const turn = (prompt: string, grants: string[] = []) => ({
  prompt,
  grants,
  context: { title: "T", blockId: "", outline: "", selection: null },
});

let dir: string;
let sessionsFile: string;
let installed: { dispose: () => void } | null = null;
const install = () => {
  installed?.dispose();
  installed = installAgent({ workspace: dir, sessionsFile, log: () => {} });
  return installed;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ipc-"));
  ipc.folder = dir;
  sessionsFile = path.join(dir, "agent-sessions.json");
  created.length = 0;
});
afterEach(() => {
  installed?.dispose();
  installed = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("agent permissions over IPC", () => {
  it("runs a started session with no gate and asks its owner, not another window", async () => {
    install();
    const a = window();
    const b = window();
    const started = await invoke("agent:start", a, turn("go"));
    expect(started).toMatchObject({ ok: true });
    const [session] = created;
    // The folder dialog was the confirmation.
    expect(session.sends[0].gate).toBeUndefined();

    const decided = session.canUseTool("Bash", { command: "touch x" }, {
      signal: new AbortController().signal,
      ...BASH_SUGGESTION,
    });
    const [card] = a.events("permission");
    expect(card).toMatchObject({ kind: "tool", summary: "touch x", always: ["Bash(touch *)"] });
    expect(b.sent).toEqual([]);

    answer(b, card.requestId, "allow"); // not the owner: ignored
    answer(a, card.requestId, "deny");
    await expect(decided).resolves.toMatchObject({ behavior: "deny" });
  });

  it("enforces 'always' in main: kept across a restart only if the block still claims it", async () => {
    install();
    const a = window();
    const { sessionId } = await invoke("agent:start", a, turn("go"));
    const first = created[0];
    const decided = first.canUseTool("Bash", { command: "touch x" }, {
      signal: new AbortController().signal,
      ...BASH_SUGGESTION,
    });
    answer(a, a.events("permission")[0].requestId, "always");
    await decided;
    expect(first.grants()).toEqual(["Bash(touch *)"]);
    expect(a.events("grants").at(-1)).toMatchObject({ grants: ["Bash(touch *)"] });

    // Restart: a fresh install reads main's record, not the block.
    install();
    const again = window();
    // The block claims the real grant plus one main never recorded.
    await invoke("agent:send", again, sessionId, turn("more", ["Bash(touch *)", "Bash(*)"]));
    const resumed = created[1];
    expect(resumed.grants()).toEqual(["Bash(touch *)"]);
    // …and is told what main actually applies.
    expect(again.events("grants").at(-1)).toMatchObject({ grants: ["Bash(touch *)"] });

    // Withdrawn on the block: gone from main's record too.
    await invoke("agent:send", again, sessionId, turn("less", []));
    expect(resumed.grants()).toEqual([]);
    install();
    await invoke("agent:send", window(), sessionId, turn("again", ["Bash(touch *)"]));
    expect(created[2].grants()).toEqual([]);
  });

  it("asks a restored session to be resumed before its first turn, once", async () => {
    install();
    const { sessionId } = await invoke("agent:start", window(), turn("go"));
    install();

    const a = window();
    await invoke("agent:send", a, sessionId, turn("next"));
    const session = created[1];
    const gate = session.sends[0].gate!;
    expect(gate).toBeTypeOf("function");

    // Declined: the turn does not run.
    const declined = gate(new AbortController().signal);
    const [card] = a.events("permission");
    expect(card).toMatchObject({ kind: "resume", always: null });
    expect(String(card.title)).toContain(fs.realpathSync(dir));
    // A resume card has no "always".
    answer(a, card.requestId, "always");
    expect(a.events("permission-resolved")).toEqual([]);
    answer(a, card.requestId, "deny");
    await expect(declined).resolves.toBe(false);

    // Still unconfirmed, so the next send asks again; allowed, it runs.
    await invoke("agent:send", a, sessionId, turn("next"));
    const allowed = session.sends[1].gate!(new AbortController().signal);
    answer(a, a.events("permission")[1].requestId, "allow");
    await expect(allowed).resolves.toBe(true);

    // Confirmed: no gate on the turn after.
    await invoke("agent:send", a, sessionId, turn("after"));
    expect(session.sends[2].gate).toBeUndefined();

    // Another window claiming it has to confirm again.
    await invoke("agent:send", window(), sessionId, turn("elsewhere"));
    expect(session.sends[3].gate).toBeTypeOf("function");
  });

  it("an interrupt denies the session's open cards", async () => {
    install();
    const a = window();
    const { sessionId } = await invoke("agent:start", a, turn("go"));
    const decided = created[0].canUseTool("Bash", { command: "touch x" }, {
      signal: new AbortController().signal,
    });
    expect(await invoke("agent:interrupt", a, sessionId)).toBe(true);
    await expect(decided).resolves.toMatchObject({ behavior: "deny" });
    expect(a.events("permission-resolved")[0]).toMatchObject({ reason: "interrupted" });
    expect(created[0].interrupted).toBe(1);
  });
});

describe("insert_image over IPC (phase 3)", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

  it("reads the file in main, against main's folder, and sends bytes — never the path", async () => {
    install();
    const a = window();
    await invoke("agent:start", a, turn("go"));
    fs.mkdirSync(path.join(dir, "out"));
    fs.writeFileSync(path.join(dir, "out", "plot.png"), PNG);
    const [session] = created;

    const pending = session.executeTool("insert_image", {
      path: "out/plot.png",
      alt: "a plot",
      // A model-made `file` must not survive to the renderer.
      file: { bytes: [1, 2, 3], mime: "image/png", name: "forged" },
    });
    await vi.waitFor(() => expect(a.sent.some((m) => m.channel === "agent:tool-call")).toBe(true));
    const call = a.sent.find((m) => m.channel === "agent:tool-call")!.payload;
    const input = call.input as Record<string, unknown>;
    expect(input).not.toHaveProperty("path");
    expect(input.alt).toBe("a plot");
    const file = input.file as { bytes: Uint8Array; mime: string; name: string };
    expect(file.mime).toBe("image/png");
    expect(file.name).toBe("plot.png");
    expect([...file.bytes]).toEqual([...PNG]);

    ipc.listeners.get("agent:tool-result")!({ sender: a }, call.callId, { ok: true, text: "done" });
    await expect(pending).resolves.toEqual({ ok: true, text: "done" });
  });

  it("refuses a path outside the folder without asking the renderer anything", async () => {
    install();
    const a = window();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    const result = await session.executeTool("insert_image", { path: "../escape.png", alt: "" });
    expect(result.ok).toBe(false);
    expect(a.sent.some((m) => m.channel === "agent:tool-call")).toBe(false);
  });
});

describe("per-tool timeouts (phase 4)", () => {
  afterEach(() => vi.useRealTimers());

  it("gives draw_sketch past the 30 s an outline gets, and still times it out", async () => {
    install();
    const a = window();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    vi.useFakeTimers();

    const outlined = session.executeTool("outline", {});
    const drawn = session.executeTool("draw_sketch", { mermaid: "flowchart LR\n A-->B" });
    let drawnSettled = false;
    void drawn.then(() => {
      drawnSettled = true;
    });

    await vi.advanceTimersByTimeAsync(31_000);
    await expect(outlined).resolves.toMatchObject({ ok: false, error: /did not answer in time/ });
    expect(drawnSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(90_000);
    await expect(drawn).resolves.toMatchObject({ ok: false, error: /did not answer in time/ });
  });
});

/** A window whose `on`/`once` listeners the spec can fire. */
function liveWindow() {
  const base = window();
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const add = (name: string, fn: (...args: unknown[]) => void) =>
    handlers.set(name, [...(handlers.get(name) ?? []), fn]);
  return {
    ...base,
    on: add,
    once: add,
    emit: (name: string, ...args: unknown[]) => handlers.get(name)?.forEach((fn) => fn(...args)),
  };
}

describe("lifecycle (phase 6)", () => {
  it("a reload interrupts the page's running turns and denies its cards; the session stays", async () => {
    install();
    const a = liveWindow();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    session.running = true;
    const card = session.canUseTool("Bash", { command: "touch x" }, {
      signal: new AbortController().signal,
      ...BASH_SUGGESTION,
    });

    // A same-document navigation (Next's client routing) is not a reload.
    a.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
    expect(session.interrupted).toBe(0);

    a.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    expect(session.interrupted).toBe(1);
    await expect(card).resolves.toMatchObject({ behavior: "deny" });

    // The reloaded block sends its next prompt into the same session, no card.
    session.running = false;
    const sent = await invoke("agent:send", a, session.sessionId, turn("again"));
    expect(sent).toMatchObject({ ok: true });
    expect(created).toHaveLength(1);
    expect(session.sends.at(-1)?.gate).toBeUndefined();
  });

  it("a renderer crash interrupts too; an idle session is left alone", async () => {
    install();
    const a = liveWindow();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    a.emit("render-process-gone", {}, { reason: "crashed" });
    expect(session.interrupted).toBe(0);
    session.running = true;
    a.emit("render-process-gone", {}, { reason: "crashed" });
    expect(session.interrupted).toBe(1);
  });
});

describe("agent:transcript (phase 6)", () => {
  let config: string;
  const saved = process.env.CLAUDE_CONFIG_DIR;
  beforeEach(() => {
    config = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ipc-config-"));
    process.env.CLAUDE_CONFIG_DIR = config;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
    fs.rmSync(config, { recursive: true, force: true });
  });

  function transcriptFor(cwd: string, sessionId: string, body: string) {
    const projectDir = path.join(config, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), body);
  }

  it("reads the session's own file from main's folder, for its owner only", async () => {
    install();
    const a = window();
    const b = window();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    transcriptFor(fs.realpathSync(dir), session.sessionId, '{"type":"user"}\n');

    await expect(invoke("agent:transcript", a, session.sessionId)).resolves.toMatchObject({
      ok: true,
      text: '{"type":"user"}\n',
      truncated: false,
    });
    await expect(invoke("agent:transcript", b, session.sessionId)).resolves.toMatchObject({
      ok: false,
      error: /another window/,
    });
    for (const bad of ["../x", "", 42, null]) {
      await expect(invoke("agent:transcript", a, bad)).resolves.toMatchObject({ ok: false });
    }
  });

  it("after a restart, reads a recorded session for whichever window asks, and nothing unrecorded", async () => {
    install();
    const a = window();
    await invoke("agent:start", a, turn("go"));
    const [session] = created;
    transcriptFor(fs.realpathSync(dir), session.sessionId, "{}\n");
    install(); // A restart: main holds no session, only the record.

    const b = window();
    await expect(invoke("agent:transcript", b, session.sessionId)).resolves.toMatchObject({ ok: true });
    await expect(
      invoke("agent:transcript", b, "1b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10"),
    ).resolves.toMatchObject({ ok: false, error: /no record/ });
  });
});
