/**
 * `AgentBlockNode` (docs/plans/archive/agent-block.md §3.3, §6 q5), through the real
 * registry and the real render paths, because the claims are about what
 * *leaves* the editor: a stored block survives a load with its node state, and
 * its prompts and log reach neither `/view` (`generateServerHtml`) nor an agent
 * reading the post through the content bridge.
 */
import type { SerializedEditorState } from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "@/editor/config";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";
import { formatOutline, outline, readAll } from "@/lib/content-bridge";
import type { StoredState } from "@/lib/content-bridge";
import {
  appendCounted,
  appendLog,
  applyCardEvent,
  displayedStatus,
  droppedSummary,
  entriesForEvent,
  markAnswering,
  MAX_LOG_ENTRIES,
  MAX_LOG_TEXT,
  nextLiveStatus,
  outcomeOf,
  readAgentData,
} from "@/editor/nodes/AgentBlockNode/model";

const SECRET = "the agent quoted /home/me/.env here";

const agentJson = {
  type: "agent",
  version: 1,
  $: { blockId: "blk_agent1" },
  sessionId: "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10",
  cwd: "/home/me/project",
  prompts: ["write the intro", "shorter"],
  log: [
    { turn: 0, kind: "text", text: SECRET },
    { turn: 1, kind: "tool", text: "apply_ops · set_text" },
  ],
  status: "done",
};

const paragraph = (text: string) => ({
  type: "paragraph",
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  textFormat: 0,
  textStyle: "",
  children: [
    { type: "text", version: 1, text, detail: 0, format: 0, mode: "normal", style: "" },
  ],
});

const doc = {
  root: {
    type: "root",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    children: [paragraph("Before."), agentJson, paragraph("After.")],
  },
};

describe("AgentBlockNode", () => {
  it("round-trips through the real registry, node state included", () => {
    const editor = createHeadlessEditor({
      ...editorConfig,
      onError: (error) => {
        throw error;
      },
    });
    editor.setEditorState(editor.parseEditorState(JSON.stringify(doc)));
    const out = editor.getEditorState().toJSON().root.children[1];
    expect(out).toEqual(agentJson);
  });

  it("renders nothing into /view's HTML", async () => {
    const html = await generateServerHtml(doc as unknown as SerializedEditorState);
    expect(html).toContain("Before.");
    expect(html).toContain("After.");
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("write the intro");
    expect(html).not.toContain("/home/me/project");
  });

  it("is described to the content bridge, never read", () => {
    const state = doc as unknown as StoredState;
    const text = formatOutline(outline(state));
    expect(text).toContain("agent session · 2 turns");
    const whole = JSON.stringify(readAll(state));
    expect(whole).not.toContain(SECRET);
    expect(whole).not.toContain("write the intro");
  });
});

describe("the agent block's model", () => {
  it("reads anything back without throwing", () => {
    expect(readAgentData({})).toEqual({
      sessionId: null,
      cwd: null,
      prompts: [],
      log: [],
      status: "idle",
      context: null,
      grants: [],
      dropped: { entries: 0, bytes: 0 },
    });
    const odd = readAgentData({
      prompts: ["a", 3, null],
      log: [null, { text: 5 }, { text: "x", kind: "nope", turn: -1 }],
      status: "exploded",
    });
    expect(odd.prompts).toEqual(["a"]);
    expect(odd.log).toEqual([{ turn: 0, kind: "text", text: "x" }]);
    expect(odd.status).toBe("idle");
  });

  it("caps each entry and the log", () => {
    const long = appendLog([], [{ turn: 0, kind: "text", text: "y".repeat(10_000) }]);
    expect(long[0].text.length).toBe(MAX_LOG_TEXT);
    const many = appendLog(
      [],
      Array.from({ length: MAX_LOG_ENTRIES + 5 }, (_, i) => ({
        turn: 0,
        kind: "text" as const,
        text: String(i),
      })),
    );
    expect(many).toHaveLength(MAX_LOG_ENTRIES);
    expect(many[0].text).toBe("5");
  });

  it("counts what the caps cut, across turns, and says so", () => {
    const empty = { log: [], dropped: { entries: 0, bytes: 0 } };
    // 10 000 characters, of which MAX_LOG_TEXT - 1 are kept; "é" is two bytes.
    const first = appendCounted(empty, [{ turn: 0, kind: "text", text: "é".repeat(10_000) }]);
    expect(first.dropped).toEqual({ entries: 0, bytes: (10_000 - (MAX_LOG_TEXT - 1)) * 2 });
    const second = appendCounted(
      first,
      Array.from({ length: MAX_LOG_ENTRIES + 2 }, (_, i) => ({
        turn: 1,
        kind: "text" as const,
        text: String(i),
      })),
    );
    expect(second.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(second.dropped.entries).toBe(3);
    expect(second.dropped.bytes).toBe(first.dropped.bytes);

    expect(droppedSummary({ entries: 0, bytes: 0 }, true)).toBeNull();
    expect(droppedSummary(second.dropped, true)).toBe(
      "Not shown: 3 earlier entries and 12 KB cut from long entries — the full transcript has everything.",
    );
    expect(droppedSummary({ entries: 1, bytes: 0 }, false)).toBe(
      "Not shown: 1 earlier entry — not kept in the post.",
    );
  });

  it("stores the counts, and reads a log stored over the cap as dropped entries", () => {
    const stored = readAgentData({
      prompts: ["a"],
      log: Array.from({ length: MAX_LOG_ENTRIES + 4 }, (_, i) => ({ turn: 0, kind: "text", text: `${i}` })),
      status: "done",
      dropped: { entries: 10, bytes: 2048 },
    });
    expect(stored.dropped).toEqual({ entries: 14, bytes: 2048 });
    expect(readAgentData({ dropped: { entries: -3, bytes: "x" } }).dropped).toEqual({
      entries: 0,
      bytes: 0,
    });
  });

  it("turns events into entries and a live status", () => {
    const assistant = {
      sessionId: "s",
      type: "assistant" as const,
      text: "On it.",
      toolUses: ["mcp__doc__apply_ops"],
      toolCalls: [{ name: "mcp__doc__apply_ops", detail: "insert_blocks" }],
    };
    expect(entriesForEvent(assistant, 2)).toEqual([
      { turn: 2, kind: "text", text: "On it." },
      { turn: 2, kind: "tool", text: "apply_ops · insert_blocks" },
    ]);
    expect(nextLiveStatus({ phase: "thinking" }, assistant)).toEqual({
      phase: "tool",
      name: "apply_ops",
    });
    const ok = { sessionId: "s", type: "tool-result" as const, isError: false, preview: "x" };
    expect(entriesForEvent(ok, 0)).toEqual([]);
    expect(nextLiveStatus({ phase: "tool", name: "x" }, ok)).toEqual({ phase: "thinking" });
    expect(
      nextLiveStatus({ phase: "thinking" }, { sessionId: "s", type: "turn-end" }),
    ).toEqual({ phase: "idle" });
  });

  it("says how a turn ended", () => {
    const failed = [{ sessionId: "s", type: "error" as const, message: "boom" }];
    expect(outcomeOf([], false)).toBe("done");
    expect(outcomeOf(failed, false)).toBe("error");
    expect(outcomeOf(failed, true)).toBe("interrupted");
  });
});

describe("permission cards", () => {
  const sessionId = "s";
  const opened = {
    sessionId,
    type: "permission" as const,
    requestId: "r1",
    kind: "tool" as const,
    tool: "Bash",
    title: "",
    summary: "touch a.txt",
    detail: "",
    reason: "",
    blockedPath: "",
    defaultToNo: false,
    label: "Bash · touch a.txt",
    always: ["Bash(touch *)"],
    expiresInMs: 600_000,
  };

  it("open pending, stay open after a click, and close only on main's word", () => {
    let cards = applyCardEvent([], opened);
    expect(cards).toMatchObject([{ requestId: "r1", state: "pending", answering: false }]);
    expect(displayedStatus({ phase: "thinking" }, cards)).toEqual({ phase: "waiting" });

    cards = markAnswering(cards, "r1");
    expect(cards[0]).toMatchObject({ state: "pending", answering: true });

    cards = applyCardEvent(cards, {
      sessionId,
      type: "permission-resolved",
      requestId: "r1",
      decision: "always",
      reason: "answered",
      label: opened.label,
    });
    expect(cards[0]).toMatchObject({ state: "answered", text: "Always allowed" });
    expect(displayedStatus({ phase: "waiting" }, cards)).toEqual({ phase: "thinking" });
  });

  it("show an unanswered card as expired and log it as a denial", () => {
    const resolved = {
      sessionId,
      type: "permission-resolved" as const,
      requestId: "r1",
      decision: "deny" as const,
      reason: "expired" as const,
      label: opened.label,
    };
    expect(applyCardEvent(applyCardEvent([], opened), resolved)[0]).toMatchObject({
      state: "expired",
      text: "Denied — no answer in time",
    });
    expect(entriesForEvent(resolved, 2)).toEqual([
      { turn: 2, kind: "permission", text: "Denied — no answer in time: Bash · touch a.txt" },
    ]);
  });

  it("count a declined resume as a stop, not a failure", () => {
    const resume = { ...opened, requestId: "r2", kind: "resume" as const, always: null };
    const declined = {
      sessionId,
      type: "permission-resolved" as const,
      requestId: "r2",
      decision: "deny" as const,
      reason: "answered" as const,
      label: "Resume session",
    };
    expect(outcomeOf([resume, declined, { sessionId, type: "turn-end" }], false)).toBe(
      "interrupted",
    );
    // A denied *tool* is the author's answer inside a turn that still ran.
    expect(outcomeOf([opened, { ...declined, requestId: "r1" }], false)).toBe("done");
  });

  it("stores grants for display, tolerating junk", () => {
    expect(readAgentData({ grants: ["Bash(touch *)", 3, "", "Bash(touch *)"] }).grants)
      .toEqual(["Bash(touch *)"]);
    expect(readAgentData({}).grants).toEqual([]);
  });
});
