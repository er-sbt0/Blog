/**
 * What a slow doc tool does when its block goes away while it works
 * (docs/plans/archive/agent-block.md §6 q3, phase 6).
 *
 * `draw_sketch`, `plot_graph` and `insert_image` resolve their target when the
 * call starts, then render and upload for anything up to a minute and a half.
 * Closing the pane or deleting the block interrupts the turn, but the call
 * that is already running comes back afterwards. It must then refuse — not
 * write into an editor whose block no longer holds the session, and not
 * upload a picture nobody will insert. Driven through the real router, with
 * the real nodes on a headless editor and the renderers held on a promise the
 * spec releases.
 */
import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $setState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { blockIdState } from "@/lib/content-bridge";
import { $createAgentBlockNode, AgentBlockNode } from "@/editor/nodes/AgentBlockNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { MathNode } from "@/editor/nodes/MathNode";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { executeAgentDocTool, type AgentImageDeps } from "../agentImage";
import { BLOCK_GONE, runAgentDocTool } from "../agentDocTools";
import { createAgentRouter } from "../agentRouter";
import type { SketchRenderer } from "../agentSketch";
import type { GraphRenderer } from "../agentGraph";

const SESSION = "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10";

const SKETCH_SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
  "<!-- svg-source:excalidraw --><metadata>" +
  "<!-- payload-type:application/vnd.excalidraw+json -->" +
  "<!-- payload-version:2 --><!-- payload-start -->" +
  "eyJ0eXBlIjoiZXhjYWxpZHJhdyJ9<!-- payload-end --></metadata><rect/></svg>";
const GRAPH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><path/></svg>';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function seed(): { editor: LexicalEditor; target: AgentToolTarget } {
  const editor = createHeadlessEditor({
    namespace: "agent-lifecycle-test",
    nodes: [HeadingNode, QuoteNode, AgentBlockNode, ImageNode, GraphNode, SketchNode, MathNode],
    onError: (error) => {
      throw error;
    },
  });
  let blockKey = "";
  editor.update(
    () => {
      const agent = $createAgentBlockNode({ sessionId: SESSION, prompts: ["go"] });
      $setState(agent, blockIdState, "blk_agent");
      blockKey = agent.getKey();
      $getRoot().append(
        agent,
        $createParagraphNode().append($createTextNode("after")),
      );
    },
    { discrete: true, tag: HISTORY_MERGE_TAG },
  );
  return { editor, target: { editor, blockKey, documentId: "doc-1" } };
}

const types = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $getRoot().getChildren().map((n) => n.getType()));

/** A promise the spec resolves, and a counter of what reached the store. */
function held() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stored: string[] = [];
  const sketch: SketchRenderer = {
    convert: async () => [{ id: "x1", type: "rectangle" }],
    mermaid: async () => ({ elements: [{ id: "x1", type: "rectangle" }], files: {} }),
    exportSvg: async () => {
      await gate;
      return { markup: SKETCH_SVG, width: 200, height: 100 };
    },
  };
  const graph: GraphRenderer = {
    plot: async () => {
      await gate;
      return { ok: true, plot: { svg: GRAPH_SVG, ggb: "UEsDBA", xml: "<geogebra/>", objects: ["f"] } };
    },
  };
  const deps: AgentImageDeps = {
    store: async (_file, dataUri) => {
      stored.push(dataUri.slice(0, 20));
      return "/api/blob/" + "e".repeat(64);
    },
    sanitizeSvg: (markup) => markup.replace(/<!--[\s\S]*?-->/g, ""),
    sketchRenderer: async () => sketch,
    graphRenderer: async () => graph,
  };
  return { release, stored, deps };
}

const CALLS = {
  draw_sketch: { mermaid: "flowchart LR\n  a --> b" },
  plot_graph: { commands: ["f(x)=sin(x)"] },
} as const;

describe.each(Object.keys(CALLS) as (keyof typeof CALLS)[])("%s when its block goes mid-call", (tool) => {
  it("refuses after the pane closed (the block detached), and uploads nothing", async () => {
    const { editor, target } = seed();
    const { release, stored, deps } = held();
    const router = createAgentRouter((t, name, input) => executeAgentDocTool(t, name, input, deps));
    const detach = router.attach(SESSION, target);

    const call = router.handle({ sessionId: SESSION, name: tool, input: CALLS[tool] });
    await Promise.resolve();
    detach(); // The block unmounted: its pane closed.
    release();

    expect(await call).toEqual(BLOCK_GONE);
    expect(stored).toEqual([]);
    expect(types(editor)).toEqual(["agent", "paragraph"]);
    // And a call that arrives after is not run at all.
    expect(await router.handle({ sessionId: SESSION, name: tool, input: CALLS[tool] }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not open/) });
  });

  it("refuses after the block was deleted, even while its target is attached", async () => {
    const { editor, target } = seed();
    const { release, stored, deps } = held();
    const call = executeAgentDocTool(target, tool, CALLS[tool], deps);
    await Promise.resolve();
    editor.update(() => $getNodeByKey(target.blockKey)?.remove(), { discrete: true });
    release();

    expect(await call).toEqual(BLOCK_GONE);
    expect(stored).toEqual([]);
    expect(types(editor)).toEqual(["paragraph"]);
  });

  it("still writes when nothing went", async () => {
    const { editor, target } = seed();
    const { release, deps } = held();
    const call = executeAgentDocTool(target, tool, CALLS[tool], deps);
    release();
    expect(await call).toMatchObject({ ok: true });
    expect(types(editor)).toEqual(["agent", tool === "draw_sketch" ? "sketch" : "graph", "paragraph"]);
  });
});

describe("insert_image when its block goes during the upload", () => {
  it("refuses once the upload comes back", async () => {
    const { editor, target } = seed();
    let finish = () => {};
    const uploading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const deps: AgentImageDeps = {
      store: async () => {
        await uploading;
        return "/api/blob/" + "c".repeat(64);
      },
      sanitizeSvg: (markup) => markup,
    };
    const router = createAgentRouter((t, name, input) => executeAgentDocTool(t, name, input, deps));
    const detach = router.attach(SESSION, target);
    const call = router.handle({
      sessionId: SESSION,
      name: "insert_image",
      input: { file: { bytes: PNG, mime: "image/png", name: "plot.png" } },
    });
    await Promise.resolve();
    detach();
    finish();
    expect(await call).toEqual(BLOCK_GONE);
    expect(types(editor)).toEqual(["agent", "paragraph"]);
  });
});

describe("the synchronous tools", () => {
  it("refuse a write once the block is gone, and reattaching clears it", () => {
    const { editor, target } = seed();
    const router = createAgentRouter();
    const detach = router.attach(SESSION, target);
    detach();
    expect(target.detached).toBe(true);
    const insert = () =>
      runAgentDocTool(target, "insert_math", { latex: "x^2", inline: true, id: "b2" });
    expect(insert()).toEqual(BLOCK_GONE);
    router.attach(SESSION, target);
    expect(target.detached).toBe(false);
    expect(insert()).toMatchObject({ ok: true });
    expect(types(editor)).toEqual(["agent", "paragraph"]);
  });
});
