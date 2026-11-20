/**
 * `plot_graph` (docs/plans/archive/agent-block.md phase 5) on a real headless editor
 * with the real `GraphNode`, and with GeoGebra stubbed — it is a 22 MB applet
 * that needs a browser. The real applet was driven in headless Chrome (the
 * plan's phase-5 log); what is pinned here is everything around it:
 *
 * - the command list is checked before the applet is touched, and a command
 *   GeoGebra rejects comes back named by its index;
 * - nothing scripted gets in, by command or in the saved construction;
 * - the exported SVG goes through the sanitizer, is stored through the
 *   injected blob store, and lands as a `graph` block whose `value` is the
 *   `.ggb` — by the same batch `apply_ops` runs — or replots one in place.
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
import { GraphNode } from "@/editor/nodes/GraphNode";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { executeAgentDocTool } from "../agentImage";
import { runAgentDocTool } from "../agentDocTools";
import {
  checkCommands,
  DEFAULT_GRAPH_SIZE,
  missingLabels,
  type GraphPlotResult,
  type GraphRenderer,
  MAX_COMMANDS,
} from "../agentGraph";

type Json = SerializedLexicalNode & Record<string, unknown>;

/** What a sanitizer does to a handler, which is the part that matters here. */
const dropHandlers = (markup: string) => markup.replace(/\son\w+="[^"]*"/g, "");

const SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="717" height="477">' +
  '<path d="M 0 0 L 10 10" onclick="alert(1)"/></svg>';
const GGB = "UEsDBBQACAgIAGGBGGB";
const XML = '<geogebra format="5.0" app="graphing"><construction/></geogebra>';

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "agent-graph-test",
    nodes: [HeadingNode, QuoteNode, AgentBlockNode, ImageNode, GraphNode],
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

function deps(answer?: (commands: readonly string[]) => GraphPlotResult) {
  const calls = {
    loaded: 0,
    plotted: [] as { commands: readonly string[]; size: { width: number; height: number } }[],
    stored: [] as { file: Blob; dataUri: string; documentId: string | null }[],
  };
  const renderer: GraphRenderer = {
    plot: async (commands, size) => {
      calls.plotted.push({ commands, size });
      return answer?.(commands) ??
        { ok: true, plot: { svg: SVG, ggb: GGB, xml: XML, objects: ["f", "A"] } };
    },
  };
  return {
    calls,
    deps: {
      store: async (file: Blob, dataUri: string, documentId: string | null) => {
        calls.stored.push({ file, dataUri, documentId });
        return "/api/blob/" + "e".repeat(64);
      },
      sanitizeSvg: dropHandlers,
      graphRenderer: async () => {
        calls.loaded += 1;
        return renderer;
      },
    },
  };
}

const COMMANDS = ["f(x)=sin(x)", "A=(1,2)", "ZoomIn(-7,-2,7,3)"];

describe("checkCommands", () => {
  it("trims, and accepts input-bar commands", () => {
    expect(checkCommands([" f(x)=x^2 ", "SetValue(a, 2)"])).toEqual({
      ok: true,
      commands: ["f(x)=x^2", "SetValue(a, 2)"],
    });
  });

  it.each([
    [[], /commands is empty/],
    [["f(x)=x", "  "], /commands\[1\] is empty/],
    [["f(x)=x\ng(x)=2x"], /commands\[0\] \("f\(x\)=x\\ng\(x\)=2x"\) holds a line break/],
    [["A=(1,1)", 'SetClickScript(A, "SetValue(a,1)")'], /commands\[1\].*scripts the applet/],
    [["Execute({\"f(x)=x\"})"], /scripts the applet/],
    [["SetPerspective[\"AG\"]"], /scripts the applet or changes its layout/],
    [["x".repeat(2_001)], /over 2000 characters/],
    [Array.from({ length: MAX_COMMANDS + 1 }, (_, i) => `a${i}=${i}`), /the most one graph takes/],
  ])("refuses %j", (commands, error) => {
    expect(checkCommands(commands)).toMatchObject({ ok: false, error });
  });
});

describe("missingLabels", () => {
  it("names what the commands defined and the construction lost", () => {
    const commands = ["A=(0,0)", "f(x)=x^2", "t=Polygon(A,B,C)", "c=Circle(A,B,C)", "SetColor(c, \"red\")", "a == b", "g'(x)=1"];
    expect(missingLabels(commands, ["A", "f", "c"])).toEqual(["t", "g'"]);
    expect(missingLabels(["z(x)=x", "ZoomIn(-1,-1,1,1)"], ["z"])).toEqual([]);
  });
});

describe("plot_graph", () => {
  it("plots, sanitizes, stores, then inserts a graph after the agent block", async () => {
    const { editor, target } = seed();
    const { calls, deps: d } = deps();
    const result = await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, d);
    expect(result).toMatchObject({ ok: true, text: expect.stringMatching(/Plotted 3 commands \(objects: f, A\), 717×477 px/) });

    expect(result).not.toMatchObject({ text: expect.stringContaining("Check it") });
    expect(calls.plotted).toEqual([{ commands: COMMANDS, size: DEFAULT_GRAPH_SIZE }]);
    const [{ file, dataUri, documentId }] = calls.stored;
    expect(documentId).toBe("doc-1");
    expect(file.type).toBe("image/svg+xml");
    const stored = await file.text();
    expect(stored).not.toContain("onclick");
    expect(stored).toMatch(/^<svg[^>]*xmlns=/);
    expect(dataUri).toBe(`data:image/svg+xml,${encodeURIComponent(stored)}`);

    const children = rootChildren(editor);
    expect(children.map((c) => c.type)).toEqual(["agent", "graph", "paragraph"]);
    expect(children[1]).toMatchObject({
      type: "graph",
      src: "/api/blob/" + "e".repeat(64),
      value: GGB,
      width: 717,
      height: 477,
      altText: "Graph: f(x)=sin(x); A=(1,2); ZoomIn(-7,-2,7,3)",
      showCaption: false,
    });
  });

  it("passes a size, clamped, and keeps a given alt and caption", async () => {
    const { editor, target } = seed();
    const { calls, deps: d } = deps();
    await executeAgentDocTool(
      target,
      "plot_graph",
      { commands: COMMANDS, width: 5_000, height: 10, alt: "a sine", caption: "**Fig. 1**" },
      d,
    );
    expect(calls.plotted[0].size).toEqual({ width: 1_600, height: 200 });
    const graph = rootChildren(editor)[1];
    expect(graph).toMatchObject({ altText: "a sine", showCaption: true });
    expect(JSON.stringify(graph.caption)).toContain("Fig. 1");
  });

  it("names the command GeoGebra rejected, and inserts nothing", async () => {
    const { editor, target } = seed();
    const { calls, deps: d } = deps(() => ({ ok: false, index: 1, error: "Unknown command : Foo" }));
    const result = await executeAgentDocTool(
      target,
      "plot_graph",
      { commands: ["f(x)=x", "Foo(1,2)"] },
      d,
    );
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/^commands\[1\] \("Foo\(1,2\)"\): Unknown command : Foo\. Nothing was inserted/),
    });
    expect(calls.stored).toHaveLength(0);
    expect(rootChildren(editor)).toHaveLength(2);
  });

  it("inserts, and says so, when a defined object did not survive", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps(() => ({
      ok: true,
      plot: { svg: SVG, ggb: GGB, xml: XML, objects: ["A", "B", "C", "c"] },
    }));
    const result = await executeAgentDocTool(
      target,
      "plot_graph",
      { commands: ["A=(0,0)", "B=(4,0)", "C=(1,3)", "t=Polygon(A,B,C)", "c=Circle(A,B,C)"] },
      d,
    );
    expect(result).toMatchObject({ ok: true, text: expect.stringMatching(/Check it: t was defined/) });
    expect(rootChildren(editor)[1]).toMatchObject({ type: "graph" });
  });

  it("refuses a bad list before loading GeoGebra", async () => {
    const { target } = seed();
    const { calls, deps: d } = deps();
    const result = await executeAgentDocTool(target, "plot_graph", { commands: [] }, d);
    expect(result).toMatchObject({ ok: false, error: /commands is empty/ });
    expect(calls.loaded).toBe(0);
  });

  it("refuses a construction that carries a script", async () => {
    const { editor, target } = seed();
    const { calls, deps: d } = deps(() => ({
      ok: true,
      plot: {
        svg: SVG,
        ggb: GGB,
        xml: '<geogebra><element type="point" label="A"><javascript val="alert(1)"/></element></geogebra>',
        objects: ["A"],
      },
    }));
    const result = await executeAgentDocTool(target, "plot_graph", { commands: ["A=(1,1)"] }, d);
    expect(result).toMatchObject({ ok: false, error: /carries a script/ });
    expect(calls.stored).toHaveLength(0);
    expect(rootChildren(editor)).toHaveLength(2);
  });

  it("refuses an export the sanitizer empties", async () => {
    const { target } = seed();
    const { deps: d } = deps();
    d.sanitizeSvg = () => "";
    const result = await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, d);
    expect(result).toMatchObject({ ok: false, error: /nothing left once sanitized/ });
  });

  it("answers a renderer that throws as a tool error", async () => {
    const { target } = seed();
    const { deps: d } = deps();
    d.graphRenderer = async () => {
      throw new Error("GeoGebra took too long to start");
    };
    const result = await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, d);
    expect(result).toMatchObject({ ok: false, error: /took too long to start/ });
  });

  it("stores a local post's graph as the data URI the dialog would", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    d.store = async (_file, dataUri) => dataUri;
    await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, d);
    expect(String(rootChildren(editor)[1].src).startsWith("data:image/svg+xml,")).toBe(true);
  });

  it("replots a graph in place with id, keeping its address and caption", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS, caption: "v1" }, d);
    const id = (rootChildren(editor)[1].$ as Record<string, string>).blockId;
    expect(id).toMatch(/^blk_/);

    const replot = deps(() => ({
      ok: true,
      plot: { svg: SVG, ggb: "NEWGGB", xml: XML, objects: ["g"] },
    }));
    replot.deps.store = async () => "/api/blob/" + "f".repeat(64);
    const result = await executeAgentDocTool(
      target,
      "plot_graph",
      { commands: ["g(x)=x^3"], id },
      replot.deps,
    );
    expect(result).toMatchObject({ ok: true });
    const children = rootChildren(editor);
    expect(children).toHaveLength(3);
    expect(children[1]).toMatchObject({
      type: "graph",
      src: "/api/blob/" + "f".repeat(64),
      value: "NEWGGB",
      altText: "Graph: g(x)=x^3",
      $: { blockId: id },
    });
    expect(JSON.stringify(children[1].caption)).toContain("v1");
  });

  it("will not replot something that is not a graph, or take id with a placement", async () => {
    const { editor, target } = seed();
    const before = JSON.stringify(rootChildren(editor));
    expect(
      await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS, id: "blk_p1" }, deps().deps),
    ).toMatchObject({ ok: false, error: /blk_p1 is a paragraph, not a graph/ });
    expect(
      await executeAgentDocTool(
        target,
        "plot_graph",
        { commands: COMMANDS, id: "blk_p1", after: "blk_agent" },
        deps().deps,
      ),
    ).toMatchObject({ ok: false, error: /takes no after/ });
    expect(JSON.stringify(rootChildren(editor))).toBe(before);
  });

  it("does not write into a post that went read-only while it plotted", async () => {
    const { editor, target } = seed();
    const { deps: d } = deps();
    d.store = async (_file, dataUri) => {
      editor.setEditable(false);
      return dataUri;
    };
    const result = await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, d);
    expect(result).toMatchObject({ ok: false, error: /read-only/ });
    expect(rootChildren(editor)).toHaveLength(2);
  });

  it("is refused by the synchronous executor, which cannot plot", () => {
    const { target } = seed();
    expect(runAgentDocTool(target, "plot_graph", { commands: COMMANDS })).toMatchObject({
      ok: false,
    });
  });
});

describe("apply_ops on the graph plot_graph made", () => {
  const outlineHash = (target: AgentToolTarget) =>
    (/stateHash: (\S+)/.exec((runAgentDocTool(target, "outline", {}) as { text: string }).text) ??
      [])[1];

  it("can re-caption and resize it, and cannot swap its plot or state", async () => {
    const { editor, target } = seed();
    await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, deps().deps);
    const graph = rootChildren(editor)[1];
    const id = (graph.$ as Record<string, string>).blockId;

    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: outlineHash(target),
      ops: [{
        op: "replace_block",
        id,
        block: {
          type: "graph",
          alt: "better",
          caption: "Fig. 2",
          width: 360,
          src: "/api/blob/" + "0".repeat(64),
          value: "EVIL",
        },
      }],
    });
    expect(result).toMatchObject({ ok: true });
    const after = rootChildren(editor)[1];
    expect(after).toMatchObject({
      type: "graph",
      altText: "better",
      width: 360,
      height: 477,
      src: graph.src,
      value: GGB,
    });
    expect(JSON.stringify(after.caption)).toContain("Fig. 2");
  });

  it("reads it back without the plot or the state", async () => {
    const { editor, target } = seed();
    await executeAgentDocTool(target, "plot_graph", { commands: COMMANDS }, deps().deps);
    const id = (rootChildren(editor)[1].$ as Record<string, string>).blockId;
    const read = runAgentDocTool(target, "read_blocks", { blocks: [id] }) as { text: string };
    expect(read.text).toContain('"type":"graph"');
    expect(read.text).not.toContain(GGB);
    expect(read.text).not.toContain("/api/blob/");
  });

  it("refuses to insert a graph, pointing at plot_graph", () => {
    const { target } = seed();
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: outlineHash(target),
      ops: [{ op: "insert_blocks", blocks: [{ type: "graph", alt: "x", src: "/api/blob/x", value: GGB }] }],
    });
    expect(result).toMatchObject({ ok: false, error: /plot_graph/ });
  });
});
