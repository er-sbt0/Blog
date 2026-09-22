/**
 * What an `<iframe>` embed is allowed to be by the time it reaches a page.
 *
 * `IFrameNode.exportDOM` used to write `this.__src` onto the element with no
 * scheme check at all — and `javascript:` in a same-document iframe `src` still
 * executes in Chrome and Firefox, so an embed was a second route to script on
 * this origin alongside the sketch/graph SVG one. The YouTube branch was
 * already normalized; the fallthrough was not.
 *
 * Two decisions are pinned here rather than left to the reader of the diff: a
 * non-conforming src renders **no iframe at all** (an iframe with a neutered
 * src is an invitation to start trusting the attribute again), and every embed
 * that does render carries a `sandbox`.
 */
import type { SerializedEditorState } from "lexical";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";
import { resolveEmbedSrc } from "@/editor/nodes/IFrameNode";

const EMPTY_CAPTION = {
  editorState: {
    root: {
      children: [
        {
          children: [],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  },
};

const documentWith = (src: string) =>
  ({
    root: {
      children: [
        {
          altText: "iframe",
          caption: EMPTY_CAPTION,
          height: 315,
          id: "",
          showCaption: false,
          src,
          style: "",
          type: "iframe",
          version: 1,
          width: 560,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  }) as unknown as SerializedEditorState;

describe("resolveEmbedSrc", () => {
  it("normalizes a YouTube URL to the nocookie embed", () => {
    expect(resolveEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(resolveEmbedSrc("https://youtu.be/dQw4w9WgXcQ"))
      .toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("passes ordinary http and https embeds through", () => {
    expect(resolveEmbedSrc("https://player.vimeo.com/video/12345"))
      .toBe("https://player.vimeo.com/video/12345");
    expect(resolveEmbedSrc("http://example.com/embed"))
      .toBe("http://example.com/embed");
  });

  it("refuses every other scheme, and anything unparseable", () => {
    for (
      const src of [
        "javascript:fetch('https://evil.example')",
        // Case and leading whitespace are both how the check gets dodged when
        // it is a string comparison rather than a parse.
        "JaVaScRiPt:alert(1)",
        "  javascript:alert(1)",
        "java\nscript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "blob:https://example.com/abcd",
        "file:///etc/passwd",
        "/relative/path",
        "",
      ]
    ) {
      expect(resolveEmbedSrc(src), src).toBeNull();
    }
  });
});

describe("iframe exportDOM", () => {
  it("renders no iframe at all for a refused src", async () => {
    const html = await generateServerHtml(
      documentWith("javascript:fetch('https://evil.example')"),
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
  });

  it("sandboxes the embeds it does render", async () => {
    const html = await generateServerHtml(
      documentWith("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    );

    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    );
    expect(html).toContain('sandbox="allow-scripts allow-same-origin');
    // Nothing here may navigate the top-level page, submit a form or download.
    expect(html).not.toContain("allow-top-navigation");
    expect(html).not.toContain("allow-forms");
    expect(html).not.toContain("allow-downloads");
  });
});
