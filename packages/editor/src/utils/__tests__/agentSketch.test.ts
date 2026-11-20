/**
 * `draw_sketch` (docs/plans/agent-block.md phase 4) on a real headless editor
 * with the real `SketchNode`, and with Excalidraw stubbed — it needs a canvas
 * to measure text, which jsdom does not have. The real conversion and export
 * were verified in a browser (the plan's phase-4 log); what is pinned here is
 * everything around them:
 *
 * - the shape list is validated strictly, with refusals that name the shape;
 * - arrows given `from`/`to` are bound and run edge to edge;
 * - the exported SVG goes through the sanitizer and keeps its scene, which the
 *   pass would otherwise drop with the comments it lives in (the real
 *   DOMPurify pass over it is in `sanitizeSvg.test.ts`, which has a DOM);
 * - the result is stored through the injected blob store and inserted as a
 *   `sketch` block by the same batch `apply_ops` runs — or redraws one in
 *   place, keeping its address and caption.
 */
import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type SerializedLexicalNode,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { blockIdState } from "@/lib/content-bridge";
import { $createAgentBlockNode, AgentBlockNode } from "@/editor/nodes/AgentBlockNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { executeAgentDocTool } from "../agentImage";
import { runAgentDocTool } from "../agentDocTools";
import {
  connect,
  MAX_SHAPES,
  type SketchRenderer,
  shapesToSkeleton,
} from "../agentSketch";

/** What a sanitizer does to comments, which is the part that matters here. */
const dropComments = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");

type Json = SerializedLexicalNode & Record<string, unknown>;

const PAYLOAD = "eyJ0eXBlIjoiZXhjYWxpZHJhdyJ9";
const sceneComments = (body = PAYLOAD) =>
  "<!-- svg-source:excalidraw --><metadata>" +
  "<!-- payload-type:application/vnd.excalidraw+json -->" +
  "<!-- payload-version:2 --><!-- payload-start -->" +
  `${body}<!-- payload-end --></metadata>`;
const exported = (inner = '<rect x="1" y="1" width="10" height="10"/>') =>
  `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" ` +
  `width="200" height="100">${sceneComments()}<defs/>${inner}</svg>`;

// ---------------------------------------------------------------------------
// The shape list
// ---------------------------------------------------------------------------

describe("shapesToSkeleton", () => {
  const ok = (shapes: unknown) => {
    const result = shapesToSkeleton(shapes);
    if (!result.ok) throw new Error(result.error);
    return result.skeleton;
  };
  const refused = (shapes: unknown): string => {
    const result = shapesToSkeleton(shapes);
    if (result.ok) throw new Error("expected a refusal");
    return result.error;
  };

  it("spells boxes, text and a bound arrow as Excalidraw skeleton elements", () => {
    const skeleton = ok([
      { id: "a", kind: "rect", x: 0, y: 0, w: 100, h: 50, label: "Client" },
      { id: "b", kind: "ellipse", x: 300, y: 0, w: 100, h: 50, label: "Server" },
      { kind: "arrow", from: "a", to: "b", label: "HTTP" },
      { kind: "text", x: 0, y: 200, label: "note" },
    ]);
    expect(skeleton[0]).toEqual({
      type: "rectangle",
      id: "a",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      label: { text: "Client" },
    });
    expect(skeleton[1]).toMatchObject({ type: "ellipse", label: { text: "Server" } });
    // Edge to edge, 8px clear: the rect's right side is x=100, the ellipse's
    // left x=300, both at the shared centre line y=25.
    expect(skeleton[2]).toEqual({
      type: "arrow",
      x: 108,
      y: 25,
      points: [[0, 0], [184, 0]],
      label: { text: "HTTP" },
      start: { id: "a" },
      end: { id: "b" },
    });
    expect(skeleton[3]).toEqual({ type: "text", x: 0, y: 200, text: "note" });
  });

  it("lets an arrow name a shape listed after it", () => {
    const skeleton = ok([
      { kind: "arrow", from: "a", to: "b" },
      { id: "a", kind: "rect", x: 0, y: 0 },
      { id: "b", kind: "diamond", x: 0, y: 300 },
    ]);
    // Straight down, so the points carry the vertical — `width || 100` in
    // the converter would otherwise make it diagonal.
    expect(skeleton[0]).toMatchObject({ points: [[0, 0], [0, expect.any(Number)]] });
  });

  it("runs a free arrow and a line from x, y by w, h, unbound", () => {
    const [arrow, line] = ok([
      { kind: "arrow", x: 10, y: 20, w: 0, h: 90 },
      { kind: "line", x: 0, y: 0, w: 50, h: -5 },
    ]);
    expect(arrow).toEqual({ type: "arrow", x: 10, y: 20, points: [[0, 0], [0, 90]] });
    expect(line).toEqual({ type: "line", x: 0, y: 0, points: [[0, 0], [50, -5]] });
  });

  it("names an unknown from id, and lists the ids there are", () => {
    expect(
      refused([
        { id: "api", kind: "rect", x: 0, y: 0 },
        { id: "db", kind: "rect", x: 300, y: 0 },
        { kind: "arrow", from: "api", to: "cache" },
      ]),
    ).toBe(
      'shapes[2] (arrow): "cache" is not the id of any shape in this sketch (ids: "api", "db").',
    );
  });

  it("refuses an arrow attached to another connector", () => {
    expect(
      refused([
        { id: "a", kind: "rect", x: 0, y: 0 },
        { id: "e", kind: "arrow", x: 0, y: 0, w: 5, h: 5 },
        { kind: "arrow", from: "a", to: "e" },
      ]),
    ).toMatch(/shapes\[2\] \(arrow\): "e" is not a shape an arrow can attach to/);
  });

  it.each([
    [[], /non-empty/],
    [[{ kind: "hexagon", x: 0, y: 0 }], /shapes\[0\] \(hexagon\): kind: /],
    [[{ kind: "rect", x: 0, y: 0, width: 5 }], /shapes\[0\] \(rect\): unknown field width/],
    [[{ kind: "rect", x: "0", y: 0 }], /shapes\[0\] \(rect\): x: /],
    [[{ kind: "rect", y: 0 }], /needs x and y/],
    [[{ kind: "rect", x: 0, y: 0, w: -4 }], /w and h must be/],
    [[{ kind: "text", x: 0, y: 0 }], /a text needs a label/],
    [[{ kind: "rect", x: 0, y: 0, from: "x" }], /from and to are for arrows/],
    [
      [{ id: "a", kind: "rect", x: 0, y: 0 }, { id: "a", kind: "ellipse", x: 9, y: 9 }],
      /shapes\[1\] \(ellipse\): id "a" is used twice/,
    ],
    [
      [{ id: "a", kind: "rect", x: 0, y: 0 }, { kind: "arrow", from: "a" }],
      /give both from and to/,
    ],
    [
      [{ id: "a", kind: "rect", x: 0, y: 0 }, { kind: "arrow", from: "a", to: "a" }],
      /the same shape/,
    ],
    [[{ kind: "arrow", x: 0, y: 0 }], /needs from and to .* or x, y/],
    [
      [
        { id: "a", kind: "rect", x: 0, y: 0 },
        { id: "b", kind: "ellipse", x: 0, y: 0 },
        { kind: "arrow", from: "a", to: "b" },
      ],
      /the same centre/,
    ],
    [[{ kind: "arrow", x: 0, y: 0, w: 0, h: 0 }], /no length/],
    [[{ kind: "line", x: 0, y: 0, w: 4, h: 4, label: "x" }], /a line has no label/],
  ])("refuses %j", (shapes, message) => {
    expect(refused(shapes)).toMatch(message);
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_SHAPES + 1 }, (_, i) => ({
      kind: "rect",
      x: i,
      y: 0,
    }));
    expect(refused(many)).toMatch(/at most 200/);
  });
});

describe("connect", () => {
  it("leaves an ellipse and a diamond at their own edges, not their boxes'", () => {
    // Diagonal from an ellipse to a diamond: the ellipse's edge is inside its
    // bounding box's corner, and so is the diamond's.
    const { x, y, dx, dy } = connect(
      { kind: "ellipse", x: 0, y: 0, w: 100, h: 100 },
      { kind: "diamond", x: 300, y: 300, w: 100, h: 100 },
    );
    const r = Math.SQRT1_2;
    expect(x).toBeCloseTo(50 + 50 * r + 8 * r, 1);
    expect(y).toBeCloseTo(x, 5);
    // The diamond's edge on the diagonal is at |dx|+|dy| = 50 from its centre.
    expect(x + dx).toBeCloseTo(350 - 25 - 8 * r, 1);
    expect(dy).toBeCloseTo(dx, 5);
  });
});

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "agent-sketch-test",
    nodes: [HeadingNode, QuoteNode, AgentBlockNode, ImageNode, SketchNode],
    onError: (error) => {
      throw error;
    },
  });

function seed(): { editor: LexicalEditor; target: AgentToolTarget } {
  const editor = makeEditor();
  let blockKey = "";
  editor.update(
    () => {
      const root = $getRoot();
      const agent = $createAgentBlockNode({ sessionId: "s-1", prompts: ["go"] });
      $setState(agent, blockIdState, "blk_agent");
      root.append(agent);
      blockKey = agent.getKey();
      const p = $createParagraphNode().append($createTextNode("after"));
      $setState(p, blockIdState, "blk_p1");
      root.append(p);
    },
    { discrete: true, tag: HISTORY_MERGE_TAG },
  );
  return { editor, target: { editor, blockKey, documentId: "doc-1" } };
}

const rootChildren = (editor: LexicalEditor): Json[] =>
  editor.getEditorState().toJSON().root.children as Json[];

/** Converted elements, as Excalidraw would return them for the stub's input. */
const CONVERTED = [
  { id: "x1", type: "rectangle", isDeleted: false },
  { id: "x1-t", type: "text", text: "Client", containerId: "x1" },
  { id: "x2", type: "rectangle" },
  { id: "x2-t", type: "text", text: "Server", containerId: "x2" },
  { id: "x3", type: "arrow", startBinding: { elementId: "x1" }, endBinding: { elementId: "x2" } },
];

function deps(overrides: Partial<SketchRenderer> = {}) {
  const calls = {
    convert: [] as unknown[],
    mermaid: [] as string[],
    exported: [] as unknown[],
    stored: [] as { file: Blob; dataUri: string; documentId: string | null }[],
  };
  const renderer: SketchRenderer = {
    convert: async (skeleton) => {
      calls.convert.push(skeleton);
      return CONVERTED;
    },
    mermaid: async (definition) => {
      calls.mermaid.push(definition);
      return { elements: CONVERTED, files: {} };
    },
    exportSvg: async (scene) => {
      calls.exported.push(scene);
      return { markup: exported(), width: 200.4, height: 100 };
    },
    ...overrides,
  };
  return {
    calls,
    deps: {
      store: async (file: Blob, dataUri: string, documentId: string | null) => {
        calls.stored.push({ file, dataUri, documentId });
        return "/api/blob/" + "e".repeat(64);
      },
      sanitizeSvg: dropComments,
      sketchRenderer: async () => renderer,
    },
  };
}

const SHAPES = [
  { id: "a", kind: "rect", x: 0, y: 0, label: "Client" },
  { id: "b", kind: "rect", x: 300, y: 0, label: "Server" },
  { kind: "arrow", from: "a", to: "b" },
];

describe("draw_sketch", () => {
  it("converts, exports, stores, then inserts a sketch after the agent block", async () => {
    const { editor, target } = seed();
    const { calls, deps: d } = deps();
    const result = await executeAgentDocTool(target, "draw_sketch", { shapes: SHAPES }, d);
    expect(result).toMatchObject({ ok: true });

    expect(calls.convert).toHaveLength(1);
    expect((calls.convert[0] as unknown[])[2]).toMatchObject({ start: { id: "a" }, end: { id: "b" } });
    expect(calls.stored).toHaveLength(1);
    const [{ file, dataUri, documentId }] = calls.stored;
    expect(documentId).toBe("doc-1");
    expect(file.type).toBe("image/svg+xml");
    expect(dataUri.startsWith("data:image/svg+xml,%3Csvg")).toBe(true);
    expect(decodeURIComponent(dataUri.split(",")[1])).toContain(sceneComments());
    expect(await file.text()).toBe(decodeURIComponent(dataUri.split(",")[1]));

    const [, sketch, after] = rootChildren(editor);
    expect(sketch).toMatchObject({
      type: "sketch",
      src: "/api/blob/" + "e".repeat(64),
      width: 200,
      height: 100,
      altText: "Diagram: 2 boxes, 1 arrow · Client, Server · Client → Server",
      showCaption: false,
    });
    expect(sketch.value).toBeUndefined();
    expect(after).toMatchObject({ type: "paragraph" });
    if (result.ok) {
      expect(result.text).toMatch(/^Drew 2 boxes, 1 arrow/);
      // The outline that follows reads it back by its alt.
      expect(result.text).toMatch(/sketch\s+Diagram: 2 boxes/);
    }
  });

  it("takes mermaid, and hands a parse error back as the tool's answer", async () => {
    const { target } = seed();
    const { calls, deps: d } = deps();
    await executeAgentDocTool(target, "draw_sketch", { mermaid: "  flowchart LR\n A-->B " }, d);
    expect(calls.mermaid).toEqual(["flowchart LR\n A-->B"]);
    // A `click` line is dropped before mermaid sees it: it is a link, and it
    // knocks its node out of the converter's layout (verified in a browser).
    await executeAgentDocTool(
      target,
      "draw_sketch",
      { mermaid: 'flowchart LR\n A-->B\n  click A "javascript:alert(1)"\n B-->C' },
      d,
    );
    expect(calls.mermaid[1]).toBe("flowchart LR\n A-->B\n B-->C");

    const failing = deps({
      mermaid: async () => {
        throw new Error("Parse error on line 1:\nflowchart LR A-->\n----------------^");
      },
    });
    const result = await executeAgentDocTool(
      target,
      "draw_sketch",
      { mermaid: "flowchart LR A-->" },
      failing.deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^Mermaid could not read that definition: Parse error on line 1:/);
      expect(result.error).not.toContain("\n");
    }
    expect(failing.calls.stored).toHaveLength(0);
  });

  it("returns a shape error before loading Excalidraw or storing anything", async () => {
    const { target } = seed();
    const { calls, deps: d } = deps();
    const result = await executeAgentDocTool(
      target,
      "draw_sketch",
      { shapes: [{ kind: "arrow", from: "nope", to: "also" }] },
      d,
    );
    expect(result).toMatchObject({ ok: false, error: /"nope" is not the id/ });
    expect(calls.convert).toHaveLength(0);
    expect(calls.stored).toHaveLength(0);
  });

  it.each([
    [{}, /exactly one of shapes/],
    [{ shapes: SHAPES, mermaid: "flowchart LR" }, /exactly one of shapes/],
    [{ mermaid: "   " }, /mermaid is empty/],
    [{ mermaid: "graph LR", id: "blk_x", after: "blk_p1" }, /takes no after/],
  ])("refuses %j", async (input, message) => {
    const { target } = seed();
    const result = await executeAgentDocTool(target, "draw_sketch", input, deps().deps);
    expect(result).toMatchObject({ ok: false, error: message });
  });

  it("drops element links, which a mermaid click directive would make", async () => {
    const { target } = seed();
    const { calls, deps: d } = deps({
      mermaid: async () => ({
        elements: [{ id: "n", type: "rectangle", link: "javascript:alert(1)" }],
        files: {},
      }),
    });
    await executeAgentDocTool(target, "draw_sketch", { mermaid: "flowchart LR\n A" }, d);
    const scene = calls.exported[0] as { elements: Record<string, unknown>[] };
    expect(scene.elements[0].link).toBeNull();
  });

  it("stores a local post's sketch as the data URI the dialog would", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    d.store = async (_file, dataUri) => dataUri;
    await executeAgentDocTool(target, "draw_sketch", { shapes: SHAPES }, d);
    const sketch = rootChildren(editor)[1];
    expect(String(sketch.src).startsWith("data:image/svg+xml,")).toBe(true);
  });

  it("redraws a sketch in place with id, keeping its address and caption", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    await executeAgentDocTool(
      target,
      "draw_sketch",
      { shapes: SHAPES, caption: "v1", alt: "first" },
      d,
    );
    const first = rootChildren(editor)[1];
    const id = (first.$ as Record<string, string>).blockId;
    expect(id).toMatch(/^blk_/);

    d.store = async () => "/api/blob/" + "f".repeat(64);
    const result = await executeAgentDocTool(target, "draw_sketch", { mermaid: "graph TD\n A-->B", id }, d);
    expect(result).toMatchObject({ ok: true });
    const children = rootChildren(editor);
    expect(children).toHaveLength(3);
    expect(children[1]).toMatchObject({
      type: "sketch",
      src: "/api/blob/" + "f".repeat(64),
      showCaption: true,
      $: { blockId: id },
    });
    // The caption, which this call did not mention, is still there.
    expect(JSON.stringify(children[1].caption)).toContain("v1");
  });

  it("will not redraw something that is not a sketch", async () => {
    const { editor, target } = seed();
    const before = JSON.stringify(rootChildren(editor));
    const result = await executeAgentDocTool(
      target,
      "draw_sketch",
      { shapes: SHAPES, id: "blk_p1" },
      deps().deps,
    );
    expect(result).toMatchObject({ ok: false, error: /blk_p1 is a paragraph, not a sketch/ });
    expect(JSON.stringify(rootChildren(editor))).toBe(before);
  });

  it("does not write into a post that went read-only while it rendered", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    d.store = async (_file, dataUri) => {
      editor.setEditable(false);
      return dataUri;
    };
    const result = await executeAgentDocTool(target, "draw_sketch", { shapes: SHAPES }, d);
    expect(result).toMatchObject({ ok: false, error: /read-only/ });
    expect(rootChildren(editor)).toHaveLength(2);
  });

  it("is refused by the synchronous executor, which cannot render", () => {
    const { target } = seed();
    expect(runAgentDocTool(target, "draw_sketch", { shapes: SHAPES })).toMatchObject({
      ok: false,
    });
  });
});

describe("apply_ops on the sketch draw_sketch made", () => {
  it("can re-caption it, and cannot swap its drawing", async () => {
    const { editor, target } = seed();
    await executeAgentDocTool(target, "draw_sketch", { shapes: SHAPES }, deps().deps);
    const sketch = rootChildren(editor)[1];
    const id = (sketch.$ as Record<string, string>).blockId;

    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: (/stateHash: (\S+)/.exec(
        (runAgentDocTool(target, "outline", {}) as { text: string }).text,
      ) ?? [])[1],
      ops: [{
        op: "replace_block",
        id,
        block: { type: "sketch", alt: "better", caption: "Fig. 1", src: "/api/blob/" + "0".repeat(64) },
      }],
    });
    expect(result).toMatchObject({ ok: true });
    const after = rootChildren(editor)[1];
    expect(after).toMatchObject({ type: "sketch", altText: "better", src: sketch.src });
    expect(JSON.stringify(after.caption)).toContain("Fig. 1");
  });

  it("refuses to insert a sketch, pointing at draw_sketch", () => {
    const { target } = seed();
    const outline = (runAgentDocTool(target, "outline", {}) as { text: string }).text;
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: (/stateHash: (\S+)/.exec(outline) ?? [])[1],
      ops: [{ op: "insert_blocks", blocks: [{ type: "sketch", alt: "x", src: "/api/blob/x" }] }],
    });
    expect(result).toMatchObject({ ok: false, error: /draw_sketch/ });
  });
});
