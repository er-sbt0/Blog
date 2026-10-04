/**
 * The transcript viewer's rules without React (docs/plans/remote-claude.md
 * §4.7). Synthetic entries only — a real transcript is exactly where
 * credentials end up (§7 phase 2).
 */
import type { RemoteEntryRow } from "@/lib/claudeSessions/types";
import {
  buildRows,
  clipLines,
  editPairs,
  findRows,
  formatDuration,
  lineCount,
  lineDiff,
  promptRowIndices,
  stepIndex,
  subagentFor,
  toolSummary,
} from "../transcriptModel";

let idx = 0;
const e = (kind: RemoteEntryRow["kind"], body: RemoteEntryRow["body"]): RemoteEntryRow => ({
  idx: idx++,
  kind,
  uuid: null,
  parentUuid: null,
  at: null,
  tool: null,
  body,
});

describe("toolSummary", () => {
  it("names each tool by the field a reader recognises it by", () => {
    expect(toolSummary("Bash", { command: "ls -la\n  && pwd", description: "list" })).toBe("ls -la && pwd");
    expect(toolSummary("Read", { file_path: "/a/b.ts", limit: 10 })).toBe("/a/b.ts");
    expect(toolSummary("Edit", { old_string: "x", file_path: "/c.ts" })).toBe("/c.ts");
    expect(toolSummary("Grep", { path: "src", pattern: "foo.*bar" })).toBe("foo.*bar");
    expect(toolSummary("Glob", { pattern: "**/*.md" })).toBe("**/*.md");
    expect(toolSummary("Agent", { prompt: "long…", description: "Find callers" })).toBe("Find callers");
    expect(toolSummary("Task", { description: "Review" })).toBe("Review");
  });

  it("falls back to the first string input, and to nothing", () => {
    expect(toolSummary("mcp__x__y", { n: 3, query: "hello" })).toBe("hello");
    expect(toolSummary("Weird", { n: 3 })).toBe("");
    expect(toolSummary("Weird", null)).toBe("");
  });

  it("caps a long summary to one line", () => {
    const s = toolSummary("Bash", { command: "x".repeat(500) });
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("buildRows", () => {
  const use = e("tool_use", { id: "t1", name: "Bash", input: { command: "ls" } });
  const prompt = e("prompt", { text: "hi" });
  const think = e("thinking", { text: "hmm" });
  const meta = e("meta", { label: "x", text: "y" });
  const result = e("tool_result", { toolUseId: "t1", content: "a\nb", isError: false });
  const orphan = e("tool_result", { toolUseId: "elsewhere", content: "z", isError: true });

  it("folds a result into its call and keeps an orphan as its own row", () => {
    const rows = buildRows([prompt, use, result, orphan], { showThinking: false, showMeta: false });
    expect(rows.map((r) => r.entry.kind)).toEqual(["prompt", "tool_use", "tool_result"]);
    expect(rows[1].result).toBe(result);
    expect(rows[2].entry).toBe(orphan);
  });

  it("hides thinking and meta unless asked", () => {
    const all = [prompt, think, meta];
    expect(buildRows(all, { showThinking: false, showMeta: false })).toHaveLength(1);
    expect(buildRows(all, { showThinking: true, showMeta: false })).toHaveLength(2);
    expect(buildRows(all, { showThinking: true, showMeta: true })).toHaveLength(3);
  });

  it("leaves a call unpaired until its result's page has loaded", () => {
    const rows = buildRows([use], { showThinking: false, showMeta: false });
    expect(rows[0].result).toBeUndefined();
  });
});

describe("navigation and find", () => {
  const rows = buildRows(
    [
      e("prompt", { text: "First question" }),
      e("assistant", { text: "An answer about Paths" }),
      e("command", { name: "/clear", args: "" }),
      e("tool_use", { id: "q", name: "Read", input: { file_path: "/src/paths.ts" } }),
      e("prompt", { text: "Second" }),
    ],
    { showThinking: false, showMeta: false },
  );

  it("indexes prompts and slash commands", () => {
    expect(promptRowIndices(rows)).toEqual([0, 2, 4]);
  });

  it("steps strictly past the current row and stops at the ends", () => {
    const p = [0, 2, 4];
    expect(stepIndex(p, -1, 1)).toBe(0);
    expect(stepIndex(p, 0, 1)).toBe(2);
    expect(stepIndex(p, 3, 1)).toBe(4);
    expect(stepIndex(p, 4, 1)).toBeNull();
    expect(stepIndex(p, 4, -1)).toBe(2);
    expect(stepIndex(p, 0, -1)).toBeNull();
  });

  it("finds case-insensitively across text and tool input", () => {
    expect(findRows(rows, "PATHS")).toEqual([1, 3]);
    expect(findRows(rows, "  ")).toEqual([]);
  });
});

describe("results", () => {
  it("counts lines without the trailing newline, and none for empty", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("a\nb\n")).toBe(2);
  });

  it("clips at 200 lines and reports the total", () => {
    const text = Array.from({ length: 250 }, (_, i) => `l${i}`).join("\n");
    const c = clipLines(text);
    expect(c.clipped).toBe(true);
    expect(c.total).toBe(250);
    expect(c.text.split("\n")).toHaveLength(200);
    expect(clipLines("a\nb").clipped).toBe(false);
  });

  it("links an Agent result to its subagent run by agent id", () => {
    const subs = [{ id: "s1", agentId: "abc", title: null }];
    expect(subagentFor("abc", subs)?.id).toBe("s1");
    expect(subagentFor("zzz", subs)).toBeNull();
    expect(subagentFor(undefined, subs)).toBeNull();
  });
});

describe("lineDiff", () => {
  it("keeps common lines and marks the rest", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc")).toEqual([
      { op: " ", text: "a" },
      { op: "-", text: "b" },
      { op: "+", text: "B" },
      { op: " ", text: "c" },
    ]);
  });

  it("handles an empty side", () => {
    expect(lineDiff("", "x")).toEqual([{ op: "+", text: "x" }]);
    expect(lineDiff("x", "")).toEqual([{ op: "-", text: "x" }]);
  });

  it("degrades to remove-then-add past the table cap, still complete", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `${i}`).join("\n");
    const d = lineDiff(big, `${big}\nend`);
    expect(d.filter((l) => l.op === "-")).toHaveLength(2000);
    expect(d.filter((l) => l.op === "+")).toHaveLength(2001);
  });

  it("reads Edit and MultiEdit inputs, and nothing else", () => {
    expect(editPairs("Edit", { file_path: "f", old_string: "a", new_string: "b" })).toEqual([
      { before: "a", after: "b" },
    ]);
    expect(
      editPairs("MultiEdit", { edits: [{ old_string: "1", new_string: "2" }, { old_string: "3", new_string: "4" }] }),
    ).toHaveLength(2);
    expect(editPairs("Write", { content: "x" })).toBeNull();
    expect(editPairs("Edit", { old_string: 1 })).toBeNull();
  });
});

it("formats active time", () => {
  expect(formatDuration(30_000)).toBe("<1m");
  expect(formatDuration(5 * 60_000)).toBe("5m");
  expect(formatDuration(62 * 60_000)).toBe("1h 2m");
});
