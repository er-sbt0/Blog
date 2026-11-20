/**
 * `/agent` — a Claude Code session as a block in the post
 * (docs/plans/archive/agent-block.md §3.3).
 *
 * The block holds the session, not its output: the agent's work lands as
 * ordinary sibling blocks through the doc tools (`utils/agentDocTools.ts`), so
 * deleting this block leaves the work where it is. What this node stores is a
 * working record — prompts, a capped log, which folder — and three surfaces must
 * never show it to a reader:
 *
 * - **`/view`, `/embed`** render `exportDOM`, which is `{ element: null }`, so
 *   `$generateHtmlFromNodes` skips the node outright;
 * - **docx** walks nodes through `$mapNodeToDocx`, which has no arm for this
 *   type and so emits nothing;
 * - **the content bridge** describes it ("agent session · 3 turns") and has no
 *   codec, so an agent reading the post through blog-content never gets the log
 *   (§6 q5; `describeNode` in `content-bridge/blocks.ts`).
 *
 * `getTextContent` is empty for the same reason: thumbnails, search snippets
 * and word counts read text content, and none of them should quote a log.
 *
 * Registered in the main editor config everywhere — a post containing one must
 * load on the VPS too — but *not* in `nestedConfig.tsx`, so a sticky or nested
 * doc cannot hold one, and the picker only offers `/agent` when the host injects
 * an agent capability (`context/AgentHostContext.tsx`).
 */
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { type JSX, lazy, Suspense } from "react";
import {
  AGENT_BLOCK_TYPE,
  type AgentBlockData,
  emptyAgentData,
  readAgentData,
  serializeAgentData,
} from "./model";

const AgentBlockComponent = lazy(() => import("./AgentBlockComponent"));

export type SerializedAgentBlockNode = Spread<
  {
    sessionId?: string;
    cwd?: string;
    prompts: string[];
    log: AgentBlockData["log"];
    status: AgentBlockData["status"];
    context?: AgentBlockData["context"];
    grants?: string[];
    dropped?: AgentBlockData["dropped"];
  },
  SerializedLexicalNode
>;

export class AgentBlockNode extends DecoratorNode<JSX.Element> {
  __data: AgentBlockData;

  static getType(): string {
    return "agent";
  }

  static clone(node: AgentBlockNode): AgentBlockNode {
    return new AgentBlockNode(node.__data, node.__key);
  }

  static importJSON(serializedNode: SerializedAgentBlockNode): AgentBlockNode {
    return $createAgentBlockNode().updateFromJSON(serializedNode);
  }

  constructor(data: AgentBlockData = emptyAgentData(), key?: NodeKey) {
    super(key);
    this.__data = data;
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedAgentBlockNode>,
  ): this {
    const node = super.updateFromJSON(serializedNode);
    node.getWritable().__data = readAgentData(
      serializedNode as unknown as Record<string, unknown>,
    );
    return node;
  }

  exportJSON(): SerializedAgentBlockNode {
    return {
      ...super.exportJSON(),
      ...(serializeAgentData(this.__data) as Omit<
        SerializedAgentBlockNode,
        keyof SerializedLexicalNode
      >),
      type: AGENT_BLOCK_TYPE,
      version: 1,
    };
  }

  /** Nothing in the post body — see the file comment. */
  exportDOM(): DOMExportOutput {
    return { element: null };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.className = "agent-block";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): false {
    return false;
  }

  getTextContent(): string {
    return "";
  }

  getData(): AgentBlockData {
    return this.getLatest().__data;
  }

  /** Replace some fields. Prompts and log are replaced whole, never merged. */
  setData(patch: Partial<AgentBlockData>): this {
    const writable = this.getWritable();
    writable.__data = { ...writable.__data, ...patch };
    return writable;
  }

  decorate(): JSX.Element {
    return (
      <Suspense fallback={null}>
        <AgentBlockComponent nodeKey={this.getKey()} data={this.__data} />
      </Suspense>
    );
  }
}

export function $createAgentBlockNode(
  data: Partial<AgentBlockData> = {},
): AgentBlockNode {
  return $applyNodeReplacement(
    new AgentBlockNode({ ...emptyAgentData(), ...data }),
  );
}

export function $isAgentBlockNode(
  node: LexicalNode | null | undefined,
): node is AgentBlockNode {
  return node instanceof AgentBlockNode;
}
