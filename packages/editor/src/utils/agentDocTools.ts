/**
 * The renderer's half of an agent session's doc tools
 * (docs/plans/agent-block.md §3.1, §4.1).
 *
 * The tools are *defined* in the Electron main process (`packages/desktop/src/
 * agent.js`) and *executed* here, against the live `LexicalEditor` of the post
 * the author has open. That split is the whole of §3.2: the editor is the only
 * writer, so an agent's write merges with the author's typing, lands on the
 * undo stack, and reaches autosave, revisions and the change feed exactly as
 * a keystroke would — nothing writes Postgres behind an open tab.
 *
 * It is also why this file never replaces the editor state. `setEditorState`
 * would apply the same blocks, and reset the author's selection and the undo
 * history while doing it. Each call is one `editor.update` that splices new
 * nodes in beside the ones already there.
 *
 * Built on the content bridge rather than beside it, so a block, an address and
 * a codec mean the same thing here as in blog-content and the Copilot:
 *
 * - the call is validated with `opSchema`'s `insert_blocks` arm — the main
 *   process only describes the shape to the model (plain JS on zod 4 cannot
 *   import this zod 3 schema), so this is where it is enforced;
 * - blocks become nodes through `blockToNode`, the codec every other write
 *   path uses, and then `$parseSerializedNode`, so the node classes'
 *   `importJSON` → `updateFromJSON` path is the one that builds them;
 * - every inserted block is stamped with a fresh `blk_` id (`blockId.ts`) and
 *   the ids are returned, so the agent can address what it just wrote even
 *   after the author has typed above it.
 *
 * Phase 0 implements `insert_blocks` only. The other doc tools of §4.1 arrive
 * in phase 1 behind the same `runAgentDocTool` switch.
 */
import {
  $getRoot,
  $getState,
  $isElementNode,
  $isRootNode,
  $parseSerializedNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type SerializedLexicalNode,
} from "lexical";
import { BLOCK_CONTAINERS, blockIdState } from "@/lib/content-bridge";
import { parseAddress } from "@/lib/content-bridge/address";
import { blockToNode } from "@/lib/content-bridge/blocks";
import { isBlockId, mintBlockId, writeBlockId } from "@/lib/content-bridge/blockId";
import { findWrongChildType } from "@/lib/content-bridge/containers";
import { opSchema } from "@/lib/content-bridge/schema";
import type { SerializedNode, WritableBlock } from "@/lib/content-bridge/types";

/** What every doc tool answers. Plain data: it is structured-cloned to main. */
export type AgentToolResult =
  | { ok: true; inserted: string[] }
  | { ok: false; error: string };

/**
 * Run one doc-tool call against an editor.
 *
 * `null` editor is a normal case — the post was closed, or the focus is on a
 * pane with no document — and answers as a tool error the agent can report,
 * not as a throw.
 */
export function runAgentDocTool(
  editor: LexicalEditor | null,
  name: string,
  input: unknown,
): AgentToolResult {
  if (!editor) return { ok: false, error: "No post is open in the editor." };
  if (!editor.isEditable()) {
    return { ok: false, error: "The open post is read-only." };
  }
  switch (name) {
    case "insert_blocks":
      return insertBlocks(editor, input);
    default:
      return { ok: false, error: `Unknown doc tool: ${name}` };
  }
}

type Placement =
  | { kind: "after" | "before"; address: string }
  | { kind: "append"; address: string };

function placementOf(op: {
  after?: string;
  before?: string;
  appendTo?: string;
}): Placement | string {
  const given = [op.after, op.before, op.appendTo].filter((v) => v !== undefined);
  if (given.length > 1) return "Give at most one of after, before and appendTo.";
  if (op.after !== undefined) return { kind: "after", address: op.after };
  if (op.before !== undefined) return { kind: "before", address: op.before };
  return { kind: "append", address: op.appendTo ?? "root" };
}

function insertBlocks(editor: LexicalEditor, input: unknown): AgentToolResult {
  const parsed = opSchema.safeParse({
    ...(input && typeof input === "object" ? input : {}),
    op: "insert_blocks",
  });
  if (!parsed.success || parsed.data.op !== "insert_blocks") {
    const issue = parsed.success ? undefined : parsed.error.issues[0];
    return {
      ok: false,
      error: issue
        ? `Invalid insert_blocks call at ${issue.path.join(".") || "(root)"}: ${issue.message}`
        : "Invalid insert_blocks call.",
    };
  }
  const op = parsed.data;
  const placement = placementOf(op);
  if (typeof placement === "string") return { ok: false, error: placement };

  // Serialize before touching the editor, so a block the codec refuses fails
  // the call while the document is still exactly as the author left it.
  let serialized: SerializedNode[];
  try {
    serialized = op.blocks.map((block) => {
      const node = blockToNode(block as WritableBlock);
      writeBlockId(node, mintBlockId());
      return node;
    });
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  let result: AgentToolResult = { ok: false, error: "The edit did not run." };
  editor.update(
    () => {
      result = $insert(serialized, placement);
    },
    // Committed before `update` returns, so the answer the agent gets is about
    // a document that already has the blocks in it.
    { discrete: true, tag: AGENT_WRITE_TAG },
  );
  return result;
}

/**
 * The tag on every agent write. Nothing filters on it yet; it is there so
 * phase 6's one-undo-step-per-turn has a way to recognise a turn's updates.
 */
export const AGENT_WRITE_TAG = "agent-write";

function $insert(
  serialized: SerializedNode[],
  placement: Placement,
): AgentToolResult {
  const anchor = $resolveAddress(placement.address);
  if (!anchor) {
    return {
      ok: false,
      error: `No block ${placement.address} — re-read the outline and retry.`,
    };
  }

  const parent = placement.kind === "append" ? anchor : anchor.getParent();
  if (!parent || !$isElementNode(parent)) {
    return {
      ok: false,
      error: `${placement.address} is not a container blocks can go into.`,
    };
  }
  const wrong = findWrongChildType(parent.getType(), serialized);
  if (wrong) {
    return {
      ok: false,
      error: `a ${wrong.container} holds ${wrong.required} blocks only, and this one is a ${wrong.nodeType}.`,
    };
  }

  // Build every node before attaching any, so a node class that throws on
  // import leaves nothing half-inserted.
  const nodes = serialized.map((node) =>
    $parseSerializedNode(node as unknown as SerializedLexicalNode)
  );

  if (placement.kind === "append") {
    (anchor as ElementNode).append(...nodes);
  } else if (placement.kind === "before") {
    for (const node of nodes) anchor.insertBefore(node);
  } else {
    let previous: LexicalNode = anchor;
    for (const node of nodes) {
      previous.insertAfter(node);
      previous = node;
    }
  }

  return {
    ok: true,
    inserted: nodes.map((node) => $getState(node, blockIdState)),
  };
}

/**
 * A content-bridge address, resolved against the live tree.
 *
 * The same two spellings `locate` accepts — a `blk_` id wins, a structural
 * `b4.2` path is the fallback — and the same descent rule as `walkBlocks`:
 * only through `BLOCK_CONTAINERS`. What this cannot follow is a container
 * whose children live in a nested editor (sticky, nested doc, canvas): those
 * are decorators with no live children here, and an address inside one
 * resolves to nothing rather than to the wrong node.
 */
function $resolveAddress(address: string): LexicalNode | null {
  const root = $getRoot();
  if (address === "root") return root;

  if (isBlockId(address)) {
    const walk = (node: LexicalNode): LexicalNode | null => {
      if (!$isRootNode(node) && $getState(node, blockIdState) === address) {
        return node;
      }
      if (!$isElementNode(node)) return null;
      for (const child of node.getChildren()) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(root);
  }

  const path = parseAddress(address);
  if (!path) return null;
  let current: LexicalNode = root;
  for (const index of path) {
    if (!$isElementNode(current) || !BLOCK_CONTAINERS.has(current.getType())) {
      return null;
    }
    const next: LexicalNode | null = current.getChildAtIndex(index);
    if (!next) return null;
    current = next;
  }
  return current;
}
