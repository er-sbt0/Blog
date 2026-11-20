# `/agent` — a Claude Code session as a block in the post

**Status: phase 2 done (20 Nov 2026); phases 0–2 logged in §7–§9. Phases 3–6
not started.** Supersedes
[claude-code-notebook.md](./claude-code-notebook.md), which stays for its §2.1
(the transcript is already block-shaped) and §5 (the autosave/streaming
conflict) — both still apply here. Its §2.2 ("there is no preload bridge") is
no longer true: `packages/desktop/src/preload.cjs` landed with the in-app
terminal, and this plan adds the third capability to it (§4.3).

**Desktop only**, read through `src/lib/desktop.ts`. The VPS build does not
register the command.

---

## 1. What is being asked

Typing `/agent` in a post inserts an **agent block** at the cursor. You write a
prompt in it; a real Claude Code session runs behind it; and the agent does its
work **in the post** — paragraphs, equations, Excalidraw sketches, GeoGebra
graphs, images — as ordinary blocks, editable afterwards like anything you
wrote. The document is the UI: no terminal is shown, and anything you would
answer in the terminal (a permission prompt, a follow-up) you answer in the
block.

## 2. Decisions

Taken interactively on 14 Nov 2026. Each one lists the alternative that was
turned down.

| # | Decision | Declined |
| --- | --- | --- |
| 2.1 | **An agent block inside the post.** The post is co-written; the session is a part of it, not a separate document. | A dedicated `SESSION` document (the notebook plan) — it would bring back `DocumentType`, which `schema-organization.md` §D removed. |
| 2.2 | **Engine: the Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) in the Electron main process. Typed events, `interrupt()`, a permission callback (`canUseTool`), `resume` by session id, and **in-process custom tools** (`createSdkMcpServer`), so the doc tools need no separate server. | Raw `claude -p --input-format stream-json` (the notebook plan's §4.1: we would reimplement the control channel the SDK already ships); a hidden PTY driven through blog-content MCP (the doc would not really be the UI). |
| 2.3 | **The agent writes directly, anywhere in the post.** No proposal and no review rail. | Always propose (the agent-gating invariant); direct writes only inside the agent's own region. |
| 2.4 | **One session per block.** Follow-ups happen inside that block; a second `/agent` block is a fresh conversation, with the post as shared context. | One session per post. |
| 2.5 | **The block holds the prompt + a collapsible log** (thinking, tool calls, permission decisions). The agent's real output lives as normal blocks in the post. The log is excluded from `/view`, `/embed`, docx and the content bridge's write side. | Output only; the full transcript inline. |
| 2.6 | **Sketches from Mermaid, or from a small shape list.** | Raw Excalidraw JSON (verbose, and models get the coordinates and bindings wrong); SVG stored as an image (not editable as a sketch). |
| 2.7 | **Full Claude Code in a working directory (cwd) chosen per block.** Bash, file edits, web and the user's MCP servers, plus the doc tools. Permission prompts appear as approve/deny cards in the block. | Doc + library + web only; a per-block toggle. |
| 2.8 | **v1 authoring: sketch, math, graph, image**, on top of the codecs that already exist (paragraph, heading, list, quote, code, table, kanban, details, layout, image). | — |
| 2.9 | **Selection-aware context.** The agent starts with the post's outline plus whatever was selected when `/agent` was typed; it reads more through tools. | The whole post every turn; outline + nearby blocks only. |

### 2.3 deserves a note

It is a deliberate exception to `docs/plans/archive/agent-gating.md`, and it is
safe only because of §3.2: writes go into the **live editor**, so they are on
the undo stack, inside autosave and revision history, and visible as they
happen. The gating rule exists for writes an author does not see landing (a
terminal agent writing to Postgres behind a closed tab). The blog-content MCP
tools keep proposing; this surface does not touch them.

## 3. Shape

### 3.1 Processes

```
renderer (post editor)                main process                 claude (SDK child)
──────────────────────               ────────────────              ──────────────────
AgentBlockNode  ──prompt──▶  agent.js: query({ prompt, cwd, resume,
               ◀─events───     canUseTool, mcpServers:{ doc } }) ───▶ runs turn
doc-tool executor ◀─call──   doc MCP server (in-process) ◀──tool_use── 
               ──result──▶                                ──result──▶
```

The main process owns sessions (they survive a renderer reload; quit tears them
down, like `server.js` and `pty.js` do). The **doc tools are defined in main
but executed in the renderer**: a tool call crosses the bridge, the renderer
applies it to the live `LexicalEditor` and returns the result. Main never
writes a document.

### 3.2 Why writes go to the live editor

Writing to Postgres while the post is open would leave two writers, and the
open editor's next autosave would overwrite the agent's work (or the other way
round). The editor as the only writer gives us, without building anything:
merging with the author's own typing, undo, autosave, revisions, the change
feed. It also means the post must be **open** for its agent block to run —
closing the pane interrupts the turn (§6, open question 3).

### 3.3 The block

`AgentBlockNode` — a `DecoratorNode` holding `{ sessionId, cwd, prompt(s),
log, status }`, with `importJSON` delegating to `updateFromJSON`
(`pnpm check:nodes`). It renders:

- the prompt editor (locked once sent; follow-ups append below it),
- live status (thinking / running a tool / waiting on you) and an interrupt
  button (`Esc`),
- permission cards (`canUseTool` → allow once / always for this session / deny),
- the collapsed log, expandable,
- the cwd as a visible chip — the only thing standing between a session and a
  real directory with a shell is the picker, so the block should show what it
  was given (notebook plan §4.7, still true).

**The log is not stored in full.** Tool results are capped and truncated in the
node (say 4 KB each); the complete record is the SDK's own
`~/.claude/projects/…/<sessionId>.jsonl`, which a "full transcript" link can
open in the existing remote-sessions `TranscriptView`. That is the notebook
plan's §5 conflict, answered on the payload side: a long session must not make
every revision megabytes larger.

The agent's output is **not** inside the block. It is siblings, inserted after
the block by default (`insert_blocks` with an anchor of the block's id), so
deleting the agent block leaves the work in place.

## 4. The pieces

### 4.1 Doc tools (the in-process MCP server)

Built on the content bridge rather than beside it, so that block addresses and
codecs mean the same thing here as in blog-content and the Copilot:

| Tool | What it does |
| --- | --- |
| `outline` / `read_blocks` | Same contract as blog-content, run against the live editor state. |
| `apply_ops` | `set_text`, `insert_blocks`, `replace_block`, `delete_block`, `move_block` — the existing op schema (`content-bridge/schema.ts`). |
| `draw_sketch` | `{ mermaid }` **or** `{ shapes: [{ id, kind: rect\|ellipse\|diamond\|text\|arrow, x, y, w, h, label, from, to }] }` → a sketch block. |
| `insert_math` | `{ latex, inline? }`. |
| `plot_graph` | `{ commands: string[] }` (GeoGebra, e.g. `f(x)=sin(x)`) → a graph block. |
| `insert_image` | `{ path }` (a file in cwd — e.g. a plot it just made with matplotlib) or `{ url }`, `alt`, `caption`. |
| `get_selection` | What the author has selected now (it may have changed since the turn started). |

**Live application.** `content-bridge/ops.ts` works on serialized JSON. The
renderer side resolves a block id to a node key (`blockId.ts`), builds the new
node by passing the codec's serialized output to `$parseSerializedNode`, and
splices it in inside one `editor.update`, tagged so all of a turn's writes undo
together (`historic` merge on a per-turn tag). Replacing the whole editor state
is not an option: it resets the author's selection and the undo stack.

### 4.2 New write codecs

Each one comes with a zod arm, a round-trip test and `check:codecs` (see
`docs/plans/archive/claude-code-lexical.md` §4.6.1):

- **math** — the easy one: `MathNode` is a LaTeX value.
- **sketch** — `SketchNode` stores an SVG whose `src` embeds the Excalidraw
  scene (`SketchNode` §"value is now embedded in the src"). So authoring means:
  shapes or mermaid → Excalidraw elements (`convertToExcalidrawElements`,
  `@excalidraw/mermaid-to-excalidraw`) → `exportToSvg` with the scene embedded
  → blob upload. That **has to run in the renderer** (Excalidraw needs a DOM),
  which §3.1 already gives us.
- **graph** — `GraphNode` is `value` (a GeoGebra `.ggb` base64) + an SVG `src`.
  Producing either from commands needs a running GeoGebra applet: a hidden one
  in the renderer, evaluating the commands, then `getBase64` + `exportSVG`.
  **The riskiest piece in v1** (§6).
- **image** — the codec exists. What is new is `{ path }`: main reads the file
  (only inside the block's cwd, through `resolveWithin`), the renderer uploads
  it as a blob, and the node gets `/api/blob/<hash>`.

These codecs make sketch, graph and math writable for **every** agent surface
(blog-content MCP, the Copilot), not only this one. Worth doing on purpose:
`check:codecs` will hold all of them to it anyway.

### 4.3 The bridge

`window.desktop.agent`, the third capability in `preload.cjs`, which has to
argue its own narrowness the way `sessions` did:

- `start({ blockKey, cwd, prompt })` → `sessionId` — **the cwd is chosen in a
  main-process dialog**, not passed from the renderer, so a script in the
  renderer cannot point a bypassed shell at a directory of its choosing. The
  renderer gets back the path to display.
- `send(sessionId, prompt)`, `interrupt(sessionId)`, `answerPermission(id, decision)`.
- `onEvent(sessionId, cb)`, `onToolCall(cb)` / `toolResult(callId, result)`.

There is no general spawn, no argv and no environment. Session ids are minted
in main, and main checks the renderer is the window that owns them.

### 4.4 The slash command

`ComponentPickerPlugin` gets an `Agent` entry, registered only when
`isDesktop()`. Inserting it captures the current selection (§2.9) into the
block's first-turn context, then focuses the prompt.

### 4.5 System prompt

Short and generated: "You are working inside the post *{title}*. The author
types into this document while you work. Your output goes into the post via the
doc tools — prefer them over replying in prose; text you reply with goes into
the log, not the post." Plus the outline and the selection. The post's addresses
come from `outline` so they match what `apply_ops` accepts.

## 5. Phases

0. **Spike.** The SDK in Electron main; a hardcoded prompt; one doc tool
   (`insert_blocks`) executed in the renderer; a paragraph appears in an open
   post. Proves: the SDK bundles under Electron and the packaged AppImage (the
   same class of risk as `node-pty` in in-app-terminal.md §10), and the tool
   round trip over the bridge.
1. **The block and the bridge.** `AgentBlockNode`, `/agent`, cwd picker,
   streaming status, interrupt, follow-ups, `resume` on reopen. Text-only doc
   tools (outline, read, apply_ops).
2. **Permissions.** `canUseTool` → in-block cards; "always" remembered on the
   block.
3. **Math + image** (cheap codecs; `{ path }` images make the agent useful for
   plots straight away).
4. **Sketch** — shapes first, then mermaid.
5. **Graph** — the hidden-applet spike first; if it fails, graph falls back to
   "plot to PNG via a script in cwd + `insert_image`", which the agent can do
   already by phase 3.
6. **Log and lifecycle.** Capped log, jsonl link into `TranscriptView`, one
   undo step per turn, what happens when the pane closes mid-turn.

## 6. Open questions

1. **GeoGebra headless.** Can a hidden applet evaluate commands and export SVG
   and `.ggb` without being on screen? Phase 5 is gated on it.
2. **Concurrent typing.** The author edits block 12 while the agent sends
   `set_text` on block 12. Proposal: the op carries the content hash it read,
   and a mismatch returns "the author changed this block — re-read" to the agent
   (the freshness guard `ops.ts` already has), rather than overwriting.
3. **Closing the pane mid-turn.** Interrupt (proposed), or keep running and
   queue the writes until the post is open again?
4. **SDK auth.** The SDK uses the user's Claude Code login, the same one the
   in-app terminal uses — confirm that, rather than requiring an API key, in
   phase 0.
5. **Is the log visible to blog-content readers?** It is part of the post's
   JSON. Proposal: the codec describes it ("agent session · 6 turns") and never
   returns its contents. *Done in phase 1 (§8).*
6. **Which `claude` binary.** Phase 1 keeps the SDK's own (§7: a 293 MB
   per-platform optional dependency, version-matched to the SDK, roughly
   doubling the installer). The alternative is `pathToClaudeCodeExecutable`
   from the terminal's `resolveClaudeBinary` with the optional dependency
   excluded: one `claude` for both surfaces and a much smaller package, but the
   SDK's control protocol then talks to whatever version the user installed,
   and nothing pins the two together. Decide before the first real
   distribution, with a measured skew test (SDK N against `claude` N±k) rather
   than an argument. `createAgentSession` already takes the option.

## 7. Phase 0 log (14 Nov 2026)

A paragraph written by an Agent SDK session appeared in an open post in the
desktop app (`pnpm desktop:dev` on a scratch `--data-dir`), and autosave stored
it with its `blk_` id. Proven three ways, each cheaper than the last to rerun:
`scripts/spike-agent-sdk.mjs` (SDK + auth + in-process tool, under Node and
under Electron's Node), a throwaway Electron script driving the real
`preload.cjs` and `agentIpc.js` from a page (the IPC round trip), and
`packages/editor/src/utils/__tests__/agentDocTools.test.ts` (the executor on a
real headless editor).

**What was built**, and is meant to be grown rather than replaced:

- `packages/desktop/src/agent.js` — `createAgentSession({ cwd, prompt,
  executeTool, onEvent })`. Defines the `doc` in-process MCP server
  (`createSdkMcpServer`, one tool: `insert_blocks`) and projects the SDK stream
  onto `init` / `assistant` / `result` / `error` / `closed`. No `electron`
  import, so a script can drive it.
- `packages/desktop/src/agentIpc.js` — `installAgent({ workspace, log })`:
  `agent:start`, `agent:interrupt`, `agent:tool-result` handlers; sends
  `agent:event` and `agent:tool-call`. Ids minted in main, every message
  checked against the owning WebContents, a 30 s timeout per tool call. Loads
  the SDK lazily, as `pty.js` loads `node-pty`.
- `window.desktop.agent` in `preload.cjs`: `start({ prompt })`,
  `interrupt(id)`, `onEvent(id, cb)`, `onToolCall(cb)`, `toolResult(callId,
  result)`. `send` and `answerPermission` are phase 1 and 2.
- `packages/editor/src/utils/agentDocTools.ts` — `runAgentDocTool(editor,
  name, input)`: validates with `opSchema`, builds nodes with `blockToNode` +
  `$parseSerializedNode`, stamps fresh ids, splices them in one discrete
  `editor.update` tagged `agent-write`. Resolves `blk_` ids and `bN.M` paths
  against the live tree.
- `src/hooks/useAgentDocTools.ts`, mounted in `AppLayoutContent`, answers
  calls against the focused editor — and holds the spike's temporary trigger,
  `await agentSpike()` in the window's devtools console, marked for deletion.

**Auth (§6 q4): answered — yes, no API key.** The SDK spawns a `claude` binary
and that binary reads the user's own Claude Code credentials
(`~/.claude/.credentials.json`). With no `ANTHROPIC_API_KEY` in the
environment every run reported `apiKeySource: "none"`, which the SDK's types
define as "no API key in use — e.g. claude.ai OAuth login". One caveat for
phase 1 to keep in mind: if `ANTHROPIC_API_KEY` *is* set in the shell's
environment, the child inherits it (the env is the terminal's open one), and
it takes precedence over the login.

**Bundling.** Nothing special, because nothing is bundled: the SDK is a plain
production dependency of `@blog/desktop`, which is how `node-pty` and
`embedded-postgres` already ship (electron-builder copies the package's
production `node_modules` into `resources/app`). Two things that are not
obvious:

- **It brings its own 293 MB `claude`.** The SDK runs a native binary from a
  per-platform optional dependency (`@anthropic-ai/claude-agent-sdk-linux-x64`),
  version-matched to the SDK (0.3.309 runs claude 2.1.309), not the user's
  `~/.local/bin/claude`. That roughly doubles the installer. `verify-package.mjs`
  now asserts the binary is packaged and executable, because an SDK without it
  starts fine and fails on the first prompt. **Phase 1 should decide** between
  shipping it and passing `pathToClaudeCodeExecutable` from
  `resolveClaudeBinary` (the terminal's binary) with the optional dependency
  excluded — smaller, one `claude` for both surfaces, but exposed to version
  skew between the SDK and whatever the user has installed.
- **Peers.** The SDK's peers are zod ^4, `@modelcontextprotocol/sdk` ^1.29 and
  `@anthropic-ai/sdk`; the root is on zod 3, so the desktop package declares
  its own zod 4. pnpm keeps the two apart.

The packaged AppImage itself was **not** rebuilt in this phase (a full
`build:desktop` + `package` is minutes); the verify check is what will catch it.

**What the plan got wrong or left out.**

- **The tool schema cannot be shared as written.** §4.1 says the doc tools are
  "built on the content bridge", and on the renderer side they are — but main
  is plain JavaScript on zod 4 and `content-bridge/schema.ts` is TypeScript on
  zod 3, so main declares a loose `insert_blocks` shape and the renderer
  enforces `opSchema`. The model is told less than it should be (no
  `BLOCK_DOC`). Phase 1: bundle the schema and `BLOCK_DOC` into main with
  esbuild, as `build-mcp.mjs` already does for the MCP server.
- **One id, not two.** The SDK accepts a caller-chosen `sessionId`, so the id
  main mints is also the SDK's session id, `resume`'s argument and the
  `<sessionId>.jsonl` name. §3.3's transcript link and §5's `resume` need no
  mapping table.
- **`onEvent(sessionId, cb)` is filtered in the preload**, on one channel; and
  `onToolCall` is per window, not per session. A tool call therefore goes to
  the *focused* editor in phase 0. Phase 1 must route it to the editor that
  holds the call's block (by `blockKey`/session), or a split view writes into
  the wrong post.
- **Phase 0 is sealed down, deliberately**: `tools: []` (no Bash, no file
  tools), `permissionMode: "dontAsk"`, `settingSources: []` (no user hooks,
  CLAUDE.md or MCP servers). §2.7's full Claude Code comes back with the
  folder picker in phase 1 and the permission cards in phase 2, not before.
  The cwd is the terminal's workspace directory; the picker is not built.
- **Address resolution in a live tree stops at nested editors.** A `bN.M`
  path or `blk_` id inside a sticky, nested doc or canvas resolves to nothing,
  because their blocks are not live children of this editor. Same limit
  `findUnregisterable` exists for; phase 1's `outline` must agree with it.
- **An Electron ESM entry must not `await app.whenReady()` at top level** —
  `ready` never fires. Only met in the throwaway bridge script (`main.js`
  already uses `.then`), but worth knowing before phase 1 writes another one.

## 8. Phase 1 log (15 Nov 2026)

`/agent` in the desktop app inserts a block. You type a prompt, choose a folder,
and a session writes into the post through `outline` / `read_blocks` /
`apply_ops`. Follow-ups resume the same SDK session, including after a restart,
and `Esc` or Stop interrupts it.

**What was built.**

- `packages/editor/src/nodes/AgentBlockNode/` holds the node (`index.tsx`), the
  UI (`AgentBlockComponent.tsx`), and a pure `model.ts`. The model covers the
  stored shape, a tolerant reader, the per-entry (4 KB) and per-block (400
  entry) log caps, the event → log-entry and live-status rules, and the turn
  outcome. `exportDOM` is `{ element: null }`, `getTextContent` is `""`, there
  is no docx arm, and `describeNode` says "agent session · N turns". The
  node is registered in the main config everywhere, so a post with one loads on
  the VPS. It is not in `nestedConfig.tsx`, and `"agent"` joins
  `NESTED_EDITOR_REFUSES` (the containers spec derives that set from the two
  configs). `check:codecs` allowlists it as opaque, with the reason.
- `context/AgentHostContext.tsx` is the injected capability. The editor never
  imports the bridge: `ConnectedEditor` provides an `AgentHost` built by
  `src/lib/agentHost.ts` from `window.desktop.agent`, and the picker offers
  `/agent` only when one is present. That is the whole desktop gate. The VPS,
  a browser and every test have no host. A stored block then renders its record
  read-only and says that sessions run in the desktop app.
- `plugins/AgentPlugin` inserts the block. It stamps a `blk_` id at birth,
  captures `$captureSelection()` before inserting, and hands focus to the
  prompt through `focus.ts`.
- `utils/agentDocTools.ts` (the executor) and `utils/agentRouter.ts` (routing):
  see the deviations below.
- On the main side: `agentProtocol.js` (pure: projection, tool-call
  descriptions, `sanitizeContext`, `buildSystemPrompt`), `agent.js` (one
  `query()` per turn, `resume` from the second on), `agentSessions.js` (main's
  sessionId → folder record in `userData/agent-sessions.json`), and
  `agentIpc.js` (`agent:start` opens the folder dialog, plus `agent:send` and
  `agent:interrupt`). `preload.cjs` gains `send` and copies the turn's prompt
  and context out field by field.
- `scripts/build-agent-schema.mjs` compiles `content-bridge/schema.ts` into the
  gitignored `src/generated/docSchema.mjs`, with zod left external so it
  resolves to this package's zod 4, the SDK's instance. It runs on every
  `pnpm desktop` / `desktop:dev` launch (about 50 ms), after
  `pnpm build:desktop`, and in `stage-resources.mjs`. `verify-package.mjs`
  asserts that the bundle shipped. zod 4 parses the schema unchanged (it was
  checked with real ops, and `toJSONSchema` converts it).
- The phase-0 `agentSpike` trigger and `useAgentDocTools` are deleted.

**Deviations from the plan, and why.**

- **Live application is `applyOps` plus a reconcile, not per-op node surgery.**
  §4.1 sketched resolving each op to a live node. Instead the executor
  snapshots the live tree (`exportJSON` inside the update), runs the content
  bridge's own `applyOps` on it, and patches the live tree towards the result.
  Unchanged children keep their node and key. A same-type element is reused
  and given its new shell by `updateFromJSON`, so a `set_text` keeps the
  author's paragraph node even though it stamps an id. Only what differs is
  rebuilt, through `$parseSerializedNode`. That gives the same contract as
  blog-content by construction: snapshot addressing, the destination guards,
  all-or-nothing, the codecs and the `stateHash` guard (§6 q2) are the same
  code. The guard is coarse: any keystroke anywhere makes the next write stale,
  and the agent re-reads. If real use shows that contention, a per-block hash
  is the refinement §6 q2 first proposed. It has not been needed yet.
- **The agent's own block is stubbed out of the hash.** The snapshot replaces
  each agent block with `{ type, version, $, turns }`. Otherwise its session id
  (written just after `start`) and its log would make every read stale. A write
  may not name an agent block as `id` or `appendTo`. When a rewritten container
  holds one, its real JSON is restored before parsing, so its log survives.
- **Default placement chains.** With no placement, `insert_blocks` goes after
  the session's previous default insert, or after the block on the first call.
  It is spelled internally as `before: <next sibling>` so several inserts in
  one batch keep their order. §4.1 said "after the block", which reverses
  successive inserts.
- **The log is written per turn, not per event.** A turn's entries live in the
  component and land on the node once, at `turn-end`. That write, the prompt
  and the session id/folder are all tagged `historic`, so they are not undo
  steps. The agent's own writes (`agent-write`) are ordinary undo steps.
  Remaining wrinkle, for phase 6: undoing past a turn's end also rolls back
  that turn's log entries, because history snapshots the whole state.
- **Statuses** are thinking / running *tool* / idle, plus the stored outcome
  (done / interrupted / failed). "Waiting on you" belongs to phase 2's
  permission cards.
- **Context.** Through the slash menu the selection is always a collapsed caret,
  because typing "/" replaces a range, and `$captureSelection` answers that
  with `null` on purpose. The block's id in the outline carries the position
  instead. A selection-first entry point (e.g. a floating-toolbar "Ask agent")
  is where §2.9 would pay off, and it is not built.
- **Interrupt is not an error.** After `interrupt()`, SDK 0.3.309 ends the turn
  with an `error_during_execution` result and the iterator throws "Claude Code
  returned an error result". Main suppresses that throw for an interrupted
  turn, and the block logs "Stopped by you." instead of an error.

**Verified.** `tsc`, lint, `check:nodes`, `check:codecs` and `check:theme` all
pass. The full vitest suite passes (101 files, 1799 tests, 5.7 s). New specs:
`agentDocTools.test.ts` (a real headless editor: node keys survive writes,
chained default inserts, stale refusal with the document untouched, the log
never read and never hashed, agent blocks untouchable), `agentRouter.test.ts`,
`nodes/__tests__/agentBlock.test.ts` (round trip through the real registry,
`/view` HTML without the log, the bridge describes but never reads it, the
model), `desktop/__tests__/agentSessions.test.ts`, and an extended
`agent.test.ts`. Three live checks were run:

1. **The real SDK under Electron's Node.** The bundled schema was accepted, the
   model called `apply_ops` with no placement, and a fresh
   `createAgentSession({ resume: true })` remembered the previous turn.
2. **A throwaway Electron script over the real `preload.cjs` and
   `agentIpc.js`**, with the dialog stubbed. It covered start, the tool-call
   round trip and events. After `dispose()` + reinstall (a simulated restart) a
   follow-up resumed from main's record with no second dialog. It also covered
   busy refusal, interrupt, and refusal of malformed and unknown session ids.
3. **`pnpm desktop:dev` on a scratch `--data-dir`, driven over CDP.** `/agent`
   was offered and inserted, the prompt was focused, and Backspace/Enter in the
   textarea did not reach Lexical (`stopLexicalPropagation` from a native
   listener on the card).

The native folder dialog itself, and a full turn writing into a real post in
the app, were not driven: there is no way to answer a GTK dialog from CDP.

**What phase 2 needs to know.**

- **Turning tools on is three lines in `agent.js`:** `tools`, `permissionMode`
  and `settingSources`. They stay sealed until `canUseTool` is wired, so that
  nothing reaches Bash without a card.
- **`canUseTool` is an async callback in main.** It needs a third round trip
  shaped like `agent:tool-call`: an id minted in main, owner-checked, with a
  timeout whose default answer is *deny*, and an `agent:permission` event the
  block renders as a card. "Always for this session" is remembered on the block
  (§5), but the answer has to be enforced in main. The block's copy is display
  only, for the same reason as the folder.
- **The ownership widening, which phase 2 makes real.** A reopened block claims
  its session on first send, so anything that can read the post can resume its
  session in the folder the author chose (`agentIpc.js` says so). With only
  doc tools that is harmless. With a shell, the first resumed turn after a
  restart should probably require a fresh confirmation in the block before any
  non-doc tool is allowed.
- **Statuses:** add "waiting on you" (a pending card) to `AgentLiveStatus`. A
  pending card should probably also pause the 30 s tool timeout's analogue.
- **The SDK binary question** is §6 q6. Phase 2's full Claude Code makes skew
  between SDK and binary more visible (hooks, MCP config, settings), which
  argues for keeping the bundled binary.
- **`ANTHROPIC_API_KEY` in the launching shell** still overrides the user's
  login (§7). That matters more once sessions run real tools under the user's
  account.

## 9. Phase 2 log (20 Nov 2026)

A block's session is now full Claude Code in its folder: Bash, file edits, web,
the user's MCP servers, settings and the folder's CLAUDE.md, plus the doc
tools. Every call that needs permission appears in the block as a card with
three choices: allow once, always for this session, and deny. Nothing reaches
a tool without a card or a grant that main holds.

**What was built.**

- `packages/desktop/src/agentPermissions.js` is pure, with no `electron` and
  no SDK. It holds the broker, `createCanUseTool`, card descriptions and the
  grant rules. Its broker is a third round trip shaped like the tool calls:
  main mints the id, sends the card to the owning window, and accepts an
  answer only from that window, only for a pending id, and only with a
  choice the card offered.
  Every unanswered ending is a **deny**: the 10-minute timeout, an interrupt,
  the window closing, its page navigating away (`did-start-navigation`, main
  frame, not same-document), the SDK cancelling the request, and the app
  quitting.
- `agent.js`: with a `canUseTool`, a turn runs the `claude_code` tool preset
  with `settingSources: ["user", "project", "local"]`, an explicit
  `permissionMode` (`default`, or `acceptEdits` when granted), the session's
  grants as `allowedTools`, and `AskUserQuestion` disallowed. **Without a
  `canUseTool` it is still sealed** exactly as phase 1 was, so a caller
  that forgets the argument (the spike script, for one) gets no shell. `send`
  takes an optional `gate`, which runs inside the turn before `query()`.
- `agentIpc.js`: the broker, `agent:permission-answer`, grants on the session
  entry, the resume gate, and deny-on-interrupt.
- `agentSessions.js` records each session's grants next to its folder.
- `preload.cjs` adds `answerPermission(requestId, decision)` and nothing
  else. The card arrives as a `permission` event on the existing `onEvent`
  stream. `turn()` also copies the block's grant claims, up to 50 strings.
  The comment there argues why this is narrow.
- On the block (`model.ts`, `AgentBlockComponent.tsx`, `styles.css.ts`):
  - The card has three states: pending, answered, and expired (denied
    without an answer). It also has a "Sending…" sub-state, because only
    main's `permission-resolved` closes a card, so a click main ignores
    leaves the card open rather than lying.
  - There is a "Waiting on you" status chip.
  - Grants show as chips with ×.
  - Each card becomes one `permission` log entry at the turn's end.
  - `grants` is stored on the node for display.

**Decisions taken, and why.**

- **"Always" is a Claude Code rule string, derived from the CLI's own
  suggestion.** Examples are `Bash(touch a.txt)`,
  `WebFetch(domain:example.com)`, and `@acceptEdits` for the `setMode`
  suggestion a `Write` gets. If there is no suggestion, or
  `suppressAlwaysAllowRule` is set, "always" is not offered. A bare tool name
  would grant more than the card asked about.
  - The suggestion's destination is rewritten from `localSettings` to
    `session`. Otherwise "always" would write into the folder's
    `.claude/settings.local.json` and outlive the block.
  - `addDirectories` suggestions are dropped: the folder is the picker's
    decision.
  - The button names exactly what it grants.
- **Main enforces grants per turn, because the CLI cannot.** Each turn is its
  own `query()`, so the CLI's session rules die with the turn. This was
  measured: an `updatedPermissions` rule covered the rest of its turn and the
  next turn asked again. Main keeps the grants, persists them, and passes them
  as `allowedTools` each turn, where the CLI's own matcher applies them
  (measured: no card).
  - On every send the block names the grants it still shows, and main keeps
    the **intersection** (`reconcileGrants`). So the × on a chip withdraws a
    grant for good, a grant edited into a revision does nothing, and a
    renderer can never add a grant.
  - When the intersection differs from the claim, main sends a `grants` event
    and the block's copy follows it.
- **The doc tools are no longer in `allowedTools` once `canUseTool` exists.**
  A bare entry there shadows the callback, and the SDK warns about that on
  every turn (`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`). `canUseTool` allows them
  instead, keyed on `mcpServer.source === "sdk"` rather than on the name, so
  a user's configured server that happens to be called `doc` still gets a
  card.
- **A denial never sets `interrupt: true`.** An SDK-side interrupt ends the
  turn with an error result, which the block would show as Failed (measured).
  An expired card instead tells the model to stop, and it does. An Esc or a
  closed window stops the turn by its own path.
- **Session claiming (phase 1's widening) costs a confirmation.** A session
  restored from `agent-sessions.json`, or taken over by a different window,
  runs its next turn only after a "Resume this session in <cwd>?" card is
  allowed. This is the same broker, offered as Resume / Cancel with no
  "always". The confirmation is per entry, so it is asked again after the next
  restart. A declined or unanswered resume leaves the turn unrun, and the block
  records it as Interrupted, not Failed.
- **`ANTHROPIC_API_KEY` is stripped** from the SDK child (`agentEnv` in
  `agentProtocol.js`). The terminal keeps it, and its code says why: a
  terminal must behave like the user's own. This child is the app running
  Claude for the author on their Claude Code login, and a stray key in the
  launching shell would otherwise take precedence and bill another account
  (§7). A user who wants a key can set it through Claude Code's own settings
  (`env`, `apiKeyHelper`), which `settingSources` now loads. Verified: with a
  bogus key in main's environment every turn ran and reported `apiKeySource:
  "none"`.
- **`permissionMode` is passed explicitly.** If it is omitted, the CLI takes
  `defaultMode` from the settings it loads, and a `bypassPermissions` there
  would skip every card.

**What this does not defend against, said plainly.** A card is answered in
the renderer, so a script running there can answer one as easily as it can
type a prompt. The same goes for the resume card. The cards protect the
*author* from actions they did not see. What keeps a script from choosing
where a shell runs is still the native folder dialog. Two consequences
follow:

- The user's and the folder's own settings apply. An allow rule in
  `~/.claude/settings.json`, or in a cloned repo's `.claude/settings.json`,
  allows its calls with no card, and that folder's hooks run. This is what
  §2.7 asked for ("the user's settings"). The CLI's workspace-trust prompt
  does not exist under the SDK, so picking the folder *is* the trust
  decision.
- A stronger resume confirmation would be a native `dialog.showMessageBox`
  from main, which no renderer script can click. It needs no preload surface.
  It was not done because the brief asked for the confirmation in the block.
  It is worth revisiting in phase 6.

**Verified.**

- `tsc`, lint (including `eslint` run directly on the touched `packages/`
  files), `check:nodes`, `check:codecs` and `check:theme` all pass. The full
  vitest suite passes: 103 files, 1826 tests, 6.4 s.
- New specs:
  - `desktop/__tests__/agentPermissions.test.ts`, which covers the broker
    (timeout deny, owner-only answers, "always" only where offered,
    interrupt/close/cancel deny), `canUseTool` (doc tools allowed, a
    same-named configured server asked, the CLI's suggestion as the grant
    with destination `session`, no forged "always") and the grant rules.
  - `desktop/__tests__/agentIpc.test.ts`, which drives `agentIpc.js` over a
    fake `ipcMain` and a fake `agent.js`. It covers the owner check,
    "always" surviving a restart only when the block still claims it, a
    claim main never recorded being ignored, a withdrawn grant staying gone,
    the resume card (offered once per claim, declined, allowed, asked again
    for a new window) and interrupt denying open cards.
  - Card, status and outcome cases added to `nodes/__tests__/agentBlock.test.ts`.
  - `agentEnv` added to `agent.test.ts`.
- Against the real SDK (0.3.309 / claude 2.1.309), with throwaway scripts in
  the session scratchpad driving `agent.js` and `agentPermissions.js` wired as
  `agentIpc.js` wires them:
  - A Bash `touch` reached `canUseTool` as a card.
  - Deny meant no file was created.
  - Allow once created the file.
  - Always recorded `Bash(touch …)` + `@acceptEdits`, and the next turn ran
    without a card.
  - The doc tool ran with no card and no shadowing warning.
  - An unanswered card expired as a deny, with no file and no error event.
  - Interrupting while a card was open denied it, with no file and no error
    event.
  - A declined `gate` produced only `turn-end`, and an allowed one ran the
    turn.
- **Not driven:** the cards in the running desktop app. There is no CDP
  answer to the GTK folder dialog that starts a session (§8), and the IPC half
  is covered by the spec above.

**What phases 3–6 need to know.**

- **Phase 3 (math + image).** `insert_image { path }` is the first doc tool
  that reads the filesystem, and it must read in **main**, not the renderer:
  - Run `resolveWithin(cwd, path)` against the session entry's `cwd` (main's
    record, never the block's), then `realpath` and re-check containment so
    that a symlink in the folder cannot point out of it.
  - Cap the size and sniff the type.
  - Pass bytes (or a data URI) to the renderer, which uploads them as a blob.

  `resolveWithin` lives in `src/lib/safePath.ts` (TypeScript, app side), so
  main needs either a small JS twin with its own spec or an esbuild bundle like
  `build-agent-schema.mjs`. Do not let the renderer name a path.

  Doc tools are auto-allowed by `canUseTool` on `source === "sdk"`, so a new
  doc tool needs no card. Add it to `DOC_TOOLS`, and the router and executor
  will refuse anything else. Note that a file the agent *wrote* with Bash or
  Write and then inserts was already approved on its own card.
- **Phase 6 (lifecycle).**
  - Undoing past a turn's end now also rolls back that turn's `grants`
    write, just as it does the log. The `grants` event re-syncs the block on
    the next send, so this costs a stale chip, never a stale grant.
  - Closing the pane interrupts the turn, which denies its open cards. A
    renderer reload denies them through `did-start-navigation`, but the turn
    itself keeps running with no block attached (its doc calls fail with
    `NOT_OPEN`). Decide whether a reload should interrupt as well.
  - Consider the native resume dialog (above).
- **The SDK binary (§6 q6).** Phase 2 leaned on CLI behaviour that is
  version-sensitive: suggestion shapes, the shadowing warning, the
  interrupt-as-error result, and acceptEdits allowing `touch`. That is
  another argument for keeping the version-matched bundled binary.
- **Suggestions are generous.** For a file-creating Bash command, the CLI
  offers the exact command *and* accept-edits mode, and "always" grants both.
  The button says so. If that proves too broad in use, split it into two
  choices rather than silently dropping one.
