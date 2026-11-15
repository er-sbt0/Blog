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
import { ListItemNode, ListNode } from "@lexical/list";
import { blockIdState } from "@/lib/content-bridge";
import {
  $createAgentBlockNode,
  AgentBlockNode,
} from "@/editor/nodes/AgentBlockNode";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { commonSubsequence, runAgentDocTool } from "../agentDocTools";

/**
 * The renderer's doc-tool executor (docs/plans/agent-block.md §4.1, phase 1),
 * on a real headless editor, because every claim here is about the *live*
 * tree: that a write is spliced in rather than replacing the state (the spec
 * holds node keys across a call and finds the same nodes afterwards), that the
 * freshness guard refuses before anything is touched, and that the agent's own
 * block is described and never read, rewritten or moved.
 */

const SECRET = "tool output that quoted ~/.ssh/config";

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "agent-doc-tools-test",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, AgentBlockNode],
    onError: (error) => {
      throw error;
    },
  });

interface Seeded {
  editor: LexicalEditor;
  target: AgentToolTarget;
  keys: string[];
}

/** `texts` around one agent block at `agentAt`, which has a stored log. */
function seed(texts: string[], agentAt = 1): Seeded {
  const editor = makeEditor();
  const keys: string[] = [];
  let blockKey = "";
  editor.update(
    () => {
      const root = $getRoot();
      texts.forEach((text, i) => {
        if (i === agentAt) {
          const agent = $createAgentBlockNode({
            sessionId: "s-1",
            prompts: ["write an intro"],
            log: [{ turn: 0, kind: "text", text: SECRET }],
          });
          $setState(agent, blockIdState, "blk_agent");
          root.append(agent);
          blockKey = agent.getKey();
        }
        const p = $createParagraphNode().append($createTextNode(text));
        root.append(p);
        keys.push(p.getKey());
      });
      if (agentAt >= texts.length) {
        const agent = $createAgentBlockNode({ sessionId: "s-1", prompts: ["go"] });
        $setState(agent, blockIdState, "blk_agent");
        root.append(agent);
        blockKey = agent.getKey();
      }
    },
    { discrete: true, tag: HISTORY_MERGE_TAG },
  );
  return { editor, target: { editor, blockKey }, keys };
}

const texts = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) =>
      node.getType() === "agent" ? "<agent>" : node.getTextContent()
    )
  );

const hashOf = (text: string) => /stateHash: (h_[0-9a-f]+)/.exec(text)?.[1] ?? "";

function outlineOf(target: AgentToolTarget): string {
  const result = runAgentDocTool(target, "outline", {});
  if (!result.ok) throw new Error(result.error);
  return result.text;
}

describe("outline and read_blocks on the live editor", () => {
  it("describes the agent block and never quotes its log", () => {
    const { target } = seed(["one", "two"]);
    const text = outlineOf(target);
    expect(text).toMatch(/stateHash: h_/);
    expect(text).toContain("Your agent block is blk_agent");
    expect(text).toContain("agent session · 1 turn");
    expect(text).not.toContain(SECRET);

    const read = runAgentDocTool(target, "read_blocks", {
      blocks: ["blk_agent", "b1"],
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.text).not.toContain(SECRET);
    expect(JSON.parse(read.text).blocks[0]).toMatchObject({
      type: "opaque",
      nodeType: "agent",
    });
  });

  it("answers for a missing target and an unknown tool rather than throwing", () => {
    expect(runAgentDocTool(null, "outline", {}).ok).toBe(false);
    const { target } = seed(["one"]);
    expect(runAgentDocTool(target, "rm_rf", {}).ok).toBe(false);
    expect(runAgentDocTool(target, "read_blocks", {}).ok).toBe(false);
  });
});

describe("apply_ops against the live editor", () => {
  it("inserts after the agent block by default, in order, and keeps going after its last insert", () => {
    const { editor, target, keys } = seed(["one", "two"]);
    const first = runAgentDocTool(target, "apply_ops", {
      stateHash: hashOf(outlineOf(target)),
      ops: [
        { op: "insert_blocks", blocks: [{ type: "paragraph", text: "A" }] },
        { op: "insert_blocks", blocks: [{ type: "paragraph", text: "B" }] },
      ],
    });
    expect(first.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "<agent>", "A", "B", "two"]);
    expect(target.lastInserted).toMatch(/^blk_/);

    const second = runAgentDocTool(target, "apply_ops", {
      stateHash: hashOf(first.ok ? first.text : ""),
      ops: [{
        op: "insert_blocks",
        blocks: [{ type: "heading", level: 2, text: "C" }],
      }],
    });
    expect(second.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "<agent>", "A", "B", "C", "two"]);

    // Spliced, not replaced: the author's paragraphs are the same nodes.
    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children[0].getKey()).toBe(keys[0]);
      expect(children[5].getKey()).toBe(keys[1]);
    });
  });

  it("honours an explicit placement", () => {
    const { editor, target } = seed(["one", "two"]);
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: hashOf(outlineOf(target)),
      ops: [{
        op: "insert_blocks",
        appendTo: "root",
        blocks: [{ type: "quote", text: "end" }],
      }],
    });
    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "<agent>", "two", "end"]);
  });

  it("sets text in place, keeping the paragraph node and everything else", () => {
    const { editor, target, keys } = seed(["one", "two", "three"]);
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: hashOf(outlineOf(target)),
      ops: [{ op: "set_text", id: "b3", text: "**TWO**" }],
    });
    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["one", "<agent>", "TWO", "three"]);
    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children.map((c) => c.getKey())).toEqual([
        keys[0],
        children[1].getKey(),
        keys[1],
        keys[2],
      ]);
      // Stamped, because a write touched it.
      expect($getState(children[2], blockIdState)).toMatch(/^blk_/);
    });
  });

  it("deletes, moves and replaces with snapshot addressing", () => {
    const { editor, target } = seed(["one", "two", "three", "four"], 4);
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: hashOf(outlineOf(target)),
      ops: [
        { op: "delete_block", id: "b1" },
        // Still "two": addresses resolve against the read, not the half-done batch.
        { op: "move_block", id: "b2", appendTo: "root" },
        { op: "replace_block", id: "b3", block: { type: "heading", level: 1, text: "Three" } },
      ],
    });
    expect(result.ok).toBe(true);
    expect(texts(editor)).toEqual(["Three", "four", "<agent>", "two"]);
  });

  it("refuses a stale read without touching the document", () => {
    const { editor, target } = seed(["one", "two"]);
    const stale = hashOf(outlineOf(target));
    editor.update(
      () => {
        $getRoot().getFirstChildOrThrow().selectEnd().insertText("!");
      },
      { discrete: true },
    );
    const before = texts(editor);
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: stale,
      ops: [{ op: "set_text", id: "b1", text: "x" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/^stale:/);
    expect(texts(editor)).toEqual(before);
  });

  it("is not stale because the agent block's log changed", () => {
    const { editor, target } = seed(["one"]);
    const hash = hashOf(outlineOf(target));
    editor.update(
      () => {
        const agent = $getRoot().getChildren()[1] as AgentBlockNode;
        agent.setData({ log: [{ turn: 0, kind: "text", text: "more" }], status: "done" });
      },
      { discrete: true },
    );
    const result = runAgentDocTool(target, "apply_ops", {
      stateHash: hash,
      ops: [{ op: "set_text", id: "b1", text: "uno" }],
    });
    expect(result.ok).toBe(true);
  });

  it("refuses to rewrite, move, delete or fill an agent block", () => {
    const { editor, target } = seed(["one", "two"]);
    const hash = hashOf(outlineOf(target));
    for (const op of [
      { op: "delete_block", id: "blk_agent" },
      { op: "move_block", id: "b2", appendTo: "root" },
      { op: "replace_block", id: "blk_agent", block: { type: "paragraph", text: "x" } },
      { op: "insert_blocks", appendTo: "blk_agent", blocks: [{ type: "paragraph", text: "x" }] },
    ]) {
      const result = runAgentDocTool(target, "apply_ops", { stateHash: hash, ops: [op] });
      expect(result.ok).toBe(false);
    }
    expect(texts(editor)).toEqual(["one", "<agent>", "two"]);
    editor.getEditorState().read(() => {
      const agent = $getRoot().getChildren()[1] as AgentBlockNode;
      expect(agent.getData().log[0].text).toBe(SECRET);
    });
  });

  it("refuses an invalid call and a read-only editor", () => {
    const { editor, target } = seed(["one"]);
    const hash = hashOf(outlineOf(target));
    expect(
      runAgentDocTool(target, "apply_ops", {
        stateHash: hash,
        ops: [{ op: "insert_blocks", blocks: [{ type: "heading", level: 9, text: "x" }] }],
      }).ok,
    ).toBe(false);
    editor.setEditable(false);
    expect(
      runAgentDocTool(target, "apply_ops", {
        stateHash: hash,
        ops: [{ op: "set_text", id: "b1", text: "x" }],
      }).ok,
    ).toBe(false);
    expect(texts(editor)).toEqual(["one", "<agent>"]);
  });
});

describe("commonSubsequence", () => {
  it("matches prefix, suffix and the longest middle", () => {
    expect(commonSubsequence(["a", "b", "c", "d"], ["a", "x", "c", "d"])).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
    expect(commonSubsequence(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(commonSubsequence([], ["a"])).toEqual([]);
  });
});
