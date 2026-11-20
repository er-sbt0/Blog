// @vitest-environment jsdom
/**
 * One undo step per agent turn, and the block's own record off the history
 * (docs/plans/archive/agent-block.md §4.1, §13, phase 6).
 *
 * Against Lexical's real history: the `HistoryPlugin` the app mounts, inside a
 * real `LexicalComposer`, driven by `UNDO_COMMAND` / `REDO_COMMAND`. The
 * writes are the real ones — `runAgentDocTool` for the agent's, and
 * `writeAgentBookkeeping` for the block's — so what is pinned is the
 * behaviour an author gets: a turn of several writes undoes in one step, an
 * undo never rolls back a log, an outcome or a session id, and typing between
 * two of the agent's writes keeps both sides separately undoable.
 */
import "@vanilla-extract/css/disableRuntimeStyles";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setState,
  type LexicalEditor,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { useEffect } from "react";
import { blockIdState } from "@/lib/content-bridge";
import {
  $createAgentBlockNode,
  $isAgentBlockNode,
  AgentBlockNode,
} from "@/editor/nodes/AgentBlockNode";
import type { AgentBlockData } from "@/editor/nodes/AgentBlockNode/model";
import { writeAgentBookkeeping } from "@/editor/nodes/AgentBlockNode/bookkeeping";
import { UPDATE_DOCUMENT_COMMAND } from "@/editor/commands";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { runAgentDocTool } from "../agentDocTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function Capture({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return null;
}

/** A mounted composer with the app's `HistoryPlugin`, one agent block and one paragraph. */
function mount(): { editor: LexicalEditor; target: AgentToolTarget; saves: () => number } {
  let editor: LexicalEditor | null = null;
  const container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root!.render(
      <LexicalComposer
        initialConfig={{
          namespace: "agent-history-test",
          nodes: [HeadingNode, QuoteNode, AgentBlockNode],
          onError: (error) => {
            throw error;
          },
        }}
      >
        <HistoryPlugin />
        <Capture
          onEditor={(e) => {
            editor = e;
          }}
        />
      </LexicalComposer>,
    )
  );
  const live = editor as unknown as LexicalEditor;
  let blockKey = "";
  live.update(() => {
    const agent = $createAgentBlockNode();
    $setState(agent, blockIdState, "blk_agent");
    blockKey = agent.getKey();
    $getRoot().clear().append(
      agent,
      $createParagraphNode().append($createTextNode("tail")),
    );
  }, { discrete: true });
  let saves = 0;
  live.registerCommand(UPDATE_DOCUMENT_COMMAND, () => {
    saves += 1;
    return false;
  }, 0);
  return { editor: live, target: { editor: live, blockKey }, saves: () => saves };
}

const texts = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) =>
      node.getType() === "agent" ? "<agent>" : node.getTextContent()
    )
  );

const record = (editor: LexicalEditor, key: string): AgentBlockData => {
  const data = editor.getEditorState().read(() => {
    const node = $getNodeByKey(key);
    return $isAgentBlockNode(node) ? node.getData() : null;
  });
  if (!data) throw new Error("no agent block");
  return data;
};

const insert = (target: AgentToolTarget, text: string) => {
  const result = runAgentDocTool(target, "apply_ops", {
    stateHash: /stateHash: (h_[0-9a-f]+)/.exec(
      (runAgentDocTool(target, "outline", {}) as { text: string }).text,
    )![1],
    ops: [{ op: "insert_blocks", blocks: [{ type: "paragraph", text }] }],
  });
  expect(result.ok).toBe(true);
};

/**
 * Undo, then let it land: a command runs inside an update, so the restored
 * state commits on the next microtask, and the record's re-assertion is an
 * update queued from that commit's listener.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const undo = async (editor: LexicalEditor) => {
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await settle();
};
const redo = async (editor: LexicalEditor) => {
  editor.dispatchCommand(REDO_COMMAND, undefined);
  await settle();
};

/** What a block does when it sends: the prompt and the provisional outcome, then a turn id. */
function startTurn(editor: LexicalEditor, target: AgentToolTarget, prompt: string, turn: string) {
  writeAgentBookkeeping(editor, target.blockKey, (current) => ({
    prompts: [...current.prompts, prompt],
    status: "interrupted",
  }));
  target.turn = turn;
}

/** What a block does at `turn-end`. */
function endTurn(editor: LexicalEditor, target: AgentToolTarget, line: string) {
  writeAgentBookkeeping(editor, target.blockKey, (current) => ({
    log: [...current.log, { turn: current.prompts.length - 1, kind: "text", text: line }],
    status: "done",
  }));
}

/** Typing, as history sees it: an ordinary update that changes a text node. */
const type = (editor: LexicalEditor, text: string) =>
  editor.update(() => {
    const last = $getRoot().getLastChild();
    const leaf = $isElementNode(last) ? last.getFirstDescendant() : null;
    if ($isTextNode(leaf)) leaf.setTextContent(text);
  }, { discrete: true });

describe("one undo step per turn", () => {
  it("undoes a turn of three writes in one step, and redoes it in one", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "write three", "t1");
    insert(target, "A");
    insert(target, "B");
    insert(target, "C");
    endTurn(editor, target, "Wrote three paragraphs.");
    expect(texts(editor)).toEqual(["<agent>", "A", "B", "C", "tail"]);

    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "tail"]);
    await redo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "B", "C", "tail"]);
  });

  it("keeps two turns as two steps", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "one", "t1");
    insert(target, "A");
    insert(target, "B");
    endTurn(editor, target, "first");
    startTurn(editor, target, "two", "t2");
    insert(target, "C");
    insert(target, "D");
    endTurn(editor, target, "second");

    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "B", "tail"]);
    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "tail"]);
  });

  it("splits a turn the author typed into, so each side undoes on its own", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "go", "t1");
    insert(target, "A");
    type(editor, "tail, edited");
    insert(target, "B");
    endTurn(editor, target, "done");
    expect(texts(editor)).toEqual(["<agent>", "A", "B", "tail, edited"]);

    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "tail, edited"]);
    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "tail"]);
    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "tail"]);
  });

  it("does not merge into a turn the author undid", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "go", "t1");
    insert(target, "A");
    await undo(editor);
    insert(target, "B");
    expect(texts(editor)).toEqual(["<agent>", "B", "tail"]);
    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "tail"]);
  });

  it("asks for a save after a merged write, which autosave would otherwise skip", async () => {
    const { target, saves } = mount();
    target.turn = "t1";
    insert(target, "A");
    expect(saves()).toBe(0);
    insert(target, "B");
    insert(target, "C");
    expect(saves()).toBe(2);
  });
});

describe("the block's record is off the history", () => {
  it("survives undoing the turn that wrote it: log, outcome, prompts and session", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "go", "t1");
    writeAgentBookkeeping(editor, target.blockKey, () => ({ sessionId: "s-1", cwd: "/w" }));
    insert(target, "A");
    endTurn(editor, target, "Wrote A.");

    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "tail"]);
    expect(record(editor, target.blockKey)).toMatchObject({
      sessionId: "s-1",
      cwd: "/w",
      prompts: ["go"],
      status: "done",
      log: [{ text: "Wrote A." }],
    });
    // Nothing for undo to do with the record itself: one step, and it was the turn.
    await undo(editor);
    expect(record(editor, target.blockKey).prompts).toEqual(["go"]);
  });

  it("never revives a stale log: undoing turn two keeps turn two's entries", async () => {
    const { editor, target } = mount();
    startTurn(editor, target, "one", "t1");
    insert(target, "A");
    endTurn(editor, target, "first");
    startTurn(editor, target, "two", "t2");
    insert(target, "B");
    endTurn(editor, target, "second");

    await undo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "tail"]);
    expect(record(editor, target.blockKey).log.map((e) => e.text)).toEqual(["first", "second"]);
    await undo(editor);
    expect(record(editor, target.blockKey).log.map((e) => e.text)).toEqual(["first", "second"]);
    await redo(editor);
    await redo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "B", "tail"]);
    expect(record(editor, target.blockKey).prompts).toEqual(["one", "two"]);
  });

  it("keeps a withdrawn grant withdrawn across an undo", async () => {
    const { editor, target } = mount();
    writeAgentBookkeeping(editor, target.blockKey, () => ({ grants: ["Bash(ls)", "@acceptEdits"] }));
    target.turn = "t1";
    insert(target, "A");
    writeAgentBookkeeping(editor, target.blockKey, (current) => ({
      grants: current.grants.filter((g) => g !== "Bash(ls)"),
    }));
    await undo(editor);
    expect(record(editor, target.blockKey).grants).toEqual(["@acceptEdits"]);
  });

  it("is not an undo step of its own, and leaves the redo stack alone", async () => {
    const { editor, target } = mount();
    target.turn = "t1";
    insert(target, "A");
    await undo(editor);
    writeAgentBookkeeping(editor, target.blockKey, (current) => ({
      log: [...current.log, { turn: 0, kind: "result", text: "Stopped by you." }],
    }));
    await redo(editor);
    expect(texts(editor)).toEqual(["<agent>", "A", "tail"]);
    expect(record(editor, target.blockKey).log).toHaveLength(1);
  });
});
