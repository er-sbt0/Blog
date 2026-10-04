import { dayInZone, fillDays, fillHours, isValidTimeZone, lastNDays, parseStatsParams } from "../stats";

/** docs/plans/remote-claude.md §4.10. */

describe("isValidTimeZone / parseStatsParams", () => {
  it("accepts IANA zones and UTC", () => {
    for (const tz of ["UTC", "Europe/London", "Asia/Jerusalem", "America/Argentina/Buenos_Aires", "Etc/GMT+5"]) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  });

  it("refuses offsets, junk and SQL-shaped input", () => {
    for (const tz of ["", "+05:00", "-03:00", "Mars/Olympus", "UTC'; DROP TABLE x;--", "a".repeat(65), "Europe/../x"]) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
  });

  it("defaults to UTC and passes host through", () => {
    expect(parseStatsParams(new URLSearchParams(""))).toEqual({ ok: true, value: { hostId: null, tz: "UTC" } });
    expect(parseStatsParams(new URLSearchParams("host=h&tz=Asia/Tokyo"))).toEqual({
      ok: true,
      value: { hostId: "h", tz: "Asia/Tokyo" },
    });
    expect(parseStatsParams(new URLSearchParams("tz=nowhere")).ok).toBe(false);
  });
});

describe("dayInZone", () => {
  it("is the calendar day in the zone, not in UTC", () => {
    const at = new Date("2026-10-04T22:30:00Z");
    expect(dayInZone(at, "UTC")).toBe("2026-10-04");
    expect(dayInZone(at, "Asia/Jerusalem")).toBe("2026-10-05");
    expect(dayInZone(new Date("2026-10-04T02:00:00Z"), "America/New_York")).toBe("2026-10-03");
  });
});

describe("lastNDays", () => {
  it("is 30 days ending today, oldest first", () => {
    const days = lastNDays("2026-10-04");
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-05");
    expect(days[29]).toBe("2026-10-04");
  });

  it("crosses month, year and leap day boundaries", () => {
    expect(lastNDays("2027-01-01", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(lastNDays("2028-03-01", 2)).toEqual(["2028-02-29", "2028-03-01"]);
  });

  it("neither skips nor repeats a day across a DST change", () => {
    const days = lastNDays("2026-11-05", 30);
    expect(new Set(days).size).toBe(30);
    expect(days).toContain("2026-11-01");
  });
});

describe("fillDays", () => {
  it("zero-fills days SQL had no rows for and drops days outside the window", () => {
    const days = ["2026-10-02", "2026-10-03", "2026-10-04"];
    expect(fillDays(days, [{ day: "2026-10-03", sessions: 4 }, { day: "2026-09-01", sessions: 9 }])).toEqual([
      { day: "2026-10-02", sessions: 0 },
      { day: "2026-10-03", sessions: 4 },
      { day: "2026-10-04", sessions: 0 },
    ]);
  });
});

describe("fillHours", () => {
  it("is 24 buckets indexed by hour, zero where empty", () => {
    const h = fillHours([{ hour: 0, count: 2 }, { hour: 23, count: 5 }, { hour: 9, count: 1 }]);
    expect(h).toHaveLength(24);
    expect(h[0]).toBe(2);
    expect(h[9]).toBe(1);
    expect(h[23]).toBe(5);
    expect(h.reduce((a, b) => a + b)).toBe(8);
  });

  it("ignores an out-of-range hour rather than growing the array", () => {
    expect(fillHours([{ hour: 24, count: 1 }, { hour: -1, count: 1 }])).toEqual(new Array(24).fill(0));
  });
});
