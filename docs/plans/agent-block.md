# `/agent` — a Claude Code session as a block in the post

**Status: proposal, 14 Nov 2026. Nothing is built.** Supersedes
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
   returns its contents.
