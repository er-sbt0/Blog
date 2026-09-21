# A terminal in the right rail

**Status: all four phases shipped, 21 Sep 2026.** Claude Code runs in a PTY in
the right rail on `Mod+5`, against the desktop library through a generated
`.mcp.json`. The design below is as it was proposed — eight decisions, each
recorded in §4 with the alternative declined — and §10 is the phase log, which
is the useful part: it records the five things this plan got wrong. Both
unknowns it named resolved in its favour (`node-pty` packages, the MCP server
bundles), and the three that cost real work were ones it had not thought of.

**What is not verified is what it looks like** (§6.6), for the same reason
`desktop-app.md` records across all seven of its phases: this session's
compositor refuses screenshots. §2.3's column arithmetic is therefore still
arithmetic.

Read §2 first, and then §5. §2's second finding — that the MCP server named in
`.mcp.json` cannot run inside a packaged build — is the one that turns "point
Claude Code at the library" from a config line into a build step. §5 is the
relationship to `claude-code-notebook.md`, which is proposing a different answer
to the same want and was written the same day; neither plan should be read
without the other.

This is a **desktop-only** feature by construction (§3). The VPS build cannot
spawn a local process and must not try.

---

## 1. What is being asked

Claude Code, running inside the desktop app, against the posts in the desktop
app's library.

Not a general terminal. The thing wanted is the agent, and a terminal is the
cheapest correct way to have it: Claude Code's whole interface — permission
prompts, `/` commands, plan mode, ESC to interrupt, the queue — is a TUI, and a
PTY renders a TUI exactly. Anything narrower than a PTY is a reimplementation of
that interface, which is what `claude-code-notebook.md` is and why it is a much
larger plan.

So the test for the decisions in §4 is not fidelity — fidelity is free here —
but **surface**: what this adds to the shell that was not there before, and
whether each addition is the narrowest one that works. The answer to the first
is one preload bridge, and that is a real cost (§2.1).

## 2. What the tree permits

Four findings, gathered before designing anything. The first is shared with
`claude-code-notebook.md` §2.2 and is restated rather than cross-referenced,
because it is load-bearing for both and either plan may be the one that pays it.

### 2.1 There is no preload bridge, and the shell is designed around its absence

`packages/desktop/src/main.js:397` creates the window with
`webPreferences: { contextIsolation: true, nodeIntegration: false }` and **no
preload script**. The renderer has no privileged API at all — not a reduced one,
none. Two places in the shell are written around that absence and say so:
`pdf.js:129` (the print target comes from the window's URL, because the shell
cannot see the pane tree) and `menu.js:64` ("New post" navigates to `/new`
rather than dispatching a command, because the shell cannot reach the command
registry).

So this plan introduces **the first privileged renderer API this application has
ever had**. That is a security surface rather than a wiring detail, and it is
sharpened by something `desktop-app.md` §15.5 already flags: the AppImage runs
`--no-sandbox` because electron-builder's own `.desktop` template ships it
unconditionally, and the renderer displays stored SVG. A bridge is reachable by
any script the renderer loads.

Two things make the bridge this plan needs narrower than the general case, and
both are §4's doing rather than luck. The child's argv is fixed in the main
process (§4.1), so the bridge exposes no "spawn"; and the session is created by
the main process at window creation, so the renderer's whole vocabulary is
*write these bytes to the session that exists*, *resize it*, *subscribe*,
*restart it*. There is no session id to guess and no command to inject.

That is still a bridge that streams bytes to a subprocess with the user's
privileges. The honest statement of the cost is that after this lands, adding
the next capability to the bridge is an argument about that capability rather
than an argument about whether the shell has a bridge at all.

### 2.2 The MCP server named in `.mcp.json` cannot run in a packaged build

This is the finding that has real work attached to it.

`.mcp.json` today is:

```json
{ "mcpServers": { "blog-content": {
  "command": "node",
  "args": ["--import", "tsx", "--env-file=.env", "mcp/content-server.ts"] } } }
```

and `mcp/content-server.ts` imports `@/lib/mcp/server` and
`@/repositories/user` — TypeScript, through the `@/*` alias, against `src/`.
A packaged desktop build ships **neither `src/` nor `tsx`**:
`electron-builder.yml`'s `files` is `package.json` plus `src/**/*` *of the
desktop package*, and `extraResources` is `.stage`, which
`scripts/stage-resources.mjs` fills with the Next standalone bundle, `public/`,
`prisma/` and the Prisma CLI. Nothing in that set can execute
`content-server.ts`.

This is the same rule `ops/README.md` states for the production containers —
"nothing in `prisma/scripts/` can run in the `app` container", for exactly this
reason — arriving in a second place. It is worth naming as a general property of
this repository rather than as a fact about one file: **anything that imports
from `src/` runs only where the repository is, and neither the `app` container
nor the desktop package is that.**

The fix has a precedent in the same package. `server.js:483` spawns the Next
child as `spawn(process.execPath, [entry, ...args])` with
`ELECTRON_RUN_AS_NODE: "1"` in its environment (`server.js:398`), so a packaged
build carries no second Node runtime — Electron's own is the Node. The MCP
server can be spawned the same way, provided something in the bundle is a plain
`.mjs` it can be handed. So §4.4 adds a build step: esbuild `content-server.ts`
into `.stage/mcp/content-server.mjs`, with `@prisma/client` left external and
resolved against the standalone bundle's own copy.

`asar: false` — a decision `electron-builder.yml` documents at length for
`embedded-postgres`'s binaries — makes this considerably easier than it would
otherwise be. Every staged file is a real file at a real path, which is what
both the generated config and `verify-package.mjs` need.

### 2.3 The rail is 520px at its widest, and that is about 62 columns

`src/contexts/LayoutModeContext.tsx:39` configures the right panel as
`{ defaultWidth: 280, minWidth: 180, maxWidth: 520 }`, with a 54px compact strip
beside it (`RAIL_COMPACT_W`). One triple, shared by all four views.

At a 13px monospace with a 0.6em advance, 520px is about 66 columns and the
280px default is about 36. **This is arithmetic, not measurement** — it depends
on the font xterm actually resolves — but the shape of the answer does not: the
rail's current maximum is at the bottom edge of what Claude Code's TUI is usable
in, and its default is well below it.

The configuration is already per-panel, so the answer is a triple of its own for
the terminal view rather than a wider rail for outline and properties too. What
the right maximum is, is a question for phase 2 with the real font in front of
it.

### 2.4 A packaged app's environment is not a shell's

`server.js:51` passes six variables through to the Next child —
`PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `TZ` — and blanks everything the
traced `.env` could otherwise supply. That closed environment is correct for
that child and is **not** the policy for this one: `claude` needs the
user's real environment to find its own configuration, and a PTY with a
synthetic environment is a terminal that behaves unlike the user's terminal,
which is the one thing a terminal may not do.

Two hazards follow, and neither announces itself:

- **`ELECTRON_RUN_AS_NODE` must not leak into the PTY.** It is set in the main
  process's spawn environments, and a shell that inherits it turns every `node`
  and every `electron` the user runs into something subtly other than itself.
  Delete it explicitly rather than relying on it not being on `process.env`.
- **A packaged app launched from a `.desktop` file may have a minimal `PATH`.**
  It is the session's, not a login shell's, so `~/.local/bin` — where the
  `claude` installer puts the binary — may simply not be on it. That is §4.5's
  whole reason for existing, and it is the most likely way this feature fails
  for someone on first launch.

### 2.5 What is already a seam

Five things this design does not have to build:

- **The rail view switcher.** `RightRail/panelState.ts` holds `VIEW_IDS`, the
  derived open state and `sanitizePanelView`; adding a fifth view is an entry in
  an array plus a component. `Mod+1..4` is bound at `RightRail/index.tsx:91`.
- **Process supervision.** `server.js` already spawns, supervises, health-gates
  and tears down a long-lived child, and `main.js` already orders shutdown
  (server before cluster). A third child is the same shape.
- **The accelerator audit.** `menuTemplate.js:46`'s `APP_SHORTCUTS` is a
  hand-built inventory of every chord the web app listens for, with a spec that
  fails if the menu shadows one. It is the existing answer to §4.8's question
  and needs entries rather than a mechanism.
- **The packaging gate.** `scripts/verify-package.mjs` already proves things
  about the built artifact by hand, and `desktop-app.md` §15.2's `afterPack`
  scan already reads every packaged file. Both are extensible to §4.4's bundle.
- **`asar: false`** (§2.2).

## 3. The shape

```
renderer (desktop bundle only)          main process
┌──────────────────────────┐            ┌────────────────────────────┐
│ RightRail view "terminal"│            │ pty.js   node-pty          │
│   <TerminalView/>        │            │   └─ claude (fixed argv)   │
│   xterm.js + fit addon   │            │        cwd: <userData>/    │
│        │                 │            │              workspace     │
│  window.desktop.terminal │◀──IPC────▶ │ mcpConfig.js               │
│    .{write,resize,       │  preload   │   writes .mcp.json there   │
│      onData,onExit,      │            │                            │
│      restart}            │            │ server.js  (Next child)    │
└──────────────────────────┘            │ cluster.js (Postgres)      │
                                        └────────────────────────────┘
                                                   │ stdio MCP
                                        content-server.mjs ──▶ cluster
```

Four new files in the shell (`preload.js`, `pty.js`, `mcpConfig.js`, and a
`terminal.js` for binary resolution), one new rail view in the app, one new
build step.

**Desktop only, at build time rather than at runtime.** The view must not exist
in the VPS bundle — not be present and hidden — which means gating on
`NEXT_PUBLIC_DESKTOP` through `src/lib/desktop.ts`, the line that module exists
to draw. `desktop-app.md` §5 is emphatic that this is gated on the flag and
never inferred from some other setting being absent, and the reason applies
exactly here: "no preload bridge is present" is a condition a *broken desktop
build* also satisfies.

## 4. The decisions

Eight, each with the alternative declined.

### 4.1 Surface — a PTY locked to `claude`, not a shell

The child is `claude` with fixed argv, assembled in the main process. There is
no shell prompt underneath it and no way to run anything else; when it exits,
the view offers to start it again.

**Declined: a full terminal running `$SHELL`**, which is more useful and is what
"a terminal in the app" usually means. It was declined on surface. A shell in
the rail is arbitrary local code execution reachable from the renderer, and the
bridge in §2.1 stops being narrow the moment the renderer can choose what runs.
Locking the argv is what lets the bridge expose no `spawn`, and that is the
single largest reduction available in this design.

**Declined: headless `claude -p --output-format stream-json` rendered in the
Copilot panel**, which needs no native module and no bridge at all. It was
declined because it is not Claude Code — it is a chat client that shells out to
it. No permission prompts, no `/` commands, no plan mode, no queue. The cheapest
option here is cheap because it drops the thing being asked for.

**Declined: a menu item that opens the system terminal emulator.** Half a day,
no new architecture, and nothing is inside the app. Worth keeping as the
fallback if phase 1 finds `node-pty` unworkable.

### 4.2 Transport — `node-pty` in main, over a preload bridge

The main process owns the PTY; a `contextBridge` API delivers output and accepts
input.

**Declined: a loopback WebSocket PTY server**, spawned by main on `127.0.0.1`
with a random port and a per-launch token injected into the page URL. It is
genuinely attractive: it needs no preload at all, so §2.1's cost is not paid,
and the same renderer code would work in `pnpm desktop:dev` and in a plain
browser tab.

It was declined on two counts. The token has to reach the renderer somehow, and
every way of doing that (query string, `localStorage` seeded by the server,
a header the page cannot set) is a credential in the page — which is the same
exposure as a bridge, with a listening socket added. And a loopback listener is
reachable by every process on the machine, whereas an IPC channel is reachable
only by the renderer. Paying §2.1's cost once, narrowly, is better than routing
around it into something broader wearing a smaller name.

**Declined: a WebSocket-upgrade route in the Next server**, gated on `DESKTOP`.
It reuses the session cookie for authentication and adds no process. It was
declined because it puts a remote-shell code path in the tree that deploys to
the VPS, where one gating mistake is total compromise. `desktop-app.md` §14.2
already moved in the opposite direction — `/api/mcp` answers 404 from
`route()`'s token mode *before* the header is read — and this would be the
first thing to push back the other way.

The cost of this decision is a native module: `node-pty`, rebuilt against
Electron 44's ABI, which is the first native dependency in `packages/desktop`
other than `embedded-postgres`. `asar: false` removes the `asarUnpack` problem
entirely. Phase 1 exists to find out what is left.

### 4.3 Placement — the right rail, as a fifth view on `Mod+5`

`terminal` joins `VIEW_IDS` after `revisions`, with its own width triple (§2.3).

**Declined: a bottom drawer**, VS Code style, which is what an IDE does and what
`archive/ide-redesign.md` was converging toward. It gives the TUI full window
width, which §2.3 says is the thing in shortest supply. It was declined because
it is a new layout region — `AppLayoutContent` computes a grid from a sidebar
width and a rail width, and a third resizable edge is real work in a file that
is load-bearing for every screen — and because it competes with the editor for
vertical space, which is what the editor is for.

**Declined: a workspace pane type.** `WorkspacePane` is defined as rooted at a
document (`docId`), and the one-document-one-pane invariant in
`store/__tests__/workspace.test.ts` assumes it. A pane that holds no document
means reopening that invariant, the URL projection, the restore path and the tab
strip, to put a terminal where a post goes.

**Declined: a separate window.** Full width, no geometry fight, and its own
window-state plumbing — `windowState.js` currently persists one rectangle. It
loses the thing the feature is for: the agent beside the post it is editing.

The rail's cost is stated plainly rather than assumed away: it is the narrowest
of the four options, and §2.3 is the open question it creates.

### 4.4 Content access — a generated `.mcp.json`, and a server to name in it

At launch the shell writes an `.mcp.json` into the terminal's cwd:

```json
{ "mcpServers": { "blog-content": {
  "command": "<process.execPath>",
  "args": ["<resourcesPath>/mcp/content-server.mjs"],
  "env": { "ELECTRON_RUN_AS_NODE": "1",
           "DATABASE_URL": "…the cluster's socket…",
           "MCP_AUTHOR_ID": "…the local author's id…" } } } }
```

Generated per launch rather than committed, because both values are per-machine:
`DATABASE_URL` carries the socket path under `userData`, and `MCP_AUTHOR_ID` is
the id of the user the shell signs in (`session.js`). `content-server.mjs` is
§2.2's build step.

**Declined: pointing Claude Code at `/api/mcp` with a minted agent token**,
which would need no bundling at all — the HTTP endpoint is already there and
already speaks the same ten tools. It was declined because it is not there in
this build: `desktop-app.md` §14.2 makes that route 404 before the credential is
read, deliberately, and reopening it would mean a desktop build that accepts
bearer tokens and an `AgentToken` row minted on the user's behalf without them
asking. The stdio server needs no credential at all — it is a child process with
a database URL — which is strictly less to get wrong.

**Declined: shipping the terminal and letting the user configure MCP.** It is
the smallest surface and it is what any other project would require. Declined
because the library has no file representation: posts are Lexical JSON in
Postgres, and a terminal in a directory with no `.mcp.json` is a terminal that
cannot see a single post. The auto-generated config is not a convenience here,
it is the feature.

### 4.5 The binary is the user's, and may not be found

Resolution order at session start: `PATH`, then `~/.local/bin/claude`, then
`~/.claude/local/claude`. If none resolves, the view renders an empty state
naming the install command rather than a dead terminal — §2.4 says this is the
likeliest first-launch failure, and a blank black rectangle explains none of it.

**Declined: bundling Claude Code.** Not ours to ship, and it would be stale the
week after a release.

Authentication comes free and is worth stating so nobody designs for it: the app
runs as the user on the user's machine, so the session uses `~/.claude` exactly
as a terminal session would. There is no credential for this app to hold.

### 4.6 cwd is a workspace directory; permissions are Claude Code's own

`<userData>/workspace/`, created on first launch, holding the generated
`.mcp.json` and nothing else the shell puts there. The user's exports, drafts
and scratch files can live there. Permissions are left at Claude Code's
defaults — the app passes no bypass flag.

**Declined: bypassing permissions**, which is what `claude-code-notebook.md`
§4.7 takes, in a directory the user picks per session. That decision is coherent
there: a document that renders a permission prompt has to render it as a block,
and §4.6 of that plan is committed to full input parity, so a bypass is a way to
defer a lot of design. Here it would be a bypass **that the user did not type**,
in a surface that looks exactly like their terminal and therefore sets exactly
the expectations their terminal sets. A PTY renders the real prompt correctly
and for free. Taking the default is both the safer answer and the cheaper one,
which is rare enough to say out loud.

Note the two plans therefore disagree about `cwd` and permissions, and the
disagreement is not an oversight in either: it follows from the surface. This is
the clearest case of §5's general point.

### 4.7 One session per window

One PTY, started when the view is first opened, surviving the view being
switched away from (so a long turn is not killed by clicking "Outline"), torn
down with the window.

**Declined: multiple sessions with a tab strip.** It is the obvious next
feature and it can be added later without redesign. Declined now because the
rail has no room for a tab strip (§2.3) and because one session is the shape
that makes the bridge's vocabulary need no session id (§2.1).

The lifecycle question that is **not** settled here is what happens to a turn in
flight when the window closes. A `SIGHUP` to a `claude` mid-`apply_ops` is how a
half-written proposal happens. §9 keeps it open, and §7's phase 3 is where it is
answered.

### 4.8 The terminal owns the keyboard while focused

`Ctrl+C` must reach the PTY — it is the interrupt, and a terminal that cannot
interrupt is not one. It is also `Mod+C` in `APP_SHORTCUTS` (notes canvas
selection, and Lexical's rich clipboard). The resolution is that a focused
xterm consumes the keyboard wholesale, and `APP_SHORTCUTS` gains entries saying
so, so `menuTemplate.test.ts`'s audit keeps agreeing with the truth.

`Mod+5` for the view toggle, continuing `Mod+1..4`. Not `Mod+Shift+C`: `Mod+C`
has no shift guard on Lexical's copy path, which is precisely the case
`absorbsShift` exists to record in that inventory.

Copy and paste inside the terminal are xterm's own (`Ctrl+Shift+C` / `V`),
which is what every terminal does and what the user's muscle memory already has.

## 5. The relationship to `claude-code-notebook.md`

Both plans were written on 21 Sep 2026, both answer "run Claude Code inside the
desktop app", and they answer it in opposite directions. Neither should be read
without this section.

**They are not phases of one thing.** The notebook renders a session as a
Lexical document and states its goal as "never open the terminal again" (§4.6).
This plan is the terminal. They can coexist — nothing here forecloses that one —
but the notebook plan subsumes this one if it is ever finished, and this plan
makes the case that it might not need to be.

**Fidelity is free here and is the notebook's central expense.** That plan's
design principle is parity with the terminal (§1): "anything the terminal shows,
the document shows". Its §7 phase 0 is a gate asking whether the raw stdio
protocol even carries interrupts and mid-session mode changes, and its §4.1
reopens if it does not. A PTY does not ask that question — it is the thing the
question is about. Sixteen decisions there exist to reconstruct an interface
that a `node-pty` gives back byte for byte.

**What the notebook has that this cannot.** Real, and not diminished by the
above: a session persisted as a `Document` and reread later; tool calls rendered
as blocks rather than as ANSI; subagents as nested documents; `@` and `/` over
the app's own ⌘K registry; and a transcript that the content-bridge tools could
one day address. A terminal has scrollback and a `.jsonl` on disk. Those are
different products, not different qualities of the same one.

**This plan pays the bridge cost that both need.** §2.1 is §2.2 there. If this
lands first, the notebook's §4.2 inherits a bridge instead of introducing one,
and inherits it in the narrowest possible shape (§4.1) rather than designing
narrowness in retrospect.

**The recommendation, stated as a recommendation.** Build this first, and treat
it as evidence about the other one. If a terminal in the rail turns out to be
used every day and the document is never missed, then the notebook's sixteen
decisions are careful answers to a question nobody has — which is a finding
worth four phases of work to get, and cheaper to get this way than by building
phase 3 of that plan and discovering it there. If instead the terminal is used
and the things §5 lists as missing are missed *specifically and namably*, the
notebook has a specification it does not currently have: its §1 records that its
own first framing was wrong, and a live terminal is the fastest way to find out
whether its second one is right.

## 6. What this plan has not verified

Six things, and the first is the only one that could change the design.

1. **`node-pty` against Electron 44's ABI**, rebuilt and packaged. Phase 1 is
   this and nothing else.
2. **That the esbuild'd MCP server actually runs** — specifically that
   `@prisma/client`, left external, resolves against the standalone bundle's
   copy with its query engine, from a `cwd` that is neither.
3. **The column arithmetic in §2.3**, against the font xterm actually resolves,
   and whether Claude Code's TUI is usable at that width.
4. **That the `.desktop` launch environment finds `claude`** (§2.4). Likeliest
   first-launch failure; cheap to check, and cheap to get wrong by checking it
   from a developer's shell where `PATH` is rich.
5. **What xterm.js looks like against DESIGN.md §19's dark-mode contract.** The
   terminal has its own 16-colour palette and `pnpm check:theme` reads `.css`,
   `.css.ts` and `--ed-*`; a third palette is a question that file has not been
   asked before.
6. **What any of it looks like.** `desktop-app.md` records across all seven
   phases that this session's compositor refuses screenshots. That has not
   changed, and it bites harder here than it did there, because this is the
   first desktop feature whose whole value is on screen.

## 7. Phases

**1. PTY and bridge, no product.** `preload.js`, `pty.js`, a hard-coded
`bash -i` session, xterm on a throwaway route. Packaged and run from the
AppImage, not just from `pnpm desktop`. This is the risk phase: it proves the
native module, the rebuild and the packaging, and if it fails §4.1's fourth
alternative is what is left.

**2. The rail view.** `terminal` in `VIEW_IDS`, `Mod+5`, its own width triple,
`NEXT_PUBLIC_DESKTOP` gating, the keyboard ownership in §4.8 plus the
`APP_SHORTCUTS` entries, the empty state for a missing binary. Answers §6.3 and
§6.5 with the real font and the real palette in front of them.

**3. Lock it to `claude`.** Fixed argv, binary resolution (§4.5), the workspace
cwd, restart-on-exit, and the quit-mid-turn question from §4.7. The bridge loses
its general `spawn` here if phase 1 left it one, and that is the phase's
acceptance criterion rather than a tidy-up.

**4. The MCP bundle.** The esbuild step into `.stage/mcp/`, generated
`.mcp.json`, the `verify-package.mjs` assertion that the bundle is present and
runnable, and the `afterPack` credential scan extended over it — the generated
config holds a `DATABASE_URL`, so §15.2's rule applies to the template that
writes it even though the file itself is written at runtime.

Phases 1–3 are a usable feature without phase 4: a terminal running Claude Code
with no view of the library. Phase 4 is what makes it the feature that was
asked for, and it is last only because it is the one part that cannot fail
in a way that changes the design.

## 8. Out of scope

- **A general shell.** §4.1. The mechanism would support it; the decision is
  that it should not.
- **Multiple concurrent sessions.** §4.7. Addable later without redesign.
- **Rendering a session as a document.** That is `claude-code-notebook.md`, and
  §5 is the whole discussion.
- **The web build.** §3.
- **macOS and Windows.** `desktop-app.md` is Linux-only by decision, and
  `node-pty`'s other platforms are somebody else's phase 1.
- **Anything about sync.** `desktop-app.md` §7 still owns it.

## 9. Open questions

1. **Does `node-pty` package cleanly under Electron 44?** Phase 1. §6.1.
2. **How wide does the terminal view's panel need to be**, and is the rail
   still the right home at that width? §2.3. If the answer is "wider than the
   window comfortably gives", §4.3's declined bottom drawer is what it reopens.
3. **What happens to a turn in flight when the window closes?** §4.7. The
   dangerous case is a `SIGHUP` during `apply_ops`, and the mitigating fact is
   that `apply_ops` proposes rather than commits — so the worst outcome is a
   malformed pending proposal rather than damaged content. Worth confirming
   rather than assuming.
4. **Should the generated `.mcp.json` be regenerated or merged** if the user has
   edited it? Overwriting silently discards their MCP servers; merging means
   parsing and reconciling a file the app does not own.
5. **Is a missing `claude` binary an empty state or an absent view?** §4.5 takes
   the empty state, on the grounds that a view that vanishes is unexplainable.
   The counter-argument is that a rail icon leading to an install instruction is
   an advertisement.

## 10. Phase log — 21 Sep 2026

All four phases in one sitting, shell and renderer halves built in parallel.
Five things this plan had wrong, in the order they were found.

### 10.1 Both named unknowns resolved in the plan's favour

§7 front-loaded `node-pty` because it was the only thing that could change the
design. It did not: rebuilt with `@electron/rebuild` against Electron 44 it
loads, spawns, streams and exits clean (ABI 149), and `asar: false` meant there
was no unpacking problem to have. §6.1 is closed.

§6.2 asked whether the esbuild'd MCP server would resolve `@prisma/client` left
external. It does — 2.1 MB, runs under `ELECTRON_RUN_AS_NODE`, connects — but
only from the right directory, which is §10.2.

The cost of the first is a standing obligation rather than a one-off: **a plain
`pnpm install` rebuilds `node-pty` against Node's ABI**, and the main process
then cannot open it. `pnpm --filter @blog/desktop rebuild:native` is the repair,
and it is the kind of thing that is obvious the day it is written and baffling
four months later.

### 10.2 §4.4 put the MCP bundle one directory too high

The plan's `.mcp.json` names `<resourcesPath>/mcp/content-server.mjs`. That path
cannot work. `@prisma/client` is external, so Node resolves it by walking up
from the bundle's own directory, and `<resources>/mcp/` has no `node_modules`
above it — measured, before the staging step was written:
`ERR_MODULE_NOT_FOUND`.

The bundle belongs **inside** the standalone tree,
`<resources>/<buildDir>/standalone/mcp/`, where the Next server's own Prisma
copy is directly above it. That is also the better arrangement on its own terms:
the two servers then hold one client, generated once, against one schema.

What makes this worth recording is the shape of the failure rather than the fix.
A bundle one directory too high packages perfectly, passes every file check, and
fails at *spawn* time — surfacing to the user as "Claude Code cannot see any
posts", in the app, with nothing in the package to explain it. So
`verify-package.mjs` asserts that the bundle **loads**, not that it exists.

### 10.3 Prisma reads a `.env` nobody named, and it defeated the first check

`@prisma/client` loads a `.env` at import — from the process cwd, *and* from
beside whatever `schema.prisma` it finds walking up from its own location. This
was found by writing the load assertion in §10.2 and having it pass for the
wrong reason: run from a scratch directory inside the repository, the bundle
picked up the developer's `MCP_AUTHOR_ID` and got all the way to opening a
database connection, when the whole point of the check was to observe it refuse.

Two consequences, and the second is the one that outlives the check:

- The assertion now passes `MCP_AUTHOR_ID: ""` explicitly. An empty string is
  already *present* in the environment, so a dotenv loader will not overwrite
  it, and the refusal is deterministic.
- **The `env` block in the generated `.mcp.json` is load-bearing, not
  convenience.** The MCP child inherits the terminal's cwd, which is the
  workspace directory (§4.6) — a directory the user can put files in. Naming
  `DATABASE_URL` and `MCP_AUTHOR_ID` explicitly is what makes a stray `.env`
  there harmless.

### 10.4 The palette cannot come from the theme, and §6.5 was the wrong question

§6.5 asked what xterm looks like against DESIGN.md §19's contract. The real
finding is upstream of that: **this app sets `cssVariables`, so
`theme.palette.*` is frozen to the light scheme** and `theme.vars.*` is a
`var(...)` string xterm silently fails to parse. Deriving the terminal's
colours from `useTheme()` — the obvious implementation, and the one this
plan would have led to — ships a light-only terminal. That is precisely the
`editor-dark-mode` failure DESIGN.md §19 exists to prevent, arriving through a
door the linter cannot watch.

So `terminalTheme.ts` holds both schemes explicitly and takes the mode from
`useColorScheme()`. `pnpm check:theme` reads `.css`, `.css.ts` and the `--ed-*`
contract, and cannot see a JavaScript object, so the spec does that job instead:
every slot filled in both schemes, and **no slot identical across them**.

### 10.5 §4.8 taken literally is a keyboard trap

"The terminal owns the keyboard while focused" is right for every chord a TUI
and the app both want — `Ctrl+C` has to be the interrupt. Taken literally it
also means `Escape`, `Tab`, `Shift+Tab` and `Mod+1..4` all belong to xterm, and
then a keyboard-only user who focuses the terminal **cannot leave the view at
all**: §4.3's rail icon and the panel's close button are both pointer-driven.
That is a WCAG 2.1.2 keyboard trap, and it is a defect independent of what this
plan says.

Exactly one chord is reserved: the view's own toggle, `Mod+5`, held off xterm
with `attachCustomKeyEventHandler` so the event bubbles to the rail's digit
handler — where selecting the view already showing is what closes the panel. The
chord that opens the terminal closes it, which is the only behaviour that needs
no separate explanation.

Two smaller things in the same section. `Mod+K` and `Mod+/` bind on `window` in
the **capture** phase, so they have already fired before the event reaches
anything the view could stop it at — no `stopPropagation` and no mount ordering
fixes that, and both now ask `isTerminalFocused()` and stand down, mirroring how
the palette already defers to a focused Lexical editor. And `preload.cjs` is
`.cjs` rather than `.js` on purpose: an unsandboxed preload — which is what the
AppImage's `--no-sandbox` produces — goes through Node's loader, reads the
package's `"type": "module"` and refuses `require`. A `.js` there works in
`pnpm desktop` and fails only in the packaged build.

### 10.6 Two decisions the plan did not make, made in passing

- **The xterm instance is a module singleton**, not component state. §4.7 says a
  long turn survives the view being switched away from; unsubscribing on unmount
  keeps the *session* alive but drops every byte produced while the view was
  closed, so the user returns to a live session that skipped a screen. The
  bridge has no scrollback replay to recover it with, which is what a
  `terminal:replay` would be for if this ever needs one.
- **Reopening a view whose session exited starts a new one** silently, so the
  "exited" card does not survive a view switch. Better than resurrecting a stale
  notice, but it is a choice, and this plan did not make it.

### 10.7 What shipped, and what is still open

Four commits: the shell half (PTY, bridge, argv, session), the rail view, the
MCP bundle with its packaging assertions, and this log. 1537 tests pass across
76 files, `tsc`, `lint` and `check:theme` are clean.

Still open, unchanged by any of the above: §6.3 (the column arithmetic, against
the real font), §6.6 (what it looks like), §9.2 (whether the rail is the right
home at the width this actually needs) and §9.3 (a turn in flight when the
window closes). §9.4 is **answered** — the generated `.mcp.json` merges, keeping
every other server the user configured and replacing only `blog-content`. §9.5
is **answered** as the plan proposed: a missing binary is an empty state naming
the install command and what was searched, not an absent view.
