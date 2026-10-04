/**
 * The `/sessions` dashboard's arithmetic (docs/plans/remote-claude.md §4.10).
 */
import type { RemoteStats } from "@/lib/claudeSessions/types";
import {
  barFractions,
  compactNumber,
  dayTicks,
  formatDay,
  formatHour,
  hourRange,
  peakIndex,
  statsEmpty,
  topTools,
} from "../statsModel";

describe("formatDay", () => {
  it("reads a calendar date without shifting it through a time zone", () => {
    expect(formatDay("2026-10-04")).toBe("Oct 4");
    expect(formatDay("2026-01-01")).toBe("Jan 1");
    expect(formatDay("2026-12-31")).toBe("Dec 31");
  });

  it("returns anything else unchanged", () => {
    expect(formatDay("2026-13-01")).toBe("2026-13-01");
    expect(formatDay("yesterday")).toBe("yesterday");
  });
});

describe("hours", () => {
  it("pads and wraps", () => {
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(9)).toBe("09:00");
    expect(hourRange(9)).toBe("09:00–10:00");
    expect(hourRange(23)).toBe("23:00–00:00");
  });
});

describe("compactNumber", () => {
  it("comma-groups below ten thousand and compacts above", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(1284)).toBe("1,284");
    expect(compactNumber(12_900)).toBe("12.9K");
    expect(compactNumber(20_000)).toBe("20K");
    expect(compactNumber(4_200_000)).toBe("4.2M");
  });
});

describe("bars", () => {
  it("scales to the largest value", () => {
    expect(barFractions([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it("is all zero rather than NaN when nothing happened", () => {
    expect(barFractions([0, 0])).toEqual([0, 0]);
    expect(barFractions([])).toEqual([]);
  });

  it("finds the first peak, or none", () => {
    expect(peakIndex([1, 4, 4, 2])).toBe(1);
    expect(peakIndex([0, 0])).toBeNull();
  });

  it("puts ticks at first, middle and last", () => {
    expect(dayTicks(30)).toEqual([0, 14, 29]);
    expect(dayTicks(1)).toEqual([0]);
    expect(dayTicks(2)).toEqual([0, 1]);
    expect(dayTicks(0)).toEqual([]);
  });
});

describe("topTools", () => {
  const tools = Array.from({ length: 13 }, (_, i) => ({ name: `T${i}`, count: 100 - i }));

  it("keeps the top n and folds the rest into one Other row", () => {
    const top = topTools(tools, 10);
    expect(top).toHaveLength(11);
    expect(top.slice(0, 10).map((t) => t.name)).toEqual(tools.slice(0, 10).map((t) => t.name));
    expect(top[10]).toEqual({ name: "Other (3)", count: 90 + 89 + 88, other: true });
  });

  it("has no Other row when everything fits", () => {
    expect(topTools(tools.slice(0, 3), 10).some((t) => t.other)).toBe(false);
  });

  it("orders by count, ties by name, whatever order arrives", () => {
    expect(topTools([{ name: "b", count: 1 }, { name: "a", count: 1 }, { name: "c", count: 5 }]).map((t) => t.name))
      .toEqual(["c", "a", "b"]);
  });
});

describe("statsEmpty", () => {
  const base: RemoteStats = {
    totals: {
      hosts: 1,
      projects: 0,
      sessions: 0,
      subagentRuns: 0,
      userMsgs: 0,
      assistantMsgs: 0,
      toolCalls: 0,
      activeMs: 0,
      first: null,
      last: null,
    },
    perProject: [],
    perDay: [],
    byHour: Array(24).fill(0),
    tools: [],
  };

  it("is empty with no sessions and no subagent runs", () => {
    expect(statsEmpty(base)).toBe(true);
    expect(statsEmpty({ ...base, totals: { ...base.totals, subagentRuns: 1 } })).toBe(false);
  });
});
