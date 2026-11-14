import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $setState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { blockIdState } from "@/lib/content-bridge";
import { runAgentDocTool } from "../agentDocTools";

/**
 * The renderer's doc-tool executor (docs/plans/agent-block.md §4.1, phase 0).
 *
 * A real headless editor, because the claim is about the *live* tree: the
 * blocks land beside the nodes already there, by `editor.update` rather than a
 * state replacement — which the spec pins by holding a node key across the
 * call and finding the same node, with the same key, afterwards.
 */

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "agent-doc-tools-test",
    nodes: [HeadingNode, QuoteNode],
    onError: (error) => {
      throw error;
    },
  });

function seed(editor: LexicalEditor, texts: string[], ids: string[] = []): string[] {
  const keys: string[] = [];
  editor.update(
    () => {
      const root = $getRoot();
      texts.forEach((text, i) => {
        const p = $createParagraphNode().append($createTextNode(text));
        if (ids[i]) $setState(p, blockIdState, ids[i]);
        root.append(p);
        keys.push(p.getKey());
      });
    },
    { discrete: true, tag: HISTORY_MERGE_TAG },
  );
  return keys;
}

const texts = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) => node.getTextContent())
  );

describe("insert_blocks against the live editor", () => {
  it("appends to the end with no placement, and stamps what it wrote", () => {
    const editor = makeEditor();
    const [firstKey] = seed(editor, ["one", "two"]);

    const result = runAgentDocTool(editor, "insert_blocks", {
      blocks: [{ type: "paragraph", text: "**three**" }],
    });

    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "two", "three"]);
    if (!result.ok) return;
    expect(result.inserted).toHaveLength(1);
    expect(result.inserted[0]).toMatch(/^blk_/);
    editor.getEditorState().read(() => {
      const root = $getRoot();
      // Same node, same key: spliced in, not a replaced state.
      expect(root.getFirstChild()?.getKey()).toBe(firstKey);
      expect($getState(root.getLastChild()!, blockIdState)).toBe(result.inserted[0]);
    });
  });

  it("inserts after a structural address, in order", () => {
    const editor = makeEditor();
    seed(editor, ["one", "two"]);
    const result = runAgentDocTool(editor, "insert_blocks", {
      after: "b1",
      blocks: [
        { type: "heading", level: 2, text: "A" },
        { type: "paragraph", text: "B" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "A", "B", "two"]);
  });

  it("inserts before a block id", () => {
    const editor = makeEditor();
    seed(editor, ["one", "two"], ["", "blk_two"]);
    const result = runAgentDocTool(editor, "insert_blocks", {
      before: "blk_two",
      blocks: [{ type: "quote", text: "q" }],
    });
    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "q", "two"]);
  });

  it("refuses an unknown address without touching the document", () => {
    const editor = makeEditor();
    seed(editor, ["one"]);
    const result = runAgentDocTool(editor, "insert_blocks", {
      after: "b9",
      blocks: [{ type: "paragraph", text: "x" }],
    });
    expect(result.ok).toBe(false);
    expect(texts(editor)).toEqual(["one"]);
  });

  it("refuses a block the schema rejects", () => {
    const editor = makeEditor();
    seed(editor, ["one"]);
    const result = runAgentDocTool(editor, "insert_blocks", {
      blocks: [{ type: "heading", level: 9, text: "x" }],
    });
    expect(result.ok).toBe(false);
    expect(texts(editor)).toEqual(["one"]);
  });

  it("answers for a missing editor and an unknown tool rather than throwing", () => {
    expect(runAgentDocTool(null, "insert_blocks", {}).ok).toBe(false);
    expect(runAgentDocTool(makeEditor(), "rm_rf", {}).ok).toBe(false);
  });
});
