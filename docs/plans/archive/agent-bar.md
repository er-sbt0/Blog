# The agent in the bar — the post as the session's display

**Status: shipped 21 Nov 2026, all five phases (0–4)** — `b8aefe10` (phase 0's
stale-head fix), `1eb660e8` (the command, the hand-off and the slim node),
`02c54625` (`AgentComposer` in the desktop bar), `df326e3c` (the no-post
picker), then phase 4's docs and this archive. The phase logs are at the end;
§6 records what is still open. The decisions in §2 were taken
interactively on 21 Nov 2026. This plan builds on
[agent-block.md](./agent-block.md), which shipped the day
before. Read that plan's §2–§4 first: almost everything here reuses it, and
this plan only changes where you type and what the block looks like.

**Desktop only**, like the agent block, and read through `src/lib/desktop.ts`.
The web build's bar stays Copilot.

---

## 1. What is being asked

The agent block does three jobs at once:

1. **Input:** a prompt editor inside the block.
2. **Session display:** status, permission cards and the collapsed log.
3. **Output:** the artifacts. Those are already ordinary blocks beside the
   block (agent-block §3.3).

The ask is to split those up. The **bottom bar** (`InlineCopilotBar`) becomes
the input. The **post** shows the session and holds what it produces. You
type once, in one place, everywhere, and the post is still where the work
appears.

The splitting is cheap because the expensive parts of the agent block are
engine-level, not block-level. The SDK session, the permission broker,
`agent-sessions.json`, the cwd dialog, the doc tools and their codecs,
`agentRouter` and one undo step per turn all stay. What changes is mostly the
entry point and the node's UI.

## 2. Decisions

Taken on 21 Nov 2026. Each row lists the alternative that was turned down.

| # | Decision | Declined |
| --- | --- | --- |
| 2.1 | **The bar is the input; the post is the display.** On desktop the bar sends prompts to an agent session whose session node lives in the post. | Keeping the prompt editor in the block. Two composers, and the block's one can never see a selection (§2.9). |
| 2.2 | **The session node is the agent block slimmed down.** It holds the prompts (read-only), the status, permission cards, the collapsed log and the cwd chip. It has no prompt editor. It is still never exported (agent-block §2.5, and CLAUDE.md's fourth invariant). | **The full transcript as ordinary blocks.** Tool output is where credentials and file contents end up. As content they would flow into revisions, `/view`, export bundles and the content bridge, and every revision would grow with the session (`claude-code-notebook.md` §5). |
| 2.3 | **Conversational replies stay in the session node.** Only what the agent writes with a doc tool becomes content. To put an answer into the post, the agent writes it there. | Replies landing as paragraphs (posts fill with chat), or a per-turn toggle (one more control, and the agent can already choose). |
| 2.4 | **On desktop, the agent replaces Copilot in the bar.** The web build keeps Copilot. | A mode switch: two engines behind one box, with two write semantics, so you'd have to know which one is active. Or keeping them separate: the agent would need its own entry point again. |
| 2.5 | **One write rule: live into the visible editor, propose everywhere else.** The doc tools reach only the post holding the session's node, live and undoable per turn, as agent-block §2.3 already allows. Any other write goes through `blog-content` and proposes, which agent-gating already requires. | Proposing in the session's own post. That loses the reason for writing into the live editor (agent-block §3.2). |
| 2.6 | **One current session per post, resumed from the bar.** Sending in a post with a session continues the most recently used one. "New session" in the bar starts another, with its own node. | One session per window, which would write into whichever post you clicked last (the phase-0 bug that `agentRouter` fixed). One session per pane, which breaks when a post moves between panes. |
| 2.7 | **With no post open, the bar asks where to work:** a new post, or an existing post picked from the library. Either way the post opens in a pane, the node goes into it, and the prompt is sent. | Disabling the agent there, or bringing back a `SESSION` document type, which agent-block §2.1 turned down. |
| 2.8 | **Claude only for now; Codex later.** The doc tools stay in the SDK's in-process server (`createSdkMcpServer`, `packages/desktop/src/agent.js`). The constraint for later is to keep SDK-specific event shapes inside `agent.js`, so the renderer only ever sees the existing projection. | Moving the doc tools to a loopback MCP server now. That is the right first step for Codex (§6.6) and pointless work before it. |
| 2.9 | **The bar captures the selection on every turn.** `CopilotChat` already does this through `ActiveEditorContext` and `captureSelection`. That fixes agent-block §14's "selection-first entry" with no floating toolbar. | The floating-toolbar "Ask agent" button that §14 proposed. |
| 2.10 | **`/agent` stays, and now means "new session here".** It inserts an empty session node at the caret and focuses the bar. | Removing it. It is still the only way to choose *where* in a post a session's node and default anchor go. |

### 2.5 deserves a note

This doesn't widen agent-block §2.3's exception. The exception was safe because
the writes are visible as they land, undo in one step per turn, and save like
typing. All of that still holds, because the target is still the editor holding
the node. The bar changes who types the prompt, not where the writes go.

### 2.3 needs a matching system-prompt change

Today the system prompt (`agentProtocol.js`) assumes the agent's text is shown
in the block's log. That's still true, but the agent should be told so
directly: its replies are seen in a collapsed node and never become part of the
post, so anything meant for readers has to be written with a doc tool.

## 3. Shape

```
app (bar)                         editor (the post's)                    main
─────────                         ───────────────────                    ────
AgentComposer ──prompt, sel──▶ SEND_AGENT_PROMPT_COMMAND
  (via ActiveEditorContext)       AgentPlugin: find/insert node
                                  AgentBlockNode runs the turn ──start/send──▶ agent.js
                                  router.attach(sessionId) ◀──doc-tool calls──
  ◀──turn status (subscription)── writes land as sibling blocks
```

The important choice: **the node still owns the session.** The bar doesn't call
`agentHost.start` itself. It dispatches a Lexical command into the active
editor, and the node runs the turn exactly as it does now (`host.start` /
`host.send`, `router.attach`, one undo tag per turn). That leaves every
agent-block invariant where it was. Routing is still per block, and closing the
pane or deleting the node still interrupts the turn. A call whose block is gone
is still refused.

The bar keeps a light view of the turn so it can show **Stop** (and `Esc`) and,
more importantly, **"waiting on you"**. A permission card in a node scrolled out
of view is otherwise a silent stall. "Waiting on you" is the one state the bar
shows loudly, and it jumps to the card. Everything else stays quiet, following
the quiet-UI rule: a running turn is shown in the node, not narrated in the bar.

### 3.1 Where the node goes

- **Continuing a session:** nowhere new. The turn appends to the current node.
- **New session, with a selection or caret:** after the top-level block
  containing the selection.
- **New session, with no caret** (the editor was never focused): at the end of
  the post.
- **`/agent`:** at the caret, as it is today.

The agent's output keeps anchoring after its own node by default
(agent-block §3.3), so deleting the node still leaves the work in place.

## 4. The pieces

### 4.1 Editor: the command, and a slimmer node

- `SEND_AGENT_PROMPT_COMMAND` with `{ prompt, selection, newSession }`, handled
  by `AgentPlugin`. It finds the post's current session node, or inserts one
  (§3.1), and hands the prompt over. The node component isn't mounted when an
  insert happens in an update, so the hand-off uses the same pending-key pattern
  as `focus.ts` (`requestAgentFocus` / `takeAgentFocus`): the plugin queues the
  prompt under the node's key, and the component claims it on mount.
- "Current session" means the node in this post with the most recent turn. That
  is derivable from the nodes themselves, so nothing new is stored.
- `AgentBlockComponent` loses its prompt editor and its draft state, and shows
  the prompts as read-only lines. The run-a-turn path (`AgentBlockComponent.tsx`,
  around the `host.start` / `host.send` calls) is kept and called from the
  hand-off instead of from the textarea.
- **Selection on every turn.** Today only the first turn's `context` is sent
  (`selection: index === 0 ? data.context : null`). From the bar, each turn
  carries its own selection. Only the first is stored on the node, for display.
  Later ones are sent and not kept.
- **Serialized shape unchanged.** Blocks written by the shipped build load as
  they are. Their prompts were already an array. Run `pnpm check:nodes`.

### 4.2 App: the bar on desktop

- On desktop, `InlineCopilotBar` renders an `AgentComposer` instead of
  `CopilotChat`. It reuses `Composer.tsx`'s surface, so the bar looks and sizes
  the same, and adds:
  - a session chip ("session · N turns", or nothing for a post with none) with
    a **New session** action;
  - Stop / `Esc` while a turn runs;
  - the "waiting on you" state, which jumps to the open card.
- There is no thread in the bar. The conversation is the node, so the
  expand-to-50vh transcript is gone on desktop.
- Follow DESIGN.md conventions, including the loading, empty, error and
  disabled states. Disabled covers "no agent host": a shell from before phase 2,
  where `getAgentHost()` returns `null`.

### 4.3 App: the no-post picker (§2.7)

On sending with no post focused, a small dialog offers **New post** or a search
over the library. Whichever is chosen opens in a pane. The prompt and
`newSession: true` are dispatched once that pane's editor is the active one.
Cancelling keeps the draft in the bar.

### 4.4 Main

**No change expected.** `agentIpc.js` checks ownership per window and per
session, and both are unaffected by who typed the prompt. The system-prompt
wording in §2.3 is the one edit, in `agentProtocol.js`.

## 5. Phases

| Phase | What | Done when |
| --- | --- | --- |
| 0 | **One full turn by hand in the shipped build** (`HANDOFF_AGENT_BLOCK.md`, "Never verified"). | A real turn has written into a real post in the running app, and the transcript dialog, the dropped-count row and the permission cards have been seen. This plan builds on that path, so it comes first. |
| 1 | The command, the hand-off and the slim node (§4.1). `/agent` inserts a node and focuses the bar. | A spec on a headless editor: the command inserts or finds the right node, a prompt sent by command starts a session and attaches it to the router, and a second command continues that session. The existing agent specs still pass. |
| 2 | `AgentComposer` in the bar (§4.2): selection capture, the session chip, Stop, "waiting on you". | A turn started from the bar, with a selection, writes after the right block, and a permission card off-screen is reachable from the bar. |
| 3 | The no-post picker (§4.3). | From the home pane, both "new post" and "existing post" end with the node in that post and the turn running. |
| 4 | Docs: CLAUDE.md's agent-block paragraph, the handoff, and this plan archived with its logs. | — |

## 6. Open questions

1. **The Copilot side panel on desktop.** §2.4 covers the bar only. Does the
   right rail's Copilot panel stay on desktop, as the way to reach BYO-key
   models, or go too?
2. **Several sessions in one post.** §2.6 makes the most recent one current.
   Does the chip need to switch between them, or is clicking into an older node
   to make it current enough?
3. **A Stop from the bar mid-tool.** Interrupting is per session today, so this
   should just work. **Still unverified at close:** phase 2 confirmed `Esc`
   stopping a turn parked on a permission card, not one inside a slow
   `plot_graph`. `agentLifecycle.test.ts` covers the renderer half (a slow
   tool whose block goes refuses), but not an interrupt arriving mid-render.
4. **Carried over from agent-block §14, unchanged by this plan:** the bundled
   `claude` binary, the native resume dialog, the post-wide stale-write check,
   and losing the in-progress log on reload. The stale check is no worse: typing
   in the bar isn't typing in the post.
5. **A second post's agent.** With the bar in post A, can a session in post B
   still be running? Yes, each node owns its own. Does the bar show anything
   for it? The quiet-UI answer is no, except "waiting on you", which probably
   should show whichever post it's in. **Built that way in phase 2** — the bar
   finds a waiting card in any post (`agentBar.test.ts`) — **but never seen in
   the app**, because it needs a split pane with a second post's card open.
6. **Codex, when it's wanted (§2.8).** The order would be:
   - move the doc tools to a loopback MCP server in main that relays to the
     renderer as today;
   - normalise both engines' events into the projection the renderer already
     consumes;
   - spike Codex's approval model against the permission cards before designing
     anything shared. `canUseTool` maps cleanly to the cards, and it isn't yet
     known whether Codex's approvals do.
7. **⌘K `document.open` from `/` loses its post in development** (found in
   phase 3). `WorkspacePanes` closes every pane in an unmount cleanup, and
   StrictMode's replayed effects run it as `/edit` mounts, so the opened pane
   is gone on arrival and the saved layout comes back instead. The picker
   sidesteps it through the deep-link entry; the palette's command does not,
   and is not fixed. Development only, since production does not replay
   effects.
8. **The status bar's word count goes stale after an autosave** (found in
   phase 0). It reads the store's `post.data`, which autosave does not
   refresh, so after the agent's first write it said "No content yet" until
   the post was reopened. Cosmetic, not agent-specific, and not fixed.
9. **§2.3's system-prompt edit: done after phase 4.** `agentProtocol.js` now
   says prompts come from the bar, replies live only in the block's collapsed
   log, and anything meant for readers goes in with a doc tool. The selection
   line now says "when the author sent this prompt", since it is sent per turn.

---

## Phase 1 log

Shipped 21 Nov 2026. Only what departs from, or pins down, §4.1:

- **The bar's API lives in `@/editor/plugins/AgentPlugin`.** The package has no
  barrel, so that module re-exports everything phase 2 needs:
  `SEND_AGENT_PROMPT_COMMAND`, `getCurrentAgentSession(editor)`,
  `getAgentTurns` / `subscribeAgentTurns` / `interruptAgentTurn(editor,
  nodeKey)` (from `nodes/AgentBlockNode/turns.ts`), `onAgentBarFocusRequest`
  (from `focus.ts`) and `MAX_AGENT_PROMPT`.
- **"Most recent turn" is remembered in memory, per editor** (`turns.ts`).
  Nothing on the node says when a turn ran, so "derivable from the nodes"
  falls back to document order after a reload: the last node that has run a
  turn, else the last node.
- **The command can refuse, and says so.** `dispatchCommand` answers `false`
  for no host, read mode, an empty or oversized prompt, or a current session
  whose turn is still running — the bar should keep its draft. A start that
  fails *after* the hand-off (the folder dialog cancelled, an IPC error) takes
  the prompt back off the node and shows "Not sent: …" in the node; the bar
  has already let go of it. Phase 2 may want that outcome surfaced too.
- **A new node goes after the top-level block holding the selection's end**,
  not its start, so no block the captured selection names by structural path
  shifts. A node that would be last in the post gets an empty paragraph after
  it, as `$insertNodeToNearestRoot` does for `/agent`.
- **`context` joined the bookkeeping record** (`bookkeeping.ts`). A node
  inserted by `/agent` has no selection; its first turn's is stored, and an
  undo must not take that back.
- **`focus.ts` is now the bar-focus event**, emitted on a microtask after
  `/agent`'s update commits. The pending-key hand-off is `handoff.ts`.
- **The spec mounts the node under jsdom** (`agentBar.test.tsx`) rather than
  using a bare headless editor, because the prompt is claimed by the node's
  component — which is the point of §3's "the node still owns the session".

## Phase 2 log

Shipped 21 Nov 2026. `AgentComposer` (`src/components/CopilotPanel/`) is what
`InlineCopilotBar` renders on desktop. Only what departs from, or pins down,
§4.2:

- **The shared surface is `Composer` itself.** It gained a `tools` slot that
  replaces Copilot's toolbar (attach, `/`, the model picker, voice), plus
  `inputLabel`, `stopLabel` and `editableWhileBusy`. The field stays typeable
  during a turn, so the next prompt can be drafted; Send is replaced by Stop
  until the turn ends. The web bar renders exactly as before.
- **"New session" is a toggle that arms the next send.** It does not send on
  its own. While armed, the chip reads "new session". It is hidden for a post
  with no session, where any send makes one. A node inserted by `/agent`
  reads "session · not started".
- **A send that fails after the hand-off gives the draft back.** That is the
  phase 1 gap. `onAgentPromptReturned` (in `handoff.ts`, exported from
  `AgentPlugin`) fires from the node's `undoPrompt`. The bar restores the
  prompt if it sent that prompt and its field is still empty. A cancelled
  folder dialog restores it quietly. An error also shows "Not sent: …" in the
  bar. The empty node stays where it was inserted and becomes the current
  session, so the retry lands in the same place.
- **Agent updates stole focus from the bar.** This was found in the app. An
  update whose selection is dirty puts the DOM selection back into the
  editor, which focuses it. So the bar's send (the node insert), the node's
  bookkeeping and the agent's own writes each pulled the caret out of the
  bar mid-sentence. `keepFocusTags(editor)` (`focus.ts`) adds
  `SKIP_DOM_SELECTION_TAG` to all three, but only when the editor does not
  already hold focus.
- **The jump to a card.** `EditorTabPanel` marks its root with
  `data-editor-pane` / `data-editor-doc`. `revealAgentNode` uses those to
  focus the pane, activate the tab, scroll the node to centre and focus the
  card's first enabled choice. That choice is "Deny" when the card is
  `defaultToNo`. The scroll runs in a task and is instant. A smooth scroll,
  or anything after `requestAnimationFrame`, stalls in a window that is not
  painting, which an occluded Electron window under CDP was.
- **How the bar knows the focused post's editor** (for phase 3).
  `ActiveEditorContext` is a ref that the focused `EditorTabPanel` publishes
  when its pane takes focus. On a fresh open that happens *before* the post
  loads, while `ref.current` is still `null`, and a ref filling in does not
  re-render. So `useFocusedEditor` takes `selectFocusedDocId` as "a post is
  focused" and polls the ref every 250 ms until a connected editor with
  `AgentBlockNode` appears ("Opening the post…"). After that it follows the
  editor's root listener (unmount) and editable listener (read mode). With no
  focused doc id the bar is disabled with "Open a post to ask the agent". On
  `/posts` the workspace can still hold a focused doc whose editor has
  unmounted. That editor's `null` root reads as "loading", which phase 3's
  picker should treat as "no post".
- **Verified in the app** (`dev:no-sandbox` on a scratch data dir, over
  CDP and AT-SPI):
  - a text selection inside a paragraph, then "New session" and a send. The
    node went after that paragraph, the agent's paragraph after the node, and
    `context` held the selection;
  - cancelling the folder dialog restored the draft;
  - a Write permission card about 800 px above the viewport. The bar showed
    "waiting on you", and one click brought the card to centre with
    "Allow once" focused;
  - `Esc` in the bar stopped that turn, the file was not written, and the bar
    stayed open;
  - `/posts` showed the disabled hint, and `/agent` focused the bar.
  Not verified: the cross-post "waiting on you" (it needs a split pane), and
  open question 3 (Stop during a slow `plot_graph`).

## Phase 3 log

Shipped 21 Nov 2026. `AgentPostPicker` is the dialog; the hand-off after it is
`advancePending` in `agentPick.ts`, a pure step the bar runs on every change
and pinned by `agentPick.test.ts`. Only what departs from, or pins down, §4.3:

- **"No post" is decided by the route, not the store.** The bar reads the
  focused doc id only under `/edit`. Elsewhere the workspace can still name a
  pane nobody can see (the phase 2 caveat, and the home pane too), and that
  now reads as "no post" — Send opens the picker.
- **The picker is the palette's search narrowed to posts:** titles from the
  store, every word matched, most recent first, eight at most. Enter in the
  search takes the first match. **New post** makes an untitled draft
  (unpublished, at the top of the library) the way the sidebar's "+" does, and
  the dialog stays open on it, with its error in the dialog, until the create
  lands.
- **Opening goes through the deep-link entry,** `openPane` and then a push of
  `/edit/<id>`, not `document.open`'s bare `/edit`. Found in the app:
  `WorkspacePanes` closes every pane in an unmount cleanup, and StrictMode's
  replayed effects run that cleanup as the route mounts, so in development a
  pane opened from outside the workspace was gone on arrival and the stored
  layout came back instead. The seam replays an entry after the restore
  whatever came before it. `document.open` from the palette on `/` has the
  same development-only loss; it is not fixed here.
- **The wait does not fail on another post being in front.** On arrival the
  restored layout shows first and the picked post replaces it a beat later.
  Only the picked post's editor, in the focused pane, ready, is sent to; read
  mode fails; anything else waits up to 30 s (`PICK_OPEN_TIMEOUT_MS`), then
  "Not sent: the post did not open in time" with the draft kept. That error
  survives the editor changing under it, which clears every other bar error.
- **After the send the node is scrolled into view,** since it goes at the end
  of a post the author has not looked at yet (§3.1, no caret).
- **The dialog's search takes focus in `onEntered`.** `autoFocus` alone lost
  to the focus trap under StrictMode, which restored the bar's field and then
  focused the dialog's container. The dialog also stops key events at its
  root: React events cross the portal, and Escape would otherwise have
  minimized the bar behind it.
- **Verified in the app** (`dev:no-sandbox` on a scratch data dir, CDP and
  AT-SPI): from `/`, Cancel (and Escape) kept the draft; an existing post that
  was *not* the stored layout's opened, got a new node at its end and ran the
  turn ("Hi!" written after the node); **New post** created "Untitled
  Document", opened it and ran the turn the same way. Not verified in the app:
  the create failure and the timeout, which the spec covers.

## Phase 4 log

Shipped 21 Nov 2026, docs only. CLAUDE.md's agent-block paragraph now
describes the bar as the input and the slim node as the display, with two
invariants added from the logs (the node owns the session; the bar's send can
refuse and keeps its draft). §6 gained items 7–9 and records which of
questions 3 and 5 were never seen in the app. The suite at close: 114 specs,
2036 tests, about 7 s.
