/**
 * The assistant-text tokenizer (docs/plans/remote-claude.md §4.7). It only ever
 * produces data; whether a link target may become an `href` is decided at
 * render time by `safeExternalHref`, which `TranscriptEntry.test.tsx` pins in
 * the DOM.
 */
import { tokenizeInline, tokenizeMarkdown } from "../markdown";

describe("tokenizeInline", () => {
  it("splits code, bold, italic and links in order", () => {
    expect(tokenizeInline("a `b` **c** *d* [e](https://f)")).toEqual([
      { t: "text", v: "a " },
      { t: "code", v: "b" },
      { t: "text", v: " " },
      { t: "bold", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "italic", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " },
      { t: "link", text: "e", target: "https://f" },
    ]);
  });

  it("keeps any link target raw — the renderer decides", () => {
    expect(tokenizeInline("[x](javascript:alert(1))")[0]).toMatchObject({
      t: "link",
      text: "x",
      target: "javascript:alert(1",
    });
  });

  it("does not read markup in code spans or anywhere else as anything but text", () => {
    const toks = tokenizeInline("<img src=x onerror=alert(1)> and `<script>`");
    expect(toks).toEqual([
      { t: "text", v: "<img src=x onerror=alert(1)> and " },
      { t: "code", v: "<script>" },
    ]);
  });

  it("leaves snake_case identifiers alone", () => {
    expect(tokenizeInline("call some_fn_name now")).toEqual([
      { t: "text", v: "call some_fn_name now" },
    ]);
  });
});

describe("tokenizeMarkdown", () => {
  it("reads the block subset", () => {
    const blocks = tokenizeMarkdown(
      ["# Title", "", "para one", "para two", "", "- a", "- b", "", "1. x", "", "> quoted", "", "```ts", "const a = 1;", "```"]
        .join("\n"),
    );
    expect(blocks.map((b) => b.t)).toEqual(["heading", "paragraph", "list", "list", "quote", "code"]);
    expect(blocks[1]).toMatchObject({ t: "paragraph", lines: [[{ v: "para one" }], [{ v: "para two" }]] });
    expect(blocks[2]).toMatchObject({ t: "list", ordered: false });
    expect(blocks[3]).toMatchObject({ t: "list", ordered: true });
    expect(blocks[5]).toEqual({ t: "code", lang: "ts", text: "const a = 1;" });
  });

  it("closes an unterminated fence at the end", () => {
    expect(tokenizeMarkdown("```\n<script>x</script>")).toEqual([
      { t: "code", lang: "", text: "<script>x</script>" },
    ]);
  });
});
