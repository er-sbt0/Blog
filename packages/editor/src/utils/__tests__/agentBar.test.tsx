// @vitest-environment jsdom
/**
 * The bar's way into a session: `SEND_AGENT_PROMPT_COMMAND`
 * (docs/plans/agent-bar.md §3, §3.1, §4.1, phase 1).
 *
 * Mounted for real — `LexicalComposer`, a `ContentEditable` so decorators
 * render, the real `AgentPlugin` and the real session node component — with a
 * fake agent host whose `attach` is a real `createAgentRouter`'s. So what is
 * pinned is the whole hand-off: the command finds or inserts the right node,
 * the node claims the prompt and runs the turn (`host.start`, then
 * `host.send` on the same session), the session is attached to the router so
 * a doc-tool call reaches this editor, and every turn carries its own
 * selection while only the first is kept on the node.
 */
import "@vanilla-extract/css/disableRuntimeStyles";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import type { CapturedSelection } from "@/lib/ai/selection";
import {
  $isAgentBlockNode,
  AgentBlockNode,
} from "@/editor/nodes/AgentBlockNode";
import type { AgentBlockData } from "@/editor/nodes/AgentBlockNode/model";
import {
  type AgentHost,
  AgentHostProvider,
  type AgentSessionEvent,
  type AgentTurnContext,
} from "@/editor/context/AgentHostContext";
import AgentPlugin, {
  type AgentBarFocusRequest,
  getAgentTurns,
  getCurrentAgentSession,
  INSERT_AGENT_BLOCK_COMMAND,
  onAgentBarFocusRequest,
  onAgentPromptReturned,
  type AgentPromptReturn,
  SEND_AGENT_PROMPT_COMMAND,
} from "@/editor/plugins/AgentPlugin";
import { createAgentRouter } from "../agentRouter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIRST = "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10";
const SECOND = "7a1e2d3c-1111-4f7a-9d55-3a1c2b9e8f10";

// jsdom has no layout; Lexical measures the caret to scroll it into view.
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

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

function fakeHost() {
  const router = createAgentRouter();
  const listeners = new Map<string, (event: AgentSessionEvent) => void>();
  const sessions = [FIRST, SECOND];
  const start = vi.fn(async (_prompt: string, _context: AgentTurnContext) => ({
    ok: true as const,
    sessionId: sessions.shift() as string,
    cwd: "/home/someone/work",
  }));
  const send = vi.fn(
    async (_id: string, _prompt: string, _context: AgentTurnContext, _grants: string[]) => ({
      ok: true as const,
    }),
  );
  const host: AgentHost = {
    start,
    send,
    interrupt: vi.fn(async () => true),
    answerPermission: vi.fn(),
    onEvent: (sessionId, cb) => {
      listeners.set(sessionId, cb);
      return () => listeners.delete(sessionId);
    },
    attach: (sessionId, target) => router.attach(sessionId, target),
  };
  /** Main saying the turn is over. */
  const endTurn = (sessionId: string) =>
    act(() => listeners.get(sessionId)?.({ sessionId, type: "turn-end" }));
  return { host, router, start, send, endTurn };
}

/** Three paragraphs, A B C, under the app's plugin and a host (or none). */
function mount(host: AgentHost | null): LexicalEditor {
  let editor: LexicalEditor | null = null;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <LexicalComposer
        initialConfig={{
          namespace: "agent-bar-test",
          nodes: [HeadingNode, QuoteNode, AgentBlockNode],
          onError: (error) => {
            throw error;
          },
          editorState: () => {
            $getRoot().append(
              ...["A", "B", "C"].map((t) => $createParagraphNode().append($createTextNode(t))),
            );
          },
        }}
      >
        <AgentHostProvider host={host} postTitle="A post">
          <RichTextPlugin
            contentEditable={<ContentEditable />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <AgentPlugin />
        </AgentHostProvider>
        <Capture
          onEditor={(e) => {
            editor = e;
          }}
        />
      </LexicalComposer>,
    )
  );
  return editor as unknown as LexicalEditor;
}

/** Until `check` holds: the lazy component loads, effects run, promises settle. */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  throw new Error("timed out");
}

const outline = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot().getChildren().map((node) =>
      $isAgentBlockNode(node) ? "<agent>" : node.getTextContent()
    )
  );

const agents = (editor: LexicalEditor): AgentBlockData[] =>
  editor.getEditorState().read(() =>
    $getRoot().getChildren().filter($isAgentBlockNode).map((n) => n.getData())
  );

/** Put the caret in the paragraph reading `text`. */
const caretIn = (editor: LexicalEditor, text: string) =>
  editor.update(() => {
    const block = $getRoot().getChildren().find((n) => n.getTextContent() === text);
    const leaf = $isElementNode(block) ? block.getFirstDescendant() : null;
    if ($isTextNode(leaf)) leaf.select(1, 1);
  }, { discrete: true });

/** Dispatch as the bar will, then let the command's update commit. */
const send = async (
  editor: LexicalEditor,
  prompt: string,
  selection: CapturedSelection | null = null,
  newSession = false,
): Promise<boolean> => {
  let sent = false;
  await act(async () => {
    sent = editor.dispatchCommand(SEND_AGENT_PROMPT_COMMAND, { prompt, selection, newSession });
  });
  return sent;
};

const inB: CapturedSelection = { kind: "blocks", ids: ["b2"] };
const inA: CapturedSelection = { kind: "blocks", ids: ["b1"] };

describe("SEND_AGENT_PROMPT_COMMAND", () => {
  it("inserts a node after the block holding the caret, starts a session and attaches it", async () => {
    const fake = fakeHost();
    const editor = mount(fake.host);
    caretIn(editor, "B");

    expect(await send(editor, "  write a list  ", inB)).toBe(true);
    expect(outline(editor)).toEqual(["A", "B", "<agent>", "C"]);

    await until(() => agents(editor)[0]?.sessionId === FIRST);
    expect(fake.start).toHaveBeenCalledTimes(1);
    const [prompt, context] = fake.start.mock.calls[0];
    expect(prompt).toBe("write a list");
    expect(context.selection).toEqual(inB);
    expect(context.title).toBe("A post");
    expect(context.outline).toMatch(/stateHash: h_/);
    expect(agents(editor)[0]).toMatchObject({
      prompts: ["write a list"],
      context: inB,
      cwd: "/home/someone/work",
    });

    // Attached: a doc-tool call for the session reaches this editor.
    const result = await fake.router.handle({ sessionId: FIRST, name: "outline", input: {} });
    expect(result).toMatchObject({ ok: true });
    expect(getCurrentAgentSession(editor)).toMatchObject({ sessionId: FIRST, turns: 1 });
  });

  it("puts the node at the end of the post when there is no caret", async () => {
    const fake = fakeHost();
    const editor = mount(fake.host);
    expect(await send(editor, "go")).toBe(true);
    expect(outline(editor)).toEqual(["A", "B", "C", "<agent>", ""]);
    await until(() => fake.start.mock.calls.length === 1);
  });

  it("continues the session on the next command, with that turn's selection", async () => {
    const fake = fakeHost();
    const editor = mount(fake.host);
    caretIn(editor, "B");
    await send(editor, "first", inB);
    await until(() => agents(editor)[0]?.sessionId === FIRST);

    // Still running: a second send is refused and the bar keeps its draft.
    expect(await send(editor, "too soon", inA)).toBe(false);
    expect(getAgentTurns().find((t) => t.editor === editor)?.phase).toBe("running");

    fake.endTurn(FIRST);
    await until(() => getAgentTurns().find((t) => t.editor === editor)?.phase === "idle");

    caretIn(editor, "A");
    expect(await send(editor, "second", inA)).toBe(true);
    await until(() => fake.send.mock.calls.length === 1);
    expect(outline(editor)).toEqual(["A", "B", "<agent>", "C"]);
    const [sessionId, prompt, context] = fake.send.mock.calls[0];
    expect(sessionId).toBe(FIRST);
    expect(prompt).toBe("second");
    expect(context.selection).toEqual(inA);
    expect(fake.start).toHaveBeenCalledTimes(1);
    // Only the first selection is kept on the node.
    expect(agents(editor)[0]).toMatchObject({ prompts: ["first", "second"], context: inB });
  });

  it("starts another session in its own node on `newSession`, which becomes current", async () => {
    const fake = fakeHost();
    const editor = mount(fake.host);
    caretIn(editor, "A");
    await send(editor, "one");
    await until(() => agents(editor)[0]?.sessionId === FIRST);
    fake.endTurn(FIRST);
    await until(() => getAgentTurns().filter((t) => t.editor === editor).every((t) => t.phase === "idle"));

    caretIn(editor, "C");
    expect(await send(editor, "two", null, true)).toBe(true);
    expect(outline(editor)).toEqual(["A", "<agent>", "B", "C", "<agent>", ""]);
    await until(() => agents(editor)[1]?.sessionId === SECOND);
    fake.endTurn(SECOND);
    await until(() => getAgentTurns().filter((t) => t.editor === editor).every((t) => t.phase === "idle"));

    expect(await send(editor, "three")).toBe(true);
    await until(() => fake.send.mock.calls.length === 1);
    expect(fake.send.mock.calls[0][0]).toBe(SECOND);
  });

  it("sends nothing and inserts nothing without an agent host", async () => {
    const editor = mount(null);
    expect(await send(editor, "go")).toBe(false);
    expect(outline(editor)).toEqual(["A", "B", "C"]);
  });
});

describe("a send that fails after the hand-off", () => {
  it("takes the prompt off the node and offers it back to the bar", async () => {
    const fake = fakeHost();
    fake.start.mockImplementationOnce(async () =>
      ({ ok: false, error: "cancelled", cancelled: true }) as never
    );
    const editor = mount(fake.host);
    const returned: AgentPromptReturn[] = [];
    const off = onAgentPromptReturned((r) => returned.push(r));
    try {
      expect(await send(editor, "draw it")).toBe(true);
      await until(() => returned.length === 1);
      // Identity, not structure: an editor is a graph with the DOM hanging off it.
      expect(returned[0].editor).toBe(editor);
      expect(returned[0]).toMatchObject({ prompt: "draw it", message: null });
      expect(agents(editor)[0].prompts).toEqual([]);
    } finally {
      off();
    }
  });
});

describe("/agent", () => {
  it("inserts an empty node, asks for the bar, and the next send runs in it", async () => {
    const fake = fakeHost();
    const editor = mount(fake.host);
    const requests: AgentBarFocusRequest[] = [];
    const off = onAgentBarFocusRequest((request) => requests.push(request));
    try {
      caretIn(editor, "A");
      act(() => {
        editor.dispatchCommand(INSERT_AGENT_BLOCK_COMMAND, undefined);
      });
      await until(() => requests.length === 1);
      expect(requests[0].editor).toBe(editor);
      expect(agents(editor)).toHaveLength(1);
      expect(fake.start).not.toHaveBeenCalled();
      expect(getCurrentAgentSession(editor)).toMatchObject({
        nodeKey: requests[0].nodeKey,
        sessionId: null,
        turns: 0,
      });

      expect(await send(editor, "here", inA)).toBe(true);
      await until(() => agents(editor)[0]?.sessionId === FIRST);
      expect(agents(editor)).toHaveLength(1);
      // The node had no selection of its own; its first turn's is kept.
      expect(agents(editor)[0].context).toEqual(inA);
    } finally {
      off();
    }
  });
});
