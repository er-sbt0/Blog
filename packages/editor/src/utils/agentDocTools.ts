/**
 * The renderer's half of an agent session's doc tools
 * (docs/plans/agent-block.md §3.1, §4.1).
 *
 * The tools are *defined* in the Electron main process (`packages/desktop/src/
 * agent.js`) and *executed* here, against the live `LexicalEditor` of the post
 * holding the session's block. That split is the whole of §3.2: the editor is
 * the only writer, so an agent's write merges with the author's typing, lands
 * on the undo stack, and reaches autosave, revisions and the change feed exactly
 * as a keystroke would — nothing writes Postgres behind an open tab.
 *
 * ### Same contract as blog-content, by running the same code
 *
 * `outline`, `read_blocks` and `apply_ops` answer exactly what the blog-content
 * MCP tools answer, because they *are* those functions — `outline`,
 * `readBlocks` and `applyOps` from `content-bridge` — run over a snapshot of the
 * live tree instead of a stored revision. Addresses, codecs, the destination
 * guards, snapshot addressing, all-or-nothing and the `stateHash` freshness
 * guard (§6 q2) therefore mean the same thing here as in the terminal, and a
 * batch `applyOps` refuses is refused before the editor is touched.
 *
 * ### …and a reconcile, not a state replacement
 *
 * `applyOps` returns a new serialized state. Handing that to `setEditorState`
 * would apply it — and reset the author's selection and undo history while
 * doing it. So `$reconcile` patches the live tree towards it instead: children
 * whose JSON did not change keep their live node (and key, and selection), an
 * element whose shell is unchanged is recursed into, and only what differs is
 * rebuilt through `$parseSerializedNode` — which is `importJSON` →
 * `updateFromJSON`, the one parse path (`pnpm check:nodes`). One `editor.update`
 * per call, tagged `agent-write`, so it is an ordinary undo step.
 *
 * ### The agent's own block
 *
 * An agent block's log changes while its turn runs (well — at the turn's end;
 * see `AgentBlockNode/model.ts`), and its session id lands just after `start`.
 * If either were hashed, every read would be stale by the time the write that
 * followed it arrived. So the snapshot stands each agent block in for a stub —
 * type, version, node state, turn count — and a write may not name one as its
 * target. The stub is also what `describeNode` reads, so the agent sees "agent
 * session · 2 turns" and never a log (§6 q5).
 */
import {
  $getNodeByKey,
  $getRoot,
  $getState,
  $isElementNode,
  $parseSerializedNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type SerializedLexicalNode,
} from "lexical";
import { z } from "zod";
import {
  BLOCK_CONTAINERS,
  blockIdState,
  formatAddress,
  walkBlocks,
} from "@/lib/content-bridge";
import { applyOps, type Op, OpError } from "@/lib/content-bridge/ops";
import { formatOutline, outline, readBlocks } from "@/lib/content-bridge/outline";
import { StaleStateError, stateHash } from "@/lib/content-bridge/stateHash";
import { readBlockId } from "@/lib/content-bridge/blockId";
import { typeOf } from "@/lib/content-bridge/containers";
import { canSetText } from "@/lib/content-bridge/blocks";
import { parseInline, renderInline } from "@/lib/content-bridge/inline";
import { opSchema } from "@/lib/content-bridge/schema";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import type { AgentToolTarget } from "../context/AgentHostContext";
import { AGENT_BLOCK_TYPE } from "../nodes/AgentBlockNode/model";

/** What every doc tool answers. Plain data: it is structured-cloned to main. */
export type AgentToolResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * The tools this executor answers. Main declares the same five (`DOC_TOOLS`).
 * `insert_image` is async — it uploads — so it runs through
 * `executeAgentDocTool` (`agentImage.ts`); the rest are answered here.
 */
export const AGENT_DOC_TOOLS = [
  "outline",
  "read_blocks",
  "apply_ops",
  "insert_math",
  "insert_image",
] as const;

/**
 * The tag on every agent write. History treats it as an ordinary update (one
 * undo step per call); it is here so phase 6's one-undo-step-per-turn has a way
 * to recognise a turn's writes.
 */
export const AGENT_WRITE_TAG = "agent-write";

/**
 * Run one doc-tool call against the editor holding the session's block.
 *
 * `null` target is a normal case — the post was closed — and answers as a tool
 * error the agent can report, not as a throw.
 */
export function runAgentDocTool(
  target: AgentToolTarget | null,
  name: string,
  input: unknown,
): AgentToolResult {
  if (!target) return { ok: false, error: "The post is not open in the editor." };
  const { editor } = target;
  switch (name) {
    case "outline":
      return outlineTool(target);
    case "read_blocks":
      return readBlocksTool(editor, input);
    case "apply_ops":
      if (!editor.isEditable()) return READ_ONLY;
      return applyOpsTool(target, input);
    case "insert_math":
      if (!editor.isEditable()) return READ_ONLY;
      return insertMathTool(target, input);
    case "insert_image":
      return {
        ok: false,
        error: "insert_image runs through executeAgentDocTool, which uploads.",
      };
    default:
      return { ok: false, error: `Unknown doc tool: ${name}` };
  }
}

export const READ_ONLY: AgentToolResult = {
  ok: false,
  error: "The post is open read-only, so it cannot be edited now.",
};

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Serialize one live node the way `EditorState.toJSON` does — `exportJSON`,
 * then the children — but inside the active read or update, so it sees the
 * same tree the reconcile is about to patch, and with agent blocks stubbed.
 */
function $exportTree(node: LexicalNode): SerializedNode {
  const json = node.exportJSON() as unknown as SerializedNode;
  if (json.type === AGENT_BLOCK_TYPE) return agentStub(json);
  if ($isElementNode(node)) {
    json.children = node.getChildren().map($exportTree);
  }
  return json;
}

/** What an agent block contributes to a snapshot. See the file comment. */
function agentStub(json: SerializedNode): SerializedNode {
  const stub: SerializedNode = {
    type: AGENT_BLOCK_TYPE,
    version: json.version,
    turns: Array.isArray(json.prompts) ? json.prompts.length : 0,
  };
  if (json.$ !== undefined) stub.$ = json.$;
  return stub;
}

/** The live post as a stored state. Must run inside a read or an update. */
function $snapshot(): StoredState {
  return { root: $exportTree($getRoot()) } as StoredState;
}

const readSnapshot = (editor: LexicalEditor): StoredState =>
  editor.getEditorState().read(() => $snapshot());

/** The block's own address, or "" if it has none (yet). */
function $blockIdOf(key: string): string {
  const node = $getNodeByKey(key);
  return node ? $getState(node, blockIdState) : "";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The outline text both the tool and the system prompt hand the model. */
export function agentOutlineText(
  editor: LexicalEditor,
  blockKey?: string,
): string {
  return editor.getEditorState().read(() => {
    const result = outline($snapshot());
    const blockId = blockKey ? $blockIdOf(blockKey) : "";
    return formatOutlineText(result, blockId);
  });
}

function formatOutlineText(
  result: ReturnType<typeof outline>,
  blockId: string,
): string {
  const self = blockId
    ? `\nYour agent block is ${blockId}. Blocks you insert with no placement ` +
      `go after it (after your previous insert, once there is one), in order.`
    : "";
  if (result.blocks.length === 0) {
    return `The post is empty.\nstateHash: ${result.stateHash}${self}`;
  }
  return `stateHash: ${result.stateHash}${self}\n\n${formatOutline(result)}`;
}

function outlineTool(target: AgentToolTarget): AgentToolResult {
  return { ok: true, text: agentOutlineText(target.editor, target.blockKey) };
}

const readInput = z.object({ blocks: z.array(z.string()).min(1) });

function readBlocksTool(editor: LexicalEditor, input: unknown): AgentToolResult {
  const parsed = readInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "read_blocks needs blocks: [address, …]." };
  }
  const result = readBlocks(readSnapshot(editor), parsed.data.blocks);
  if (result.blocks.length === 0) {
    return {
      ok: false,
      error: `No blocks matched ${result.missing.join(", ")} — re-run outline.`,
    };
  }
  return { ok: true, text: JSON.stringify(result) };
}

// ---------------------------------------------------------------------------
// apply_ops
// ---------------------------------------------------------------------------

const applyInput = z.object({
  stateHash: z.string(),
  ops: z.array(opSchema).min(1),
});

/** Addresses — id and path spelling — of every agent block in a state. */
function agentAddresses(state: StoredState): Set<string> {
  const found = new Set<string>();
  for (const entry of walkBlocks(state)) {
    if (typeOf(entry.node) !== AGENT_BLOCK_TYPE) continue;
    found.add(entry.address);
    found.add(formatAddress(entry.path));
  }
  return found;
}

/** The first op that would rewrite, move, delete or fill an agent block. */
function touchesAgentBlock(ops: readonly Op[], agents: Set<string>): string | null {
  for (const [index, op] of ops.entries()) {
    const named = "id" in op ? op.id : undefined;
    const into = "appendTo" in op ? op.appendTo : undefined;
    const hit = [named, into].find((address) => address && agents.has(address));
    if (hit) {
      return `op ${index + 1}: ${hit} is an agent block — the author's, and ` +
        `not yours to edit, move, delete or put blocks inside. Place your ` +
        `blocks after it instead.`;
    }
  }
  return null;
}

/** The structural path of a live node, if every ancestor is addressable. */
function $pathOf(node: LexicalNode): number[] | null {
  const path: number[] = [];
  let current: LexicalNode = node;
  for (;;) {
    const parent: ElementNode | null = current.getParent();
    if (!parent) return null;
    if (!BLOCK_CONTAINERS.has(parent.getType())) return null;
    path.unshift(current.getIndexWithinParent());
    if (parent.getType() === "root") return path;
    current = parent;
  }
}

interface DefaultPlacement {
  /** The placement to write into every op that named none. */
  spec: { before: string } | { appendTo: string };
  /** Live node the inserts land in front of, or null when appending. */
  next: LexicalNode | null;
  parent: ElementNode;
}

/**
 * Where an insert with no placement goes: after the session's last such insert
 * if it is still there, otherwise straight after the agent block.
 *
 * Spelled as `before: <the block after the anchor>` (or `appendTo` its parent
 * when the anchor is last) rather than `after: <anchor>`, so that several
 * default inserts in one batch land in the order they were given instead of
 * each one jumping in front of the last.
 */
function $defaultPlacement(target: AgentToolTarget): DefaultPlacement | null {
  const block = $getNodeByKey(target.blockKey);
  if (!block) return null;
  let anchor: LexicalNode = block;
  if (target.lastInserted) {
    const last = $findById(target.lastInserted);
    if (last && last.getParent()?.is(block.getParent())) anchor = last;
  }
  const parent = anchor.getParent();
  if (!parent) return null;
  const next = anchor.getNextSibling();
  if (next) {
    const path = $pathOf(next);
    return path ? { spec: { before: formatAddress(path) }, next, parent } : null;
  }
  if (parent.getType() === "root") {
    return { spec: { appendTo: "root" }, next: null, parent };
  }
  const parentPath = $pathOf(parent);
  return parentPath
    ? { spec: { appendTo: formatAddress(parentPath) }, next: null, parent }
    : null;
}

function $findById(id: string): LexicalNode | null {
  const walk = (node: LexicalNode): LexicalNode | null => {
    if ($getState(node, blockIdState) === id) return node;
    if (!$isElementNode(node)) return null;
    for (const child of node.getChildren()) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk($getRoot());
}

const hasPlacement = (op: Op): boolean =>
  "after" in op && op.after !== undefined ||
  "before" in op && op.before !== undefined ||
  "appendTo" in op && op.appendTo !== undefined;

function applyOpsTool(target: AgentToolTarget, input: unknown): AgentToolResult {
  const parsed = applyInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid apply_ops call at ${issue?.path.join(".") || "(root)"}: ${
        issue?.message ?? "unreadable input"
      }`,
    };
  }
  return runBatch(target, parsed.data.stateHash, parsed.data.ops as Op[]);
}

/**
 * Apply one batch to the live editor: the guards, the default placement,
 * `applyOps`, then the reconcile. Shared by `apply_ops` and the sugar tools
 * (`insert_math`, `insert_image`), so a block they insert lands exactly where
 * and how the same block would through `apply_ops`.
 *
 * `expected` null means "the post as it is now": the sugar tools take an
 * optional hash, because an insert by `blk_` id stays meaningful however the
 * author has typed since the agent's last read, and an equation is not worth
 * a re-read when that typing was three blocks away.
 */
function runBatch(
  target: AgentToolTarget,
  expected: string | null,
  batch: Op[],
): AgentToolResult {
  const { editor } = target;
  let result: AgentToolResult = { ok: false, error: "The edit did not run." };
  let changed = 0;

  editor.update(
    () => {
      const before = $snapshot();
      let ops = batch;

      const refused = touchesAgentBlock(ops, agentAddresses(before));
      if (refused) {
        result = { ok: false, error: refused };
        return;
      }

      const defaultInserts = ops.some((op) =>
        op.op === "insert_blocks" && !hasPlacement(op)
      );
      const placement = defaultInserts ? $defaultPlacement(target) : null;
      if (placement) {
        ops = ops.map((op) =>
          op.op === "insert_blocks" && !hasPlacement(op)
            ? { ...op, ...placement.spec }
            : op
        );
      }

      let applied: ReturnType<typeof applyOps>;
      try {
        applied = applyOps(before, expected ?? stateHash(before), ops);
      } catch (error) {
        result = { ok: false, error: refusal(error) };
        return;
      }

      // Nothing has been touched yet, and from here nothing can be refused.
      const agents = $agentJsonByBlockId();
      $reconcile(
        $getRoot(),
        before.root.children ?? [],
        applied.state.root.children ?? [],
        (json) => $build(json, agents),
      );
      changed = applied.changed;

      if (placement) {
        const last = placement.next?.isAttached()
          ? placement.next.getPreviousSibling()
          : placement.parent.getLastChild();
        const id = last ? $getState(last, blockIdState) : "";
        if (id) target.lastInserted = id;
      }
      result = { ok: true, text: "" };
    },
    // Committed before `update` returns, so the answer the agent gets is about
    // a document that already has the change in it.
    { discrete: true, tag: AGENT_WRITE_TAG },
  );

  if (!result.ok) return result;
  const after = agentOutlineText(editor, target.blockKey);
  return {
    ok: true,
    text: `Applied ${changed} block change${changed === 1 ? "" : "s"} to the ` +
      `open post. They are live — on the author's undo stack, and saved like ` +
      `their own typing.\n${after}`,
  };
}

// ---------------------------------------------------------------------------
// insert_math, insert_image — sugar over the same batch
// ---------------------------------------------------------------------------

const placementInput = {
  after: z.string().optional(),
  before: z.string().optional(),
  appendTo: z.string().optional(),
  stateHash: z.string().optional(),
};

type PlacementInput = {
  after?: string;
  before?: string;
  appendTo?: string;
  stateHash?: string;
};

/** The placement fields an insert names — none means the default chain. */
const placementOf = ({ after, before, appendTo }: PlacementInput) => ({
  ...(after === undefined ? {} : { after }),
  ...(before === undefined ? {} : { before }),
  ...(appendTo === undefined ? {} : { appendTo }),
});

const mathInput = z.object({
  latex: z.string().min(1),
  inline: z.boolean().optional(),
  id: z.string().optional(),
  ...placementInput,
});

/** Text blocks an inline equation may be appended to — not code, not math. */
const INLINE_HOSTS: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "quote",
  "summary",
  "cell",
]);

/**
 * `insert_math`: a `math` block through `insert_blocks`, or — `inline` — the
 * equation appended to a text block through `set_text`, spelled `$latex$` by
 * the inline codec itself so its escaping is the one a read gives back.
 */
function insertMathTool(target: AgentToolTarget, input: unknown): AgentToolResult {
  const parsed = mathInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "insert_math needs latex: a string of LaTeX." };
  }
  const { latex, inline, id, stateHash: hash } = parsed.data;
  if (!inline) {
    if (id !== undefined) {
      return {
        ok: false,
        error: "id is for inline: true. To place a displayed equation, use " +
          "after, before or appendTo.",
      };
    }
    return runBatch(target, hash ?? null, [{
      op: "insert_blocks",
      blocks: [{ type: "math", latex }],
      ...placementOf(parsed.data),
    } as Op]);
  }

  if (!id) {
    return {
      ok: false,
      error: "inline: true needs id — the paragraph, heading, quote, summary " +
        "or cell to append the equation to.",
    };
  }
  const found = readBlocks(readSnapshot(target.editor), [id]).blocks[0];
  if (!found) return { ok: false, error: `block_not_found: ${id} — re-run outline.` };
  if (!INLINE_HOSTS.has(found.type) || !canSetText(found)) {
    return {
      ok: false,
      error: `${id} is a ${found.type === "opaque" ? found.nodeType : found.type}` +
        `${"readonlyText" in found && found.readonlyText ? " whose text cannot be rewritten" : ""}; ` +
        "an inline equation goes into a paragraph, heading, quote, summary or cell.",
    };
  }
  const text = "text" in found ? found.text : "";
  const equation = renderInline([{ type: "math", version: 1, value: latex }]) ?? "";
  // The inline spelling escapes only `$`, so a LaTeX `\$` comes out as
  // `\\$`, which parses back as `\\` and the closing delimiter. Refuse what
  // would not round-trip rather than write a different equation.
  const back = parseInline(equation);
  if (back.length !== 1 || back[0].type !== "math" || back[0].value !== latex) {
    return {
      ok: false,
      error: "That LaTeX cannot be written inline (a \\$ is ambiguous inside " +
        "$…$). Insert it as a displayed equation instead.",
    };
  }
  const joined = text === "" || /\s$/.test(text) ? `${text}${equation}` : `${text} ${equation}`;
  return runBatch(target, hash ?? null, [{ op: "set_text", id, text: joined }]);
}

/** What `insert_image` inserts once `agentImage.ts` has a `src` for it. */
export interface ResolvedImage extends PlacementInput {
  src: string;
  alt: string;
  caption?: string;
}

/** The synchronous half of `insert_image`: an `image` block, placed. */
export function insertImageBlock(
  target: AgentToolTarget,
  image: ResolvedImage,
): AgentToolResult {
  if (!target.editor.isEditable()) return READ_ONLY;
  const caption = image.caption?.trim() ? image.caption : undefined;
  return runBatch(target, image.stateHash ?? null, [{
    op: "insert_blocks",
    blocks: [{
      type: "image",
      src: image.src,
      alt: image.alt,
      ...(caption === undefined ? {} : { caption, showCaption: true }),
    }],
    ...placementOf(image),
  } as Op]);
}

/** The sentence a refused batch reaches the model as. */
function refusal(error: unknown): string {
  if (error instanceof StaleStateError) {
    return `stale: ${error.message} (the author may be typing — re-run outline).`;
  }
  if (error instanceof OpError) {
    return error.code ? `${error.code}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

/** Every live agent block's full JSON, by block id, to undo the stub. */
function $agentJsonByBlockId(): Map<string, SerializedNode> {
  const found = new Map<string, SerializedNode>();
  const walk = (node: LexicalNode) => {
    if (node.getType() === AGENT_BLOCK_TYPE) {
      const json = node.exportJSON() as unknown as SerializedNode;
      const id = readBlockId(json);
      if (id) found.set(id, json);
      return;
    }
    if ($isElementNode(node)) node.getChildren().forEach(walk);
  };
  walk($getRoot());
  return found;
}

/**
 * Build a node from JSON the reconcile could not keep. A stubbed agent block
 * inside it — a container the batch rewrote around one — gets its real
 * contents back first, so rebuilding a column never empties a session's log.
 */
function $build(
  json: SerializedNode,
  agents: Map<string, SerializedNode>,
): LexicalNode {
  const restore = (node: SerializedNode): SerializedNode => {
    if (node.type === AGENT_BLOCK_TYPE) {
      const full = agents.get(readBlockId(node));
      return full ? structuredClone(full) : node;
    }
    if (!Array.isArray(node.children)) return node;
    return { ...node, children: node.children.map(restore) };
  };
  return $parseSerializedNode(restore(json) as unknown as SerializedLexicalNode);
}

const keyOf = (node: SerializedNode): string => stateHash(node);

/** An element whose own fields — everything but its children — are unchanged. */
const shellOf = (node: SerializedNode): string =>
  stateHash({ ...node, children: undefined });

/**
 * Patch `parent`'s live children from `before` (their JSON, index-aligned) to
 * `after`. Exported for the spec; it is the part with the most ways to be
 * subtly wrong.
 */
export function $reconcile(
  parent: ElementNode,
  before: readonly SerializedNode[],
  after: readonly SerializedNode[],
  build: (json: SerializedNode) => LexicalNode,
): void {
  const live = parent.getChildren();
  if (live.length !== before.length) {
    throw new Error("reconcile: the snapshot does not match the live tree");
  }
  const oldKeys = before.map(keyOf);
  const newKeys = after.map(keyOf);
  const matches = commonSubsequence(oldKeys, newKeys);

  const desired: LexicalNode[] = [];
  const kept = new Set<number>();

  /**
   * Fill the gap old[i0, i1) → new[j0, j1). An element of the same type is
   * reused rather than rebuilt — one with an identical shell first, otherwise
   * any — and given its new shell through `updateFromJSON`, which is how a
   * `set_text` that stamps a block id keeps the author's paragraph node.
   */
  const fillGap = (i0: number, i1: number, j0: number, j1: number) => {
    for (let j = j0; j < j1; j++) {
      const next = after[j];
      let reuse = -1;
      let sameShell = false;
      if (Array.isArray(next.children)) {
        const shell = shellOf(next);
        for (let i = i0; i < i1; i++) {
          const prev = before[i];
          if (
            kept.has(i) || !$isElementNode(live[i]) ||
            prev.type !== next.type || !Array.isArray(prev.children)
          ) continue;
          if (shellOf(prev) === shell) {
            reuse = i;
            sameShell = true;
            break;
          }
          if (reuse === -1) reuse = i;
        }
      }
      if (reuse === -1) {
        desired.push(build(next));
        continue;
      }
      kept.add(reuse);
      const node = live[reuse] as ElementNode;
      if (!sameShell) {
        node.updateFromJSON(
          { ...next, children: undefined } as unknown as Parameters<
            typeof node.updateFromJSON
          >[0],
        );
      }
      $reconcile(node, before[reuse].children ?? [], next.children ?? [], build);
      desired.push(node);
    }
  };

  let i = 0;
  let j = 0;
  for (const [mi, mj] of matches) {
    fillGap(i, mi, j, mj);
    kept.add(mi);
    desired.push(live[mi]);
    i = mi + 1;
    j = mj + 1;
  }
  fillGap(i, live.length, j, after.length);

  // Remove first, keeping the parent even if it empties: an empty root or
  // column is the batch's own result, not something to tidy away.
  live.forEach((node, index) => {
    if (!kept.has(index)) node.remove(true);
  });
  desired.forEach((node, index) => {
    const current = parent.getChildAtIndex(index);
    if (current?.is(node)) return;
    if (current) current.insertBefore(node);
    else parent.append(node);
  });
}

/**
 * Index pairs of a longest common subsequence of two key lists.
 *
 * Prefix and suffix are matched first: a batch touches a few blocks, so the
 * quadratic middle is almost always tiny even in a long post.
 */
export function commonSubsequence(
  a: readonly string[],
  b: readonly string[],
): [number, number][] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  // lengths[x][y]: LCS length of a[start+x..endA) and b[start+y..endB).
  const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      lengths[x][y] = a[start + x] === b[start + y]
        ? lengths[x + 1][y + 1] + 1
        : Math.max(lengths[x + 1][y], lengths[x][y + 1]);
    }
  }

  const pairs: [number, number][] = [];
  for (let k = 0; k < start; k++) pairs.push([k, k]);
  let x = 0;
  let y = 0;
  while (x < n && y < m) {
    if (a[start + x] === b[start + y]) {
      pairs.push([start + x, start + y]);
      x++;
      y++;
    } else if (lengths[x + 1][y] >= lengths[x][y + 1]) x++;
    else y++;
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}
