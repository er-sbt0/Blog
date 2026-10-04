import { IDLE_GAP_MS, SEARCH_TEXT_CAP, guessCwd, parseTranscript } from "../parse";

/**
 * docs/plans/remote-claude.md §2.5 — the `model.py` rules, plus what the format
 * grew since (§7.1). Every fixture is written by hand: a real transcript must
 * never be committed, because it is exactly where credentials end up.
 */

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

let n = 0;
const ev = (o: Record<string, unknown>) =>
  JSON.stringify({ uuid: `u${++n}`, parentUuid: n > 1 ? `u${n - 1}` : null, cwd: "/home/dev/my_proj", gitBranch: "main", ...o });

const user = (content: unknown, ms: number, extra: Record<string, unknown> = {}) =>
  ev({ type: "user", timestamp: at(ms), message: { role: "user", content }, ...extra });
const assistant = (id: string, content: unknown[], ms: number) =>
  ev({ type: "assistant", timestamp: at(ms), message: { id, role: "assistant", content } });

const jsonl = (...lines: string[]) => lines.join("\n") + "\n";

describe("parseTranscript", () => {
  it("counts one API response split over several events as one message", () => {
    const { meta, entries } = parseTranscript(
      jsonl(
        user("hi", 0),
        assistant("msg_1", [{ type: "thinking", thinking: "hmm" }], 1000),
        assistant("msg_1", [{ type: "text", text: "Hello" }], 2000),
        assistant("msg_1", [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }], 3000),
      ),
      "-home-dev-my-proj",
    );
    expect(meta.assistantMsgs).toBe(1);
    expect(entries.map((e) => e.kind)).toEqual(["prompt", "thinking", "assistant", "tool_use"]);
  });

  it("does not count tool results as prompts, and names their tool", () => {
    const { meta, entries } = parseTranscript(
      jsonl(
        user("run it", 0),
        assistant("m1", [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }], 1000),
        user([{ type: "tool_result", tool_use_id: "t1", content: "a\nb", is_error: false }], 2000),
        user([{ type: "tool_result", tool_use_id: "t9", content: [{ type: "text", text: "x" }], is_error: true }], 3000),
      ),
      "p",
    );
    expect(meta.userMsgs).toBe(1);
    expect(meta.promptTimes).toEqual([at(0)]);
    const results = entries.filter((e) => e.kind === "tool_result");
    expect(results.map((e) => e.tool)).toEqual(["Bash", null]);
    expect(results[0].body).toEqual({ toolUseId: "t1", content: "a\nb", isError: false });
    expect(results[1].body).toMatchObject({ isError: true, content: "x" });
  });

  it("links an Agent call's result to its subagent run", () => {
    const { entries } = parseTranscript(
      jsonl(
        assistant("m1", [{ type: "tool_use", id: "t1", name: "Agent", input: { prompt: "go" } }], 0),
        user([{ type: "tool_result", tool_use_id: "t1", content: "done" }], 1000, {
          toolUseResult: { agentId: "a257325bf2fc2a3f5", status: "completed" },
        }),
      ),
      "p",
    );
    expect(entries[1].body).toMatchObject({ agentId: "a257325bf2fc2a3f5" });
  });

  it("reads slash commands as commands and other <…> text as injected", () => {
    const { meta, entries } = parseTranscript(
      jsonl(
        user("<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>", 0),
        user("<local-command-stdout></local-command-stdout>", 100),
        user([{ type: "text", text: "<system-reminder>be nice</system-reminder>" }], 200),
        user("a note", 300, { isMeta: true }),
        user("<command-name>/review</command-name><command-args>42 --fast</command-args>", 400),
      ),
      "p",
    );
    expect(entries.map((e) => e.kind)).toEqual(["command", "meta", "meta", "meta", "command"]);
    expect(entries[0].body).toEqual({ name: "/clear", args: "" });
    expect(entries[4].body).toEqual({ name: "/review", args: "42 --fast" });
    expect(entries[1].body).toMatchObject({ label: "local-command-stdout" });
    expect(meta.userMsgs).toBe(2);
    expect(meta.firstPrompt).toBeNull();
  });

  it("prefers a /rename over the AI title over the first prompt", () => {
    const base = [user("first line\nsecond line", 0)];
    expect(parseTranscript(jsonl(...base), "p").meta.title).toBe("first line");
    const ai = JSON.stringify({ type: "ai-title", aiTitle: "Fix the build", sessionId: "s" });
    expect(parseTranscript(jsonl(...base, ai), "p").meta.title).toBe("Fix the build");
    const custom = JSON.stringify({ type: "custom-title", customTitle: "Mine", sessionId: "s" });
    expect(parseTranscript(jsonl(custom, ...base, ai), "p").meta.title).toBe("Mine");
  });

  it("never turns bookkeeping events into rows", () => {
    const noise = ["attachment", "queue-operation", "mode", "permission-mode", "atis-latch", "last-prompt", "cost-state", "file-history-snapshot", "bridge-session"].map(
      (type) => JSON.stringify({ type, timestamp: at(0), sessionId: "s", attachment: { type: "x" } }),
    );
    const { entries, meta } = parseTranscript(jsonl(...noise, user("hi", 0)), "p");
    expect(entries.map((e) => e.kind)).toEqual(["prompt"]);
    expect(meta.startedAt).toBe(at(0));
  });

  it("takes the cwd from events, and guesses one from the directory only when none says", () => {
    expect(parseTranscript(jsonl(user("hi", 0)), "-home-dev-my-proj").meta).toMatchObject({
      cwd: "/home/dev/my_proj",
      cwdGuessed: false,
    });
    const noCwd = JSON.stringify({ type: "user", timestamp: at(0), message: { content: "hi" } });
    expect(parseTranscript(jsonl(noCwd), "-home-dev-my-proj").meta).toMatchObject({
      cwd: "/home/dev/my/proj",
      cwdGuessed: true,
    });
    expect(guessCwd("-home-dev-llvm")).toBe("/home/dev/llvm");
  });

  it("counts active time without idle gaps", () => {
    const { meta } = parseTranscript(
      jsonl(user("a", 0), assistant("m1", [{ type: "text", text: "b" }], 60_000), user("c", 60_000 + IDLE_GAP_MS + 1), assistant("m2", [{ type: "text", text: "d" }], 60_000 + IDLE_GAP_MS + 30_001)),
      "p",
    );
    expect(meta.activeMs).toBe(60_000 + 30_000);
    expect(meta.startedAt).toBe(at(0));
    expect(meta.endedAt).toBe(at(60_000 + IDLE_GAP_MS + 30_001));
  });

  it("tallies tools, and survives lines that are not JSON", () => {
    const { meta, unparseable } = parseTranscript(
      jsonl(
        assistant("m1", [{ type: "tool_use", id: "1", name: "Read", input: {} }, { type: "tool_use", id: "2", name: "Read", input: {} }], 0),
        "{not json",
        assistant("m2", [{ type: "tool_use", id: "3", name: "Bash", input: {} }], 1),
      ),
      "p",
    );
    expect(unparseable).toBe(1);
    expect(meta.toolCalls).toBe(3);
    expect(meta.tools).toEqual({ Read: 2, Bash: 1 });
  });

  it("indexes lower-cased text, capped, and keeps the body whole", () => {
    const big = "X".repeat(SEARCH_TEXT_CAP + 100);
    const { entries } = parseTranscript(
      jsonl(
        assistant("m1", [{ type: "tool_use", id: "t", name: "Grep", input: { pattern: "FooBar" } }], 0),
        user([{ type: "tool_result", tool_use_id: "t", content: big }], 1),
      ),
      "p",
    );
    expect(entries[0].text).toContain("grep");
    expect(entries[0].text).toContain("foobar");
    expect(entries[1].text).toHaveLength(SEARCH_TEXT_CAP);
    expect((entries[1].body as { content: string }).content).toHaveLength(big.length);
  });

  it("records the tree links, and keeps a rewound branch in file order", () => {
    const a = JSON.stringify({ type: "user", uuid: "a", parentUuid: null, timestamp: at(0), message: { content: "one" } });
    const b = JSON.stringify({ type: "user", uuid: "b", parentUuid: "a", timestamp: at(1), message: { content: "abandoned" } });
    const c = JSON.stringify({ type: "user", uuid: "c", parentUuid: "a", timestamp: at(2), message: { content: "kept" } });
    const { entries } = parseTranscript(jsonl(a, b, c), "p");
    expect(entries.map((e) => [e.uuid, e.parentUuid, e.idx])).toEqual([
      ["a", null, 0],
      ["b", "a", 1],
      ["c", "a", 2],
    ]);
  });
});
