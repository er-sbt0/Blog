import { ENTRY_KINDS, escapeLike, parseSearchParams, snippetAround } from "../search";
import { SEARCH_MIN_LENGTH } from "../types";

/** docs/plans/remote-claude.md §4.9. */

const params = (q: string) => parseSearchParams(new URLSearchParams(q));

describe("escapeLike", () => {
  it("escapes the three LIKE metacharacters so a query matches literally", () => {
    expect(escapeLike("foo_bar")).toBe("foo\\_bar");
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });

  it("leaves everything else alone", () => {
    expect(escapeLike("src/lib/x.ts [a]*?'")).toBe("src/lib/x.ts [a]*?'");
  });
});

describe("parseSearchParams", () => {
  it("trims and lower-cases the query, as the index text is", () => {
    const p = params("q=%20RemoteSessions%20");
    expect(p).toEqual({
      ok: true,
      value: { q: "remotesessions", hostId: null, project: null, kinds: [], thinking: false },
    });
  });

  it("refuses a query too short for the trigram index, after trimming", () => {
    expect(params("q=ab").ok).toBe(false);
    expect(params("q=%20ab%20").ok).toBe(false);
    expect(params("").ok).toBe(false);
    expect(params(`q=${"a".repeat(SEARCH_MIN_LENGTH)}`).ok).toBe(true);
  });

  it("refuses an overlong query", () => {
    expect(params(`q=${"a".repeat(501)}`).ok).toBe(false);
    expect(params(`q=${"a".repeat(500)}`).ok).toBe(true);
  });

  it("accepts a project directory and refuses anything path-shaped", () => {
    const ok = params("q=abc&project=-home-dev-llvm");
    expect(ok.ok && ok.value.project).toBe("-home-dev-llvm");
    for (const bad of ["a/b", "..", "a b", "%25", "a'b", "x".repeat(256)]) {
      expect(params(`q=abc&project=${encodeURIComponent(bad)}`).ok).toBe(false);
    }
  });

  it("collects repeated kinds and refuses unknown ones", () => {
    const p = params("q=abc&kind=prompt&kind=tool_use&kind=prompt");
    expect(p.ok && p.value.kinds).toEqual(["prompt", "tool_use"]);
    expect(params("q=abc&kind=html").ok).toBe(false);
  });

  it("excludes thinking unless asked, by flag or by kind", () => {
    const off = params("q=abc");
    expect(off.ok && off.value.thinking).toBe(false);
    const flag = params("q=abc&thinking=1");
    expect(flag.ok && flag.value.thinking).toBe(true);
    const kind = params("q=abc&kind=thinking");
    expect(kind.ok && kind.value.thinking).toBe(true);
    const zero = params("q=abc&thinking=0");
    expect(zero.ok && zero.value.thinking).toBe(false);
  });

  it("lists every entry kind", () => {
    expect([...ENTRY_KINDS].sort()).toEqual(
      ["assistant", "command", "meta", "prompt", "thinking", "tool_result", "tool_use"],
    );
  });
});

describe("snippetAround", () => {
  const hit = (text: string, q: string, radius = 40) => {
    const s = snippetAround(text, q, radius);
    expect(s.snippet.slice(s.matchStart, s.matchStart + s.matchLength)).toBe(q);
    return s;
  };

  it("keeps radius characters either side of a match in the middle", () => {
    const text = `${"a".repeat(100)}needle${"b".repeat(100)}`;
    const s = hit(text, "needle");
    expect(s).toEqual({ snippet: `${"a".repeat(40)}needle${"b".repeat(40)}`, matchStart: 40, matchLength: 6 });
  });

  it("handles a match at the start", () => {
    const s = hit(`needle${"b".repeat(100)}`, "needle");
    expect(s.matchStart).toBe(0);
    expect(s.snippet).toBe(`needle${"b".repeat(40)}`);
  });

  it("handles a match at the end", () => {
    const s = hit(`${"a".repeat(100)}needle`, "needle");
    expect(s.matchStart).toBe(40);
    expect(s.snippet).toBe(`${"a".repeat(40)}needle`);
  });

  it("handles text shorter than the radius", () => {
    expect(hit("a needle b", "needle")).toEqual({ snippet: "a needle b", matchStart: 2, matchLength: 6 });
  });

  it("uses the first occurrence", () => {
    expect(hit("x needle y needle", "needle").matchStart).toBe(2);
  });

  it("is literal about LIKE metacharacters", () => {
    expect(hit("rate is 100% done", "100%").matchStart).toBe(8);
    expect(hit("call foo_bar()", "foo_bar").matchStart).toBe(5);
  });

  it("never splits a surrogate pair at either edge", () => {
    const emoji = "😀"; // two UTF-16 units
    const text = `${emoji.repeat(30)}needle${emoji.repeat(30)}`;
    for (const radius of [39, 40, 41]) {
      const s = hit(text, "needle", radius);
      expect(s.snippet).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      expect(s.snippet.isWellFormed()).toBe(true);
    }
  });

  it("counts offsets in UTF-16 units across multibyte text", () => {
    const s = hit("שלום 😀 עולם needle ü", "needle");
    expect(s.matchStart).toBe("שלום 😀 עולם ".length);
    expect(hit("ü needle", "needle").matchStart).toBe(2);
  });

  it("puts a snippet on one line without moving the match", () => {
    const s = hit("line one\nline\ttwo needle\r\nthree", "needle");
    expect(s.snippet).toBe("line one line two needle  three");
    expect(s.matchStart).toBe(18);
  });

  it("falls back to the start, with an empty match, when q is absent", () => {
    expect(snippetAround("abc", "zzz")).toEqual({ snippet: "abc", matchStart: 0, matchLength: 0 });
  });
});
