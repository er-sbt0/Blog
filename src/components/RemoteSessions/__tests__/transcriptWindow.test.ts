/**
 * Opening a transcript at an entry, and growing the loaded window from there
 * (docs/plans/remote-claude.md §4.7, §4.9).
 */
import type { RemoteEntryRow } from "@/lib/claudeSessions/types";
import { buildRows } from "../transcriptModel";
import {
  nextPage,
  pageStartFor,
  parseEntryParam,
  placePage,
  prevPage,
  rowForEntry,
} from "../transcriptWindow";

describe("page math", () => {
  it("starts at the page holding the entry", () => {
    expect(pageStartFor(0, 500)).toBe(0);
    expect(pageStartFor(499, 500)).toBe(0);
    expect(pageStartFor(500, 500)).toBe(500);
    expect(pageStartFor(1234, 500)).toBe(1000);
    expect(pageStartFor(-3, 500)).toBe(0);
    expect(pageStartFor(Number.NaN, 500)).toBe(0);
  });

  it("asks for the page after the window until it reaches the total", () => {
    expect(nextPage({ start: 1000, end: 1500 }, 2200, 500)).toEqual({ from: 1500, limit: 500 });
    expect(nextPage({ start: 1000, end: 2200 }, 2200, 500)).toBeNull();
  });

  it("asks for the page before the window, ending exactly at its start", () => {
    expect(prevPage({ start: 1000, end: 1500 }, 500)).toEqual({ from: 500, limit: 500 });
    expect(prevPage({ start: 200, end: 700 }, 500)).toEqual({ from: 0, limit: 200 });
    expect(prevPage({ start: 0, end: 500 }, 500)).toBeNull();
  });

  it("places a page at the edge it was asked for, and drops a stale one", () => {
    const w = { start: 1000, end: 1500 };
    expect(placePage(w, { from: 1500, limit: 500 })).toBe("append");
    expect(placePage(w, { from: 500, limit: 500 })).toBe("prepend");
    expect(placePage(w, { from: 0, limit: 500 })).toBe("stale");
    expect(placePage(w, { from: 1600, limit: 500 })).toBe("stale");
  });

  it("walks a window from the middle out to the whole transcript without overlap or gap", () => {
    const total = 1730;
    const page = 500;
    const start = pageStartFor(1234, page);
    let w = { start, end: Math.min(total, start + page) };
    const seen = new Set<number>();
    for (let i = w.start; i < w.end; i++) seen.add(i);
    for (let req = prevPage(w, page); req; req = prevPage(w, page)) {
      for (let i = req.from; i < req.from + req.limit; i++) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
      w = { ...w, start: req.from };
    }
    for (let req = nextPage(w, total, page); req; req = nextPage(w, total, page)) {
      const end = Math.min(total, req.from + req.limit);
      for (let i = req.from; i < end; i++) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
      w = { ...w, end };
    }
    expect(seen.size).toBe(total);
  });
});

describe("parseEntryParam", () => {
  it("accepts a non-negative integer only", () => {
    expect(parseEntryParam("42")).toBe(42);
    expect(parseEntryParam("0")).toBe(0);
    expect(parseEntryParam(["7", "8"])).toBe(7);
    for (const bad of ["", "-1", "1.5", "1e3", "abc", " 4", undefined, null]) {
      expect(parseEntryParam(bad)).toBeNull();
    }
  });
});

describe("rowForEntry", () => {
  let idx = 100;
  const e = (kind: RemoteEntryRow["kind"], body: RemoteEntryRow["body"]): RemoteEntryRow => ({
    idx: idx++,
    kind,
    uuid: null,
    parentUuid: null,
    at: null,
    tool: null,
    body,
  });
  const entries = [
    e("prompt", { text: "hi" }), // 100
    e("thinking", { text: "hmm" }), // 101
    e("tool_use", { id: "t1", name: "Bash", input: { command: "ls" } }), // 102
    e("tool_result", { toolUseId: "t1", content: "a", isError: false }), // 103
    e("assistant", { text: "done" }), // 104
  ];
  const rows = buildRows(entries, { showThinking: false, showMeta: false });

  it("finds an entry's own row", () => {
    expect(rows[rowForEntry(rows, 104)].entry.idx).toBe(104);
  });

  it("finds a result folded into its call's row", () => {
    expect(rows[rowForEntry(rows, 103)].entry.idx).toBe(102);
  });

  it("falls to the next row for a hidden entry, else the last before it", () => {
    expect(rows[rowForEntry(rows, 101)].entry.idx).toBe(102);
    expect(rows[rowForEntry(rows, 999)].entry.idx).toBe(104);
    expect(rowForEntry([], 5)).toBe(-1);
  });
});
