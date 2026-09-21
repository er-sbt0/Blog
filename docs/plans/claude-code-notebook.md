# Claude Code as a Lexical notebook

**Status: proposal. Nothing is built, and one load-bearing claim is unverified.**
The design below is settled — sixteen decisions, each recorded in §4 with the
alternative that was declined — but §4.1 and §4.6 together assert something about
the `claude` CLI's stdio protocol that nobody here has checked. §7's phase 0 is
that check, and it is a gate rather than a first step: if the protocol does not
carry interrupts and mid-session mode changes, §4.1 reopens and §4.2 through
§4.6 are built on an engine that cannot deliver what they promise.

Read §2 first. Three findings there are not opinion, and the second one
("there is no preload bridge") makes §4.2 considerably more expensive than it
looked when it was chosen.

This is a **desktop-only** feature by construction (§3.1). The VPS build cannot
spawn a local process and must not try.

**A sibling plan proposes the opposite answer**, written the same day:
[in-app-terminal.md](./in-app-terminal.md) puts Claude Code in a PTY in the right
rail. It has no equivalent of §7's phase 0 — a PTY *is* the terminal, so the parity
this plan spends sixteen decisions reconstructing costs it nothing — and it pays
§2.2's bridge cost in a narrower shape. Its §5 argues the two are not phases of one
thing and that the terminal is worth building first as evidence about this one.
Neither plan should be read without that section.

---

## 1. What is being asked

A Claude Code session, rendered and driven as a Lexical document.

The framing that matters, and it was not the first one reached for: the document
is **a front end for Claude Code**, not a writing surface with an agent attached
and not a viewer for transcripts. Parity is the design principle. Anything the
terminal shows, the document shows — richer where a document can be richer, and
never less. Anything the terminal accepts, the document accepts.

That inverts the usual question. The test for every decision below is not "is
this convenient" or "does this reuse what exists", it is "does the terminal do
this, and does the document do it at least as well". Several decisions in §4 are
more expensive than the alternative precisely because the cheaper option was a
reduction in fidelity.

The initial framing of this exploration was wrong, and it is worth recording so
it is not re-proposed: the first pass assumed a research session *produces a
post*, and therefore that the document was a drafting surface where agent output
became publishable prose. It is not. The artifact is the session.

## 2. What the tree permits

Three findings, gathered before designing anything.

### 2.1 A session log is already block-shaped

A Claude Code session on disk is `~/.claude/projects/<slugified-cwd>/<sessionId>.jsonl`,
one JSON object per line. Measured across one real session in this repo
(`c33e7717`, 2144 lines):

| Event | Count |
| --- | --- |
| `attachment` | 686 |
| `assistant` → `tool_use` | 198 |
| `user` → `tool_result` | 198 |
| `queue-operation` | 192 |
| `assistant` → `thinking` | 142 |
| `assistant` → `text` | 119 |
| `mode` / `permission-mode` / `last-prompt` | 105 each |
| `system` | 46 |
| `user` → `text` | 23 |
| `file-history-snapshot` | 15 |

Every event carries `uuid` and `parentUuid`, so the log is a tree already, and
`sessionId`, `cwd`, `gitBranch`, `timestamp`, `requestId` and `durationMs` hang
off it. Subagent sessions are written to a sibling `subagents/` directory and
tool results to `tool-results/`.

Two consequences. The mapping from event to block is close to mechanical, which
is why §4.4 can afford to be ambitious. And the `.jsonl` is a complete,
append-only, replayable archive that Claude Code writes whether or not this
feature exists — which matters for §5, because it means the document is never
the only copy.

The counts also set the scale honestly. 198 tool results and 686 attachments is
one session. Whatever §4.8 decides about persistence has to survive that number
multiplied by however many sessions a week.

### 2.2 There is no preload bridge, and the shell is designed around its absence

`packages/desktop/src/main.js:397` creates the window with
`webPreferences: { contextIsolation: true, nodeIntegration: false }` and **no
preload script**. The renderer has no privileged API at all — not a reduced one,
none.

This is not an oversight, and two places in the shell explicitly work around it:

- `pdf.js:129` — the print target is taken from the window's URL, because "the
  shell cannot see the pane tree — that is renderer state behind
  `contextIsolation` with no preload bridge".
- `menu.js:64` — "New post" is a navigation to `/new` rather than a command
  dispatch, because "the shell has no way to reach the command registry".

So §4.2's choice of main-process ownership with IPC delivery means **introducing
the first privileged renderer API this application has ever had**. That is a
security surface, not a wiring detail: a bridge that can stream a subprocess's
output into the page is a bridge, and everything it exposes is reachable by any
script the renderer loads — including, note, the stored SVG that
`archive/desktop-app.md` §15.5 already flags as a reason the AppImage running
`--no-sandbox` is a defence-in-depth regression.

The alternative (§4.2) reuses `/api/events` and `useChangeFeed`, which exist and
need no new surface. It was declined, and §4.2 records why.

### 2.3 What is already a seam

Six things this design would otherwise have to build:

- **Node infrastructure.** 18 node classes under `packages/editor/src/nodes/`,
  with `pnpm check:nodes` statically enforcing that every one delegates
  `importJSON` to `updateFromJSON`, and `check:codecs` enforcing that a codec
  and a zod schema arm arrive together. §4.4 adds ~15 more and pays this tax
  fifteen times.
- **`NestedDocNode`** and the content bridge's descent into nested editors
  (`nested-editor-support.md`, shipped 27 Aug 2026). §4.5 is a consumer of work
  that already landed for another reason.
- **The SSE change feed** — `src/app/api/events/route.ts`, `src/lib/changes/`,
  `useChangeFeed.ts`. Declined by §4.2, but it is what the alternative would be.
- **The ⌘K command registry** (`src/commands/`), which §4.6's slash menu would
  host alongside app commands. Note `types.ts` has no shortcut field — the same
  gap `archive/desktop-app.md` §16.1 had to sweep handlers to work around.
- **Panes and a tab strip** (`src/components/EditDocument/`), so concurrent
  sessions have somewhere to live without new layout work.
- **Process supervision.** `packages/desktop/src/server.js:392` already spawns,
  supervises, health-gates and tears down a long-lived child. A second child is
  the same shape.

## 3. The shape

### 3.1 Process model

The Electron main process spawns `claude` per session, supervises it alongside
the Postgres cluster and the Next server, and forwards its event stream to the
renderer over a preload bridge (§2.2, §4.2). The renderer merges two sources:
session events arriving over IPC, and the document itself, which is an ordinary
`Document` row read and written through the existing Next API routes.

That split is deliberate and worth naming, because it means writes and events
travel opposite paths — the document persists renderer → Next → Postgres while
events arrive main → renderer. Nothing reconciles them; the event stream is the
input to the document, never a second writer of it.

**Desktop only.** Spawning `claude` needs a local binary and a local
`~/.claude`. The VPS build has neither and must not pretend to — the same line
`src/lib/desktop.ts` already draws for PDF export and for `/api/mcp` answering
404. Read it through that module; do not infer it from some other setting being
absent.

### 3.2 The document

A session is a `Document` with a new `type` of `SESSION` (§4.8). Its blocks are
the session: prose in text nodes, reasoning in collapsible blocks, tool calls in
bespoke nodes (§4.4), subagents as nested documents (§4.5). The foot of the
document is a live prompt block carrying the terminal's full input surface
(§4.6).

Sent prompts lock. Reopening a session document shows the transcript; resuming
is an explicit act (§4.7).

## 4. The decisions

Sixteen, each with the alternative declined. Where a decision costs more than
its alternative, the reason is parity (§1).

### 4.1 Engine — the `claude` CLI on raw stdio

`claude` spawned headless with `--output-format stream-json --input-format
stream-json`, driven directly. **Declined: the TypeScript Agent SDK**, which
spawns the same binary but wraps it in a typed control channel with interrupt,
mode-change and model-change as method calls.

The case for the SDK was that it is not a different engine — same subprocess,
same fidelity — and that it surfaces exactly the operations §4.6 needs without
protocol archaeology. The case against, and the one taken: nothing sits between
this app and the protocol, there is no dependency tracking Claude Code's release
cadence, and anything the SDK does not expose stays reachable.

**This decision is what phase 0 tests.** If raw stdio cannot express an
interrupt, §4.6 is not deliverable on it and this section reopens.

### 4.2 Transport — main process, IPC to the renderer

The main process owns the child; a preload bridge delivers events. **Declined:
the Next server child spawning it and serving events over SSE**, reusing
`/api/events` and `useChangeFeed` wholesale.

The SSE route needs no new privileged surface (§2.2), keeps renderer code
ordinary web code, and would work against a trusted local server outside
Electron. It was declined for lifecycle: a session owned by the main process
survives a renderer reload, and the main process is already the thing that
supervises long-lived children and cleans up on quit.

The cost is §2.2's cost, and it should be designed for rather than absorbed. The
bridge should expose the narrowest possible API — subscribe to a session id,
send a prompt, interrupt — and specifically not a general "spawn" or
"send arbitrary stdin" capability.

### 4.3 Streaming — into real nodes, live

Events land in Lexical nodes as they arrive. Prose streams into text nodes; tool
nodes appear pending and fill in when their result lands. **Declined: a live
React region below the document, committed as blocks at turn end**, which would
give Lexical one transaction per turn.

The declined option is materially safer — reconciliation cost bounded, undo
history sane, no selection movement under a cursor the user is typing at. It was
declined because the seam is visible in exactly the moment that matters: the
document would not *be* the session during the turn, only after it. Parity (§1)
says the document is the session.

Three risks this takes on, all of which phase 3 owns:

- **Reconciliation cost** at 200 tool calls and hundreds of text updates.
- **Selection.** The user may be typing in the prompt block while nodes are
  inserted above it. Lexical must not move their cursor.
- **Undo.** A token-sized step per update makes ⌘Z useless. Updates need
  coalescing, and agent-authored updates arguably should not enter the undo
  stack at all.

### 4.4 Tool rendering — bespoke, per tool

A node class per tool: `Edit` a real diff, `Bash` a terminal card, `TodoWrite` a
live checklist, `Read` a syntax-highlighted file card, `WebFetch` a link card,
and so on, with a schema-driven fallback for MCP tools and anything unrecognised.
**Declined: one generic collapsible `ToolCallNode` for everything**, and
**declined: composing from existing nodes only** (`DetailsNode` + `CodeNode` +
Kanban), which would add no new classes and work with the content bridge on day
one.

Both declined options are the terminal's rendering with rounder corners. The
premise of this plan is that a document can do better, and `TodoWrite` is the
clearest case: a todo list is something a terminal renders badly and a document
renders natively.

The cost is ~15 new node classes against 18 existing (§2.3), each owing an
`importJSON` that delegates to `updateFromJSON`, a codec, a matching zod arm, a
serialization test, and `--ed-*` tokens only. Three check scripts enforce this
and will fail the build rather than let a class ship half-done. Phase 5 does
these one at a time with the generic fallback always present, so the feature is
never blocked on the fifteenth.

**These nodes should be describe-only to the content bridge**, the way `sketch`
and `graph` already are. An agent editing the rendered record of what an agent
did is not a capability anyone asked for.

### 4.5 Subagents — nested documents

A `Task` call renders as an embedded sub-document, expandable in place, using
`NestedDocNode` and the content bridge's existing descent (§2.3). **Declined: a
collapsed summary that opens the sub-session in its own pane**, and **declined:
the final report only**, which is all the parent agent's own context contains.

Recursion in place is the single thing this design can show that a terminal
cannot. The risk is readability when several subagents run in parallel, which is
a rendering problem (collapse by default) rather than a model problem.

### 4.6 Input parity — full

`/` in a prompt block opens a command menu hosting CLI commands alongside the
app's own ⌘K registry. `@` opens a file picker. ESC interrupts the running turn.
Queued prompts stack visibly below the cursor — note §2.1 counted 192
`queue-operation` events in one session, so this is not an edge case. Mode is a
control in the document's header.

**Declined: prompt, interrupt and queue only**, with slashes passed through as
raw text for the CLI to interpret. That is ~80% of daily use for none of the
menu work, and it was declined because "never open the terminal again" is the
goal and discoverability is a thing a document should be good at.

This section is the one that depends on §4.1's unverified claim.

### 4.7 Permissions, cwd, and lifecycle

**Permissions bypassed**, in a directory **picked per session** by the user and
remembered on the document. **Declined: a per-session scratch directory** under
`userData`, which would bound the blast radius of a bypass to a throwaway folder
and reach the library through the blog-content MCP server instead of the
filesystem.

The consequence to design for, stated plainly because nothing downstream will
restate it: the picker is the only thing standing between a session and a real
directory with permissions bypassed. It should say what it is about to hand
over, and the choice should be visible on the document afterwards rather than
buried in its metadata.

**Prompts are immutable once sent.** Editing a sent prompt is disallowed; you
add a new one at the foot, which is what you would do in a terminal. **Declined:
forking the session from an edited prompt**, and **declined: rewinding in place
and truncating** — both need mid-session resume semantics that §4.1's protocol
may not expose, and both let the document disagree with what was actually asked.

**Reopening shows the transcript; resuming is explicit.** **Declined: reopening
always resumes**, which would spawn an agent every time a document is opened to
be reread, and **declined: one live session at a time**, which forecloses the
parallel workflow a paned workspace invites.

### 4.8 Persistence

A `Document` with a new `DocumentType` of `SESSION`, filtered out of post
listings by type. **Declined: a reserved Project**, reusing the existing
Project → Series → Post hierarchy for zero new concepts, and **declined: a
separate sidebar rail**.

The type is the structurally honest answer — a session is not a post — at the
cost of touching every listing query. Note `schema-organization.md` §D removed
`Document.type` and the `DocumentType` enum on 31 Aug 2026; this reintroduces
both, and phase 2 should read that section before writing the migration rather
than rediscovering why it went.

**Tool payloads are stored inline**, in the document's Lexical JSON. **Declined:
out-of-line by reference into the `.jsonl`**, and **declined: content-addressed
into the existing blob store**, which would dedupe across sessions and reuse
`blobHashes` and `reconcileDocumentBlobs` unchanged.

**Standard autosave and revisions.** **Declined: no revision history**, on the
reasoning that the `.jsonl` (§2.1) is already a complete archive so the document
needs no second one.

These last two decisions interact badly with §4.3, which is §5.

**Agent access to session documents is deferred to phase 7.** Session documents
are `Document` rows, so `list_posts`, `search` and `read_post` would reach them
by default and Claude Code could read its own transcripts. That is either useful
("what did we decide last week") or a context-window flood — one session is
larger than most posts — and it should be judged against real sessions rather
than in advance.

## 5. The conflict this plan has to resolve

§4.3 (true streaming), §4.8 (standard autosave and revisions) and §4.8 (inline
payloads) do not compose.

Streaming means the document mutates continuously. Standard autosave means it
persists continuously. Inline payloads mean every persist carries every tool
result in the session so far, again. A long session does not write one revision
per turn — it writes one every few seconds, each larger than the last, and the
growth is quadratic in turn count. This is the exact pathology `blob-storage.md`
was written to eliminate (13.6 MB across 141 copies), arrived at from a
different direction.

The revision decision was taken when "commit at turn end" was still an option
for §4.3. It no longer is, and the cost went up by orders of magnitude.

**None of the three decisions has to change.** The resolution is a constraint
inside them: **session documents debounce autosave to turn boundaries.**
Streaming stays true and in-memory at full fidelity; revisions stay standard;
payloads stay inline. Only the moment of persistence moves — from mid-token to
when the agent stops.

This is recorded as a constraint rather than a decision because it is the
minimum that makes the three chosen decisions survivable together. If it turns
out to be insufficient at real session scale, the next thing to give is inline
payloads, not streaming.

## 6. What this plan has not verified

- **That raw stdio carries interrupts and mid-session mode changes** (§4.1,
  §4.6). Phase 0. Everything else is built on the answer.
- **What true streaming costs at real scale** (§4.3). A 2144-event session
  replayed at speed is the measurement, and it should be taken before phase 5
  adds fifteen node classes to reconcile.
- **Whether `DocumentType` can be reintroduced cheaply** (§4.8).
  `schema-organization.md` §D removed it deliberately; the cost of putting it
  back has not been counted.
- **What any of it looks like.** Consistent with every phase of
  `desktop-app.md`, this session's compositor refuses screenshots.
- **Whether the preload bridge can be kept narrow** (§2.2, §4.2). Asserted in
  §4.2, not designed.

## 7. Phases

**0. Protocol spike.** Drive a real session on raw stdio. Send a prompt.
Interrupt mid-turn. Switch mode. Queue a prompt while one runs. This is a gate:
if it fails, §4.1 reopens before anything is built on it.

**1. Process and transport.** Main spawns and supervises `claude`; the preload
bridge exists and is narrow; the renderer receives a typed event stream. No
rendering — the proof is that a session runs and events arrive.

**2. Event to block.** Text, thinking, and one generic tool node. The document
is a real `Document` with `type: SESSION`. A live session renders, read-only.

**3. True streaming.** Live nodes, selection preservation under the user's
cursor, undo coalescing, and §5's autosave constraint. The measurement phase.

**4. Input parity.** Prompt block, slash menu over the ⌘K registry, `@` picker,
interrupt, queued prompts, mode control.

**5. Bespoke tool nodes.** ~15 classes, one at a time, generic fallback always
present. Each pays §2.3's tax.

**6. Subagents as nested documents.**

**7. Lifecycle.** Resume on demand, concurrent sessions, crash and quit
behaviour. Plus the deferred decision from §4.8 on agent access.

## 8. Out of scope

- **Coding sessions on arbitrary repositories.** The scope taken was research
  and thinking sessions. Nothing here forecloses it — `cwd` is already a
  per-session parameter (§4.7) — but the workflows a coding session wants
  (checkpoints, file trees, test output) are not designed for.
- **The web build.** §3.1.
- **Replacing the Copilot.** `src/components/CopilotPanel/` stays as it is. The
  two surfaces overlap and one may eventually subsume the other; this plan does
  not assume it.
- **Sessions started in the terminal.** The `.jsonl` format is identical
  (§2.1), so rendering a terminal-started session is nearly free — but §4.7's
  lifecycle assumes this app spawned the child, and reconciling that is a
  separate question.

## 9. Open questions

1. **Does the stdio protocol carry interrupts?** Phase 0. §4.1.
2. **Can the preload bridge stay narrow enough to be worth §2.2's cost?** §4.2.
3. **Is §5's turn-boundary debounce sufficient at real session scale?** If not,
   inline payloads (§4.8) is the next thing to give.
4. **Should session documents be visible to the content-bridge tools?**
   Deferred to phase 7 on purpose. §4.8.
5. **What happens to a session document when the app quits mid-turn?** The
   `.jsonl` survives; the document's last persisted state may be a turn behind.
   Phase 7.
