/**
 * Full-text search's client rules (docs/plans/remote-claude.md §4.9).
 * Synthetic hits only.
 */
import type { RemoteSearchHit } from "@/lib/claudeSessions/types";
import { SEARCH_MIN_LENGTH } from "@/lib/claudeSessions/types";
import {
  debounce,
  groupHits,
  highlightSegments,
  hitHref,
  hitLabel,
  projectLabel,
  searchGate,
  searchQueryString,
  sliceMatch,
} from "../searchModel";

const hit = (sessionId: string, idx: number, extra: Partial<RemoteSearchHit> = {}): RemoteSearchHit => ({
  sessionId,
  hostId: "h1",
  title: `title ${sessionId}`,
  projectDir: "-home-u-proj",
  cwd: "/home/u/proj",
  isSubagent: false,
  endedAt: null,
  idx,
  kind: "prompt",
  tool: null,
  snippet: "abc needle xyz",
  matchStart: 4,
  matchLength: 6,
  ...extra,
});

describe("searchGate", () => {
  it("is idle on blank input", () => {
    expect(searchGate("")).toEqual({ state: "idle" });
    expect(searchGate("   ")).toEqual({ state: "idle" });
  });

  it("holds back a query below the minimum with a hint, without trimming into it", () => {
    const short = "x".repeat(SEARCH_MIN_LENGTH - 1);
    const g = searchGate(` ${short} `);
    expect(g.state).toBe("short");
    expect(g.state === "short" && g.hint).toContain(String(SEARCH_MIN_LENGTH));
  });

  it("lets the minimum through, trimmed", () => {
    const q = "x".repeat(SEARCH_MIN_LENGTH);
    expect(searchGate(`  ${q}\n`)).toEqual({ state: "ready", q });
  });

  it("counts characters, not UTF-16 units", () => {
    // Two astral characters are four code units but two characters.
    expect(searchGate("😀😀").state).toBe(SEARCH_MIN_LENGTH > 2 ? "short" : "ready");
  });
});

describe("searchQueryString", () => {
  it("encodes the query and repeats kind", () => {
    const qs = new URLSearchParams(
      searchQueryString({ q: "a&b=c d", hostId: "h 1", kinds: ["prompt", "tool_use"], thinking: true }),
    );
    expect(qs.get("q")).toBe("a&b=c d");
    expect(qs.get("host")).toBe("h 1");
    expect(qs.getAll("kind")).toEqual(["prompt", "tool_use"]);
    expect(qs.get("thinking")).toBe("1");
  });

  it("omits what is not set", () => {
    const qs = new URLSearchParams(searchQueryString({ q: "abc" }));
    expect([...qs.keys()]).toEqual(["q"]);
  });
});

describe("groupHits", () => {
  it("keeps the server's session order and sorts hits by position within each", () => {
    const groups = groupHits([hit("s2", 40), hit("s1", 9), hit("s2", 3), hit("s1", 1)]);
    expect(groups.map((g) => g.sessionId)).toEqual(["s2", "s1"]);
    expect(groups[0].hits.map((h) => h.idx)).toEqual([3, 40]);
    expect(groups[1].hits.map((h) => h.idx)).toEqual([1, 9]);
    expect(groups[0].title).toBe("title s2");
  });

  it("is empty for no hits", () => {
    expect(groupHits([])).toEqual([]);
  });
});

describe("sliceMatch", () => {
  it("splits around the match", () => {
    expect(sliceMatch("abc needle xyz", 4, 6)).toEqual([
      { text: "abc ", match: false },
      { text: "needle", match: true },
      { text: " xyz", match: false },
    ]);
  });

  it("handles a match at either edge", () => {
    expect(sliceMatch("needle", 0, 6)).toEqual([{ text: "needle", match: true }]);
    expect(sliceMatch("a needle", 2, 6)).toEqual([
      { text: "a ", match: false },
      { text: "needle", match: true },
    ]);
  });

  it("clamps offsets it cannot trust and never loses text", () => {
    const join = (s: { text: string }[]) => s.map((x) => x.text).join("");
    for (const [start, len] of [[-5, 3], [10, 50], [99, 2], [2, -1], [Number.NaN, 2]]) {
      expect(join(sliceMatch("abcdef", start, len))).toBe("abcdef");
    }
    expect(sliceMatch("abcdef", 4, 50)).toEqual([
      { text: "abcd", match: false },
      { text: "ef", match: true },
    ]);
    expect(sliceMatch("abcdef", 2, 0).some((s) => s.match)).toBe(false);
  });
});

describe("highlightSegments", () => {
  it("marks every case-insensitive occurrence, keeping the original case", () => {
    expect(highlightSegments("Foo foo FOO", "foo")).toEqual([
      { text: "Foo", match: true },
      { text: " ", match: false },
      { text: "foo", match: true },
      { text: " ", match: false },
      { text: "FOO", match: true },
    ]);
  });

  it("returns the text whole for a blank query or no match", () => {
    expect(highlightSegments("abc", "  ")).toEqual([{ text: "abc", match: false }]);
    expect(highlightSegments("abc", "zz")).toEqual([{ text: "abc", match: false }]);
    expect(highlightSegments("", "a")).toEqual([]);
  });

  it("does not overlap matches", () => {
    expect(highlightSegments("aaaa", "aa").filter((s) => s.match)).toHaveLength(2);
  });

  it("treats the query as text, not a pattern", () => {
    expect(highlightSegments("a.b axb", ".").filter((s) => s.match).map((s) => s.text)).toEqual(["."]);
  });
});

describe("labels and links", () => {
  it("names a hit by kind and tool", () => {
    expect(hitLabel({ kind: "tool_use", tool: "Bash" })).toBe("Bash call");
    expect(hitLabel({ kind: "tool_result", tool: "Read" })).toBe("Read result");
    expect(hitLabel({ kind: "assistant", tool: null })).toBe("reply");
  });

  it("links to the entry with the query, encoded", () => {
    const href = hitHref({ sessionId: "abc", idx: 1234 }, "a b&c");
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/sessions/abc");
    expect(url.searchParams.get("entry")).toBe("1234");
    expect(url.searchParams.get("q")).toBe("a b&c");
  });

  it("labels a project by its cwd's last segment", () => {
    expect(projectLabel("/home/u/proj/", "-home-u-proj")).toBe("proj");
    expect(projectLabel(null, "-home-u-proj")).toBe("-home-u-proj");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs only the last call after a quiet period", () => {
    const fn = vi.fn();
    const d = debounce(fn, 250);
    d("a");
    vi.advanceTimersByTime(200);
    d("ab");
    vi.advanceTimersByTime(200);
    d("abc");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("abc");
  });

  it("cancel drops a pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 250);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
