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
import { MathNode } from "@/editor/nodes/MathNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { runAgentDocTool } from "../agentDocTools";
import { type AgentImageDeps, executeAgentDocTool } from "../agentImage";

/**
 * `insert_math` and `insert_image` (docs/plans/archive/agent-block.md phase 3) on a
 * real headless editor with the real `MathNode` and `ImageNode` registered:
 * that each is sugar over the same batch `apply_ops` runs (same default
 * placement, same codecs), that an inline equation lands in its paragraph's
 * text, and that a picture main read is uploaded through the injected store —
 * the blob path — before the node is written with whatever `src` it returned.
 */

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "agent-media-tools-test",
    nodes: [HeadingNode, QuoteNode, AgentBlockNode, MathNode, ImageNode],
    onError: (error) => {
      throw error;
    },
  });

function seed(texts: string[]): { editor: LexicalEditor; target: AgentToolTarget } {
  const editor = makeEditor();
  let blockKey = "";
  editor.update(
    () => {
      const root = $getRoot();
      const agent = $createAgentBlockNode({ sessionId: "s-1", prompts: ["go"] });
      $setState(agent, blockIdState, "blk_agent");
      root.append(agent);
      blockKey = agent.getKey();
      texts.forEach((text, i) => {
        const p = $createParagraphNode().append($createTextNode(text));
        $setState(p, blockIdState, `blk_p${i + 1}`);
        root.append(p);
      });
    },
    { discrete: true, tag: HISTORY_MERGE_TAG },
  );
  return { editor, target: { editor, blockKey, documentId: "doc-1" } };
}

type Json = SerializedLexicalNode & Record<string, unknown>;
const rootChildren = (editor: LexicalEditor): Json[] =>
  (editor.getEditorState().toJSON().root.children as Json[]);

describe("insert_math", () => {
  it("writes a displayed equation after the agent block — a paragraph holding one math node", () => {
    const { editor, target } = seed(["one"]);
    const result = runAgentDocTool(target, "insert_math", { latex: "\\int_0^1 x\\,dx" });
    expect(result).toMatchObject({ ok: true });
    const [, inserted, after] = rootChildren(editor);
    expect(inserted.type).toBe("paragraph");
    const kids = inserted.children as Json[];
    expect(kids).toHaveLength(1);
    expect(kids[0]).toMatchObject({ type: "math", value: "\\int_0^1 x\\,dx" });
    expect(after).toMatchObject({ type: "paragraph" });
    // The outline reads it back as the math block apply_ops also takes.
    if (result.ok) expect(result.text).toMatch(/math\s+\\int_0\^1/);
  });

  it("chains with the session's other default inserts", () => {
    const { editor, target } = seed(["one"]);
    runAgentDocTool(target, "insert_math", { latex: "a" });
    runAgentDocTool(target, "insert_math", { latex: "b" });
    const values = rootChildren(editor)
      .filter((n) => n.type === "paragraph" && (n.children as Json[])[0]?.type === "math")
      .map((n) => (n.children as Json[])[0].value);
    expect(values).toEqual(["a", "b"]);
  });

  it("honours a placement by block id", () => {
    const { editor, target } = seed(["one", "two"]);
    expect(runAgentDocTool(target, "insert_math", { latex: "z", after: "blk_p2" }).ok).toBe(true);
    const last = rootChildren(editor).at(-1)!;
    expect((last.children as Json[])[0]).toMatchObject({ type: "math", value: "z" });
  });

  it("appends an inline equation to the end of a paragraph, escaping $", () => {
    const { editor, target } = seed(["the area is"]);
    const result = runAgentDocTool(target, "insert_math", {
      latex: "\\pi r^2 \\text{ in }$",
      inline: true,
      id: "blk_p1",
    });
    expect(result.ok).toBe(true);
    const para = rootChildren(editor)[1];
    const kids = para.children as Json[];
    expect(kids.map((k) => k.type)).toEqual(["text", "math"]);
    expect(kids[0].text).toBe("the area is ");
    expect(kids[1].value).toBe("\\pi r^2 \\text{ in }$");
  });

  it("refuses inline LaTeX the $…$ spelling cannot carry, leaving the paragraph alone", () => {
    // A LaTeX `\$` renders as `\\$` inside $…$, which parses back as `\\`
    // followed by the closing `$` — a different equation.
    const { editor, target } = seed(["costs"]);
    const result = runAgentDocTool(target, "insert_math", { latex: "5\\$", inline: true, id: "blk_p1" });
    expect(result).toMatchObject({ ok: false });
    expect((rootChildren(editor)[1].children as Json[]).map((k) => k.type)).toEqual(["text"]);
    // Displayed, the same LaTeX is stored verbatim.
    expect(runAgentDocTool(target, "insert_math", { latex: "5\\$" }).ok).toBe(true);
  });

  it("refuses inline without a text block to put it in", () => {
    const { target } = seed(["one"]);
    expect(runAgentDocTool(target, "insert_math", { latex: "x", inline: true }).ok).toBe(false);
    expect(
      runAgentDocTool(target, "insert_math", { latex: "x", inline: true, id: "blk_agent" }).ok,
    ).toBe(false);
    expect(runAgentDocTool(target, "insert_math", { latex: "" }).ok).toBe(false);
  });

  it("refuses a stale hash rather than guessing", () => {
    const { target } = seed(["one"]);
    const result = runAgentDocTool(target, "insert_math", { latex: "x", stateHash: "h_0" });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/^stale/);
  });
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeDeps(answer: (dataUri: string) => string = () => "/api/blob/" + "c".repeat(64)) {
  const calls: { type: string; size: number; dataUri: string; documentId: string | null }[] = [];
  const deps: AgentImageDeps = {
    store: async (file, dataUri, documentId) => {
      calls.push({ type: file.type, size: file.size, dataUri, documentId });
      return answer(dataUri);
    },
    sanitizeSvg: (markup) => markup.replace(/<script[\s\S]*?<\/script>/g, ""),
  };
  return { deps, calls };
}

const imageOf = (editor: LexicalEditor): Json | undefined =>
  rootChildren(editor).find((n) => n.type === "image");

describe("insert_image", () => {
  it("uploads the bytes main read against this editor's document and stores the blob URL", async () => {
    const { editor, target } = seed(["one"]);
    const { deps, calls } = fakeDeps();
    const result = await executeAgentDocTool(target, "insert_image", {
      file: { bytes: PNG, mime: "image/png", name: "plot.png" },
      alt: "a plot",
      caption: "Figure 1 — **growth**",
    }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{
      type: "image/png",
      size: PNG.length,
      dataUri: `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`,
      documentId: "doc-1",
    }]);
    const image = imageOf(editor)!;
    expect(image).toMatchObject({
      src: "/api/blob/" + "c".repeat(64),
      altText: "a plot",
      showCaption: true,
    });
    // The caption survived the live node's own parse (its nested editor).
    expect(JSON.stringify(image.caption)).toContain("growth");
    // Directly after the agent block, as a block of its own.
    expect(rootChildren(editor)[1].type).toBe("image");
  });

  it("keeps the data URI where the store falls back to it — a local post", async () => {
    const { editor, target } = seed([]);
    target.documentId = null;
    const { deps, calls } = fakeDeps((dataUri) => dataUri);
    await executeAgentDocTool(target, "insert_image", {
      file: { bytes: PNG, mime: "image/png", name: "plot.png" },
    }, deps);
    expect(calls[0].documentId).toBeNull();
    expect(imageOf(editor)).toMatchObject({
      src: expect.stringMatching(/^data:image\/png;base64,/),
      // No alt given: the file's name, without its extension.
      altText: "plot",
    });
  });

  it("sanitizes an SVG before it is stored, and gives it back its namespace", async () => {
    const { target } = seed([]);
    const { deps, calls } = fakeDeps();
    const svg = '<svg width="4"><script>alert(1)</script><rect width="4"/></svg>';
    await executeAgentDocTool(target, "insert_image", {
      file: { bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", name: "a.svg" },
      alt: "",
    }, deps);
    const stored = atob(calls[0].dataUri.split(",")[1]);
    expect(stored).not.toContain("script");
    expect(stored).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="4">/);
  });

  it("refuses an SVG the sanitizer empties, and stores nothing", async () => {
    const { editor, target } = seed([]);
    const { calls } = fakeDeps();
    const result = await executeAgentDocTool(target, "insert_image", {
      file: { bytes: new TextEncoder().encode("<svg/>"), mime: "image/svg+xml", name: "a.svg" },
    }, { store: async () => "x", sanitizeSvg: () => "" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(imageOf(editor)).toBeUndefined();
  });

  it("refuses bytes of a type main would never have sniffed", async () => {
    const { target } = seed([]);
    const { deps, calls } = fakeDeps();
    const result = await executeAgentDocTool(target, "insert_image", {
      file: { bytes: PNG, mime: "text/html", name: "x.html" },
    }, deps);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("stores an http(s) URL as given and uploads nothing", async () => {
    const { editor, target } = seed([]);
    const { deps, calls } = fakeDeps();
    const result = await executeAgentDocTool(target, "insert_image", {
      url: "https://example.com/chart.png",
      alt: "chart",
      after: "blk_agent",
    }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(imageOf(editor)).toMatchObject({ src: "https://example.com/chart.png" });
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AAAA", "plot.png"])(
    "refuses the url %s",
    async (url) => {
      const { editor, target } = seed([]);
      const result = await executeAgentDocTool(target, "insert_image", { url, alt: "" }, fakeDeps().deps);
      expect(result.ok).toBe(false);
      expect(imageOf(editor)).toBeUndefined();
    },
  );

  it("never runs through the synchronous executor, which cannot upload", () => {
    const { target } = seed([]);
    expect(runAgentDocTool(target, "insert_image", { url: "https://x/y.png" }).ok).toBe(false);
  });

  it("refuses on a read-only editor before uploading anything", async () => {
    const { editor, target } = seed([]);
    editor.setEditable(false);
    const { deps, calls } = fakeDeps();
    const result = await executeAgentDocTool(target, "insert_image", {
      file: { bytes: PNG, mime: "image/png", name: "p.png" },
    }, deps);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
