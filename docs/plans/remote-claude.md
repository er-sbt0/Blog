# Remote Claude Code sessions

**Status: v1 built, 4 Oct 2026 — phases 1–4 done (§7.1–§7.4), phase 5 declined (§9). Never yet run inside the desktop app.** A read-only browser for the
Claude Code transcripts on remote machines — view, browse, toggle, search, and
stats — in the desktop app. It ports `~/code/claude_remote` (a Python/Textual
TUI over `coder ssh`) into the shell, with an incremental sync into the embedded
Postgres in place of a full dump per launch. Content is stored **in plaintext**,
indexed for substring search with `pg_trgm` (§4.5, §4.9).

The scope was set by answers given on 4 Oct 2026; §1 records them, so that a
later reader can tell a decision from a default. One of them this plan does not
follow as given, and says so where it departs: §4.6 (sessions open in the main
area, not as pane tabs).

Read §2 before anything else. §2.1 is why a session cannot simply be a pane tab,
and §2.4 is why the transcript renderer is a security surface rather than a
styling job.

This is a **desktop-only** feature by construction (§3). The VPS build answers
404 for every route it adds.

---

## 1. What is being asked

> We want to introduce the same concept into our desktop app: fetch, lay out,
> organise etc. the content of Claude Code sessions from a remote ssh machine.
> … We just want a nice way to view, browse, toggle, search, etc. Claude Code
> sessions.

Answered on 4 Oct 2026:

| Question         | Answer                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Where data lives | **Postgres cache** in the embedded cluster; the remote JSONL stays the source of truth                                                       |
| Transport        | Author's call, noting `ssh coder.main` already goes through the coder CLI via `~/.ssh/config`. Taken as **system `ssh <alias>` only** (§4.1) |
| Freshness        | **Incremental, on demand** — a Sync that pulls only what changed                                                                             |
| UI surface       | **Activity-rail view** (host → project → session) **plus pane tabs** for transcripts. The second half is revised in §4.6                     |
| Organising       | **None.** No tags, pins, renames or notes — viewing, browsing, toggling and search only                                                      |
| v1 features      | **Transcript viewer, full-text search, stats dashboard.** Not export                                                                         |
| MCP access       | **Not in v1** — the in-app terminal's agent cannot read these                                                                                |
| Scope            | **Desktop only**                                                                                                                             |
| At rest          | **Plaintext in local Postgres.** No encryption, no extra mitigation beyond Forget (§4.5)                                                     |
| Search           | **`pg_trgm` substring** over a derived entries table (§4.9)                                                                                  |
| Storage          | **Raw chunks plus a derived entries table** (§4.4)                                                                                           |
| Hosts            | **Many, user-added** — alias plus display name, grouped by host in the explorer                                                              |
| Deletions        | **Keep locally** — a "gone from remote" badge and a manual Forget                                                                            |

Taken literally, "organise" was answered no. What survives is *layout*: group by
host and project, sort by recency, filter by text. Nothing a user does in this
view writes anything except a sync.

## 2. What the tree permits

Five findings, gathered before designing.

### 2.1 A pane is a document, and four things are keyed on that

`WorkspacePane` (`src/types.ts:72`) has a `rootId` that is a post id, and its
`tabIds` are that post's **child documents** — the type's own docblock says
"tab" never means "open document". Four mechanisms assume a pane's contents are a
`Document`:

- `saveRegistry` is keyed by document id, which is why one document may be in at
  most one pane (the reducer invariant, `workspaceReducers.ts`);
- the persisted workspace record is replayed through `workspaceRestore.ts`, which
  fetches each `rootId` as a document;
- the URL replay in `workspaceUrl.ts` rewrites the address bar to the focused
  pane's document;
- `ui.railPanel` is keyed by `docId`, so the right rail's views would open
  against a session id with nothing behind it.

A session as a pane tab therefore means a `kind` discriminator on
`WorkspacePane` and an answer for all four. That is a real refactor of a
specced reducer (`workspace.test.ts`), and it is the reason for §4.6.

### 2.2 The bridge exists, and adding to it is an argument

`preload.cjs` exposes `window.desktop.terminal` and nothing else, and its
docblock states the rule: anything added has to argue its own narrowness. The
terminal's argument was a fixed argv and one session per window. This feature
cannot use the first half of that argument — an ssh alias is user input, and it
becomes an argv element (§4.2).

### 2.3 The Next child's environment is closed; the terminal's is open

`serverEnv` (`packages/desktop/src/server.js`) passes `PATH`, `HOME`, `TMPDIR`,
`LANG`, `LC_ALL` and `TZ` and nothing else, and `serverEnv.test.ts` pins that.
`ssh` needs `SSH_AUTH_SOCK` and, for `coder.*` aliases, whatever the coder CLI
reads. So **ssh cannot be spawned from the Next server** without opening an
environment that phase 6 of `desktop-app.md` spent real work closing. It belongs
in the main process, beside `terminal.js`, whose environment is deliberately open
(`terminal.test.ts` pins that an inherited `SSH_AUTH_SOCK` survives).

### 2.4 The renderer that shows a transcript also holds a PTY

A transcript is arbitrary bytes from a remote machine: tool output, fetched web
pages, file contents, `<script>` tags in an HTML file Claude read. The window
that renders it also has `window.desktop.terminal.write`, which types into a
running Claude Code. Script execution in that renderer is therefore not XSS in
the usual sense — it is **input to an agent with shell access on this machine**,
on an AppImage that runs `--no-sandbox` (`desktop-app.md` §15.5).

Two existing facts make this concrete:

- `CopilotPanel/MarkdownText.tsx` — the obvious renderer to reuse for assistant
  text — puts a link's target straight into `href` (line 79). A `javascript:`
  link from a transcript would be clickable. It is safe for Copilot replies only
  in the sense that the model is the author; here the author is any file Claude
  ever read.
- Nothing in this repo renders untrusted HTML today except stored SVG, and that
  goes through `<img>`.

So §4.7 is a rule rather than a preference: **no transcript byte reaches the DOM
as markup.**

### 2.5 A transcript is a tree, and `claude_remote` reads it as a list

`claude-code-notebook.md` §2 measured 2144 events in one session, each with a
`uuid` and a `parentUuid`. Rewinding a conversation (Esc-Esc) leaves the abandoned
branch in the file, and `claude_remote`'s parser renders both branches inline,
in file order. v1 keeps that behaviour (§8) — it is what the author already
uses — but the parser records `uuid`/`parentUuid` so a later version can show
the live path only.

What else carries over unchanged from `model.py`, because it is correct and
was learned the hard way:

- one API response is several `assistant` events sharing a `message.id` — count
  messages by id, not by event;
- tool results arrive as `user` events whose blocks are all `tool_result`, and
  must not count as prompts;
- slash commands are `<command-name>`/`<command-args>` text; anything else
  starting with `<` is injected content, not something the user typed;
- a subagent's transcript is `<project>/<session>/subagents/agent-<id>.jsonl`,
  linked from the Agent/Task call by `toolUseResult.agentId`, or by matching the
  prompt on older files;
- the project directory name is a lossy encoding of the cwd (`/`, `.` and `_`
  all become `-`), so the real path comes from the events' `cwd`, and a guessed
  one is shown as guessed.

## 3. The shape

```
 renderer                     main process                   remote host
 ────────                     ────────────                   ───────────
 Sessions view ──sync(hostId)──▶ remoteSessions.js
   (preload)                     │ GET host alias  ◀── Next ──┐
                                 │ ssh -- <alias> <FIXED_LIST> ──▶ find … -printf
                                 │ ◀── manifest (path, size, mtime)
                                 │ POST manifest ─────▶ Next: diff against RemoteFile
                                 │ ◀── wanted (path, from, to)
                                 │ ssh -- <alias> <FIXED_READ> ──▶ reads stdin, tail -c
                                 │   stdin: wanted ranges          length-framed bytes
                                 │ POST chunks ───────▶ Next: store, parse, index
                                 ▼
 /sessions/... ◀────────── GET /api/remote-sessions/* (render data)
```

- **The main process owns ssh** (§2.3) and nothing else. It never parses a
  transcript and never touches the database: it moves bytes from the remote host
  to a loopback route, authenticated with the session cookie it already mints
  for the window (`session.js`).
- **The Next server owns the data**, behind `userRoute` and new repositories,
  like every other table. It parses, derives and serves. This keeps `access.ts`'s
  model intact — a session row belongs to a host row that belongs to a user, and
  `requireRemoteHost` / `requireRemoteSession` enforce it the way
  `requireDocument` does.
- **Every new route is desktop-only.** `api-utils.ts` has `refuseOnDesktop` for
  the opposite case; this adds `refuseOffDesktop`, called first in each handler,
  same 404-not-403 reasoning.

## 4. The decisions

### 4.1 Transport — system `ssh <alias>`, nothing coder-specific

The host is an alias from `~/.ssh/config`. `coder config-ssh` already writes
`coder.<workspace>` entries whose `ProxyCommand` is the coder CLI, so plain ssh
reaches coder workspaces and anything else the author can ssh to, with their
agent, keys, jump hosts and known-hosts file, and this code knows about none of
it.

Declined: a `coder ssh <ws>` mode beside it. It would be a second spawn path and
a second argv to validate in exchange for something the ssh config already
provides.

Options passed, always:

- `-o BatchMode=yes` — no TTY, so a password or passphrase prompt would hang the
  sync forever. It fails instead, and the error tells the user to run
  `ssh <alias>` once in a terminal.
- `-o ConnectTimeout=15`.
- **Never** `StrictHostKeyChecking=no` or `UserKnownHostsFile=/dev/null`. An
  unknown host key fails the sync with ssh's own message. Accepting it silently
  is the ssh version of disabling certificate verification.

### 4.2 The alias is user input, so it is validated, and no shell sees it

A value the user typed becomes part of a spawned process. Three things together
make that safe.

1. **Validated where it is stored and again where it is used.** The zod schema on
   `POST /api/remote-sessions/hosts` and `remoteSessions.js` both require
   `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. The leading character rules out `-`, so
   an alias cannot be read as an option (`-oProxyCommand=…`). The spawn also puts
   `--` before it.
2. **`spawn("ssh", argv)` with no `shell`.** The alias is one argv element and is
   never part of a local command string.
3. **The remote commands are two string constants** in `remoteSessions.js`. They
   do not interpolate anything — not the alias, not a path. The ranges to read
   go to the remote script on **stdin**, as `from\tto\tpath` lines, and the
   script quotes `"$path"`. The script also refuses any path that is not under
   `$HOME/.claude/projects/` and ending in `.jsonl`, so a manifest tampered with
   on the way back cannot turn the read into `cat ~/.ssh/id_ed25519`.

The bridge gains `desktop.sessions.sync(hostId)` and `onProgress`. It takes a
host **id**, not an alias. The main process fetches the alias from the server
and validates it again, so a compromised renderer can trigger a sync of a host
the user already added but cannot name a new one. That is the narrowness
argument §2.2 asks for.

### 4.3 Sync — manifest, diff, ranges, length-framed

Two ssh round trips per sync, whatever the history size:

1. **List.** `find "$HOME/.claude/projects" -type f -name '*.jsonl' -printf
   '%s\t%T@\t%P\n'` gives size, mtime and relative path. The server diffs it
   against `RemoteFile`:
   - unknown path → want `[0, size)`;
   - same size and mtime → skip;
   - grown → want `[consumed, size)`;
   - shrunk, or the stored first-4-KiB SHA-256 no longer matches → the file was
     rewritten: drop its chunks and entries and want `[0, size)`;
   - stored but not listed → set `goneAt` (§4.8).
2. **Read.** The fixed read script takes ranges on stdin and, for each one,
   writes a header `\x1e<length>\t<path>\n` followed by **exactly** `length`
   bytes (`tail -c +$((from+1)) -- "$path" | head -c $length`), plus a
   `sha256sum` of the file's first 4 KiB.

The length comes from the manifest, so a file Claude Code is appending to while
we read it is read up to the size we listed and no further. That makes the
framing exact, rather than depending on a marker never appearing in the data
(which is how `claude_remote` does it). The server **consumes only up to the
last `\n`** and records that offset as `consumed`. A half-written final line is
read again next time rather than parsed as a broken event.

`GNU find -printf` is a dependency on the remote. If it fails, the list script
falls back to `stat -c` and reports which one it used. A macOS remote is
§9 question 1.

Budget: the ingest route takes at most 8 MiB per POST, and the main process
batches chunks to fit. A first sync of a large history is many POSTs and one
ssh read. Progress goes back over `onProgress`.

### 4.4 Storage — raw bytes are the source of truth, entries are derived

```prisma
model RemoteHost {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  alias       String    // §4.2 — validated
  label       String
  lastSyncAt  DateTime? @db.Timestamptz
  lastError   String?   // ssh's stderr, truncated
  createdAt   DateTime  @default(now()) @db.Timestamptz
  files       RemoteFile[]
  @@unique([userId, alias])
}

model RemoteFile {            // one .jsonl = one session or one subagent run
  id           String    @id @default(uuid()) @db.Uuid
  hostId       String    @db.Uuid
  path         String    // relative to ~/.claude/projects
  size         BigInt
  mtime        Float
  consumed     BigInt    // bytes up to the last newline
  headHash     Bytes     // SHA-256 of the first 4 KiB, to detect rewrites
  goneAt       DateTime? @db.Timestamptz
  isSubagent   Boolean
  parentFileId String?   @db.Uuid
  // Session metadata, derived at ingest:
  title        String?
  cwd          String?
  cwdGuessed   Boolean   @default(false)
  gitBranch    String?
  firstPrompt  String?
  // Stats, derived at ingest:
  startedAt    DateTime? @db.Timestamptz
  endedAt      DateTime? @db.Timestamptz
  activeMs     Int
  userMsgs     Int
  assistantMsgs Int
  toolCalls    Int
  tools        Json      // { "Bash": 41, "Read": 17, … }
  promptTimes  DateTime[] @db.Timestamptz
  chunks       RemoteChunk[]
  entries      RemoteEntry[]
  @@unique([hostId, path])
}

model RemoteChunk {
  id      String @id @default(uuid()) @db.Uuid
  fileId  String @db.Uuid
  seq     Int
  offset  BigInt
  data    Bytes  // the raw JSONL bytes, gzipped
  @@unique([fileId, seq])
}

model RemoteEntry {           // one rendered row of a transcript
  id      String   @id @default(uuid()) @db.Uuid
  fileId  String   @db.Uuid
  idx     Int      // position in file order
  kind    String   // prompt | assistant | thinking | tool_use | tool_result | meta | command
  uuid    String?
  parentUuid String?
  at      DateTime? @db.Timestamptz
  tool    String?  // for tool_use / tool_result
  body    Json     // what the viewer needs: blocks, tool input, result, isError
  text    String   // lower-cased searchable text, §4.9
  @@unique([fileId, idx])
}
```

Stored this way because:

- **Raw chunks are the source of truth.** A parser fix (and there will be
  several, since the format changes between Claude Code versions — `model.py`
  says so) re-derives entries and stats from what is stored, without fetching
  again. A `PARSER_VERSION` constant in `parse.ts` is recorded per file; a file
  whose version is behind is re-derived on next read or sync.
- **Entries are a derived index, not a second source.** They exist so the viewer
  can page through a session without parsing it, and so search has something to
  index. On every ingest that touches a file, its entries are deleted and
  rebuilt from all of its chunks, in one transaction with the stats columns.
  That is affordable because ingest only touches changed files; if a long
  session's rebuild proves slow, appending entries from the new chunk alone is
  the optimisation, and it is deferred until measured (§6.1).
- **Chunks are gzipped.** JSONL compresses well and the chunks are read only on
  re-derive, so the cost is paid rarely.

### 4.5 At rest — plaintext

Transcripts, paths and metadata are stored in plaintext in the embedded cluster,
which lives in `userData` under the user's own account. There is no data key, no
keyring dependency and no `safeStorage` involvement. Transcripts routinely
contain credentials (`Read` of a `.env`, a pasted token); the store holds them
exactly as the remote does, and Forget (§4.8) is the only control.

### 4.6 Placement — a sidebar view and a `/sessions` route, not pane tabs

The author asked for pane tabs. This plan proposes the main area instead, as a
route, and asks for that to be confirmed (§9 question 2):

- **Sidebar**: a fourth `SidebarView`, `"sessions"`, beside explorer, search and
  notes, with an activity-rail button. It shows a tree of host → project →
  session, with subagent runs nested under their session. A filter box at the
  top filters the tree; full search is §4.9. Each host row has Sync and a
  last-synced time.
- **Main area**: `/(workspace)/sessions/[id]` renders one transcript, and
  `/(workspace)/sessions` renders the stats dashboard. Opening a session from the
  tree navigates there, and the workspace panes are not involved.

Why not pane tabs: §2.1. Four mechanisms assume a pane holds a document. Making
a pane hold either a document or a session is a `kind` discriminator through a
reducer with its own spec, a restore path, a URL scheme and the rail. That is a
plan of its own. The route costs none of it and loses one thing: a transcript
cannot sit beside a post in a split. If that is wanted, it is phase 5 and it is
the refactor.

### 4.7 The transcript renderer — text nodes and MUI, never markup

From §2.4. The rule: **every transcript string reaches the DOM as a React text
child.** No `dangerouslySetInnerHTML`, no HTML-capable Markdown library, no
`<iframe srcdoc>`.

- **Assistant text** uses the Markdown subset `MarkdownText` already handles,
  but through a **copy, or a fixed version**, that allow-lists link schemes to
  `http:` and `https:`, renders anything else as plain text, and opens links
  through the shell (`setWindowOpenHandler` → `shell.openExternal`), never inside
  the app window. The bug in the existing component (§2.4) is reported, not
  silently fixed here. It is a one-line change, and the author should decide
  whether Copilot output needs it too (§9 question 3).
- **Tool inputs and results** are monospace text. `Bash` commands and `Write`
  contents get syntax colouring from `shiki`, which is already a dependency,
  through its token API (`codeToTokens`), rendering spans as React elements and
  **not** `codeToHtml`. `Edit`/`MultiEdit` inputs render as a red/green diff of
  `old_string` → `new_string`, as in `transcript.py`.
- **Images** in transcripts (`[image]` blocks) are shown as a placeholder in v1.

Viewer behaviour carried over from `tui.py`, with its keys where they do not
collide with the app's 25 chords (`menuTemplate.test.ts` has the list):

- Tool calls are collapsed to one line (name, summary, ✓ N lines / ✗ error) and
  expand on click or Enter. There is also an "expand all".
- **Thinking and meta are hidden by default** and come back with a toggle. When
  shown, they are collapsed to two lines.
- Next/previous prompt (`n`/`p`), and find-in-session with next/previous match.
- An Agent/Task call with a matching subagent transcript gets "Open subagent",
  which navigates to it, with a breadcrumb back.
- A header with title, project (italic when the path was guessed), branch,
  started/ended, active time (5-minute idle gap, as `model.py`), message and
  tool counts.

The viewer reads `RemoteEntry` rows in pages by `idx`, so a long session is
never sent whole. Long sessions still need **virtualised rendering**: 2000+
entries as MUI elements is too slow to scroll, and there is no list virtualiser
in `package.json` today, so this is a dependency decision.
`@tanstack/react-virtual` is MIT; the licence check is part of phase 3. Results
are clipped at 200 lines in the viewer, as in `transcript.py`, with "show all"
in place of "export to see all".

All states DESIGN.md requires: loading (skeleton rows), empty ("No sessions on
this host yet — Sync"), error (ssh's message, verbatim and truncated), and
unavailable ("the web build has no sessions").

### 4.8 Deletions — keep, badge, forget

Claude Code prunes transcripts after `cleanupPeriodDays` (30 by default). A file
the manifest no longer lists gets `goneAt`, keeps every byte, and shows a "gone
from remote" badge. **Forget** is per session, per project and per host. It
deletes the file's chunks and entries; it is the only delete in the feature, and
it is irreversible for a gone file, so it confirms and says so. Removing a host
forgets everything under it, with the same confirmation.

Postgres frees the space on vacuum; this plan does not claim the bytes are gone
from disk before then.

### 4.9 Search — `pg_trgm` over `RemoteEntry.text`

The migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` and adds a GIN
trigram index on `RemoteEntry.text` (raw SQL in the migration — Prisma's schema
cannot express a `gin_trgm_ops` index). `pg_trgm.control` ships in the bundled
`@embedded-postgres/linux-x64` 17 binaries, so the desktop cluster has it
without anything extra.

- `text` is what a reader would search: prompt and assistant text, tool inputs
  (the command, the file path, the pattern), and tool results — lower-cased at
  ingest so the query is `text LIKE '%' || lower($q) || '%'` and the index
  serves it. Substring rather than word matching is the point: it finds paths,
  identifiers and fragments, the way `model.search`'s `includes` does today.
- `GET /api/remote-sessions/search?q=` returns results newest session first,
  capped at 1000. Each has session, entry `idx`, kind and a ±40-character
  snippet cut from `text`. Clicking one opens the session at that entry with the
  match highlighted. Filters by host, project and kind are `WHERE` clauses.
- Queries shorter than three characters cannot use a trigram index; they are
  refused with a hint rather than falling into a sequential scan.
- Thinking entries are indexed but excluded by default, matching the viewer.

The tables are created on the VPS too, since migrations are shared, and stay
empty there. That makes `CREATE EXTENSION pg_trgm` a production migration as
well — `postgres:17` ships contrib, but the app's database role must be allowed
to create it (§6.4).

### 4.10 Stats — computed at ingest, aggregated in SQL

Every number `report.py` shows is a column on `RemoteFile` (§4.4): totals,
per-project sessions, subagent runs, messages, tools, active time, first and
last, the 30-day sessions-per-day sparkline, prompts by hour, and the tool
breakdown. `/sessions` renders them with MUI and the existing chart conventions
(`dataviz` guidance). It can be filtered by host.

## 5. What changes, by file

| Where | What |
| --- | --- |
| `prisma/schema.prisma` + a migration | §4.4's four models; `pg_trgm` and the trigram index (§4.9) |
| `packages/desktop/src/remoteSessions.js` | spawn, the two fixed scripts, framing, batching to the ingest route |
| `packages/desktop/src/preload.cjs` | `sessions.sync(hostId)`, `sessions.onProgress` |
| `src/lib/claudeSessions/parse.ts` | port of `model.parse_session` to entries + stats, import-free |
| `src/lib/claudeSessions/sync.ts` | manifest diff and newline-boundary consumption, import-free |
| `src/repositories/remoteSessions.ts` | rows; owner-scoped only, no public variant exists |
| `src/lib/access.ts` | `requireRemoteHost`, `requireRemoteSession` |
| `src/lib/api-utils.ts` | `refuseOffDesktop` |
| `src/app/api/remote-sessions/**` | hosts CRUD, manifest, ingest, list, session entries, search, stats — all `userRoute`, all `parseBody`, all `.strict()` |
| `src/components/RemoteSessions/` | sidebar tree, transcript, dashboard |
| `src/app/(workspace)/sessions/` | the two routes |

## 6. What this plan has not verified

### 6.1 How big a real history is

`claude_remote` loads everything into memory in one go and works, but nobody has
measured `~/.claude/projects` on `coder.main`. §4.3's first sync and §4.4's
rebuild-entries-per-file both depend on that number, as does the size of the
trigram index (roughly 2–3× the indexed text). Phase 1 measures it before
phase 2 builds on it.

### 6.2 That `BatchMode=yes` works with coder's `ProxyCommand`

It should, because coder authenticates with its own token and not ssh's prompt.
It has not been tried. If it fails, the error must say so, and not report
"permission denied".

### 6.3 What it looks like

Same compositor limit as `desktop-app.md` and `in-app-terminal.md`.

### 6.4 That the production role may `CREATE EXTENSION pg_trgm`

`pg_trgm` is a trusted extension since Postgres 13, so a role with `CREATE` on
the database can install it. That has not been checked against
`docker-compose.prod.yml`'s role. If it cannot, the extension is created by the
superuser once and the migration's `IF NOT EXISTS` becomes a no-op.

## 7. Phases

1. **Spike: reach and measure.** `remoteSessions.js` able to list and read one
   host, printing counts and bytes. No database. Answers §6.1 and §6.2.
2. **Schema, parse, sync.** The models and migration, `parse.ts` and `sync.ts`
   with specs, the ingest and manifest routes. The specs use **synthetic
   fixtures written by hand** — a real transcript must never be committed, since
   it is exactly where credentials end up. They cover the `model.py` rules in
   §2.5, truncation at the last newline, rewrite detection, entry rebuild on
   re-ingest, `PARSER_VERSION` re-derive, and `refuseOffDesktop`.
3. **Browse and view.** The sidebar view, host management in Settings, the
   transcript route with §4.7's renderer, and the virtualiser (licence checked).
   Includes a spec that feeds a transcript containing
   `<img src=x onerror=…>`, a `javascript:` link and an HTML file's contents, and
   asserts none of it becomes markup.
4. **Search and stats.** §4.9 and §4.10.
5. **Optional: sessions in panes.** Only if §9 question 2 says the split matters.
   This is the §2.1 refactor.

### 7.1 Phase 1 log (4 Oct 2026)

`packages/desktop/src/remoteSessions.js` holds the host check, the argv, both
fixed scripts and the frame parser, with `runRemote` as the only part that
spawns. `scripts/spike-remote-sessions.mjs <host>` runs it and prints counts
only. Run against `dev@192.168.1.33` (GNU/Linux, find 4.10), every check passed:
a range read equals the same slice of a full read, `../`, absolute and
non-`.jsonl` paths are refused, a range past EOF reports `rewritten` without
desynchronising later frames, and an option-shaped host is refused before spawn.

What it changed:

- **§4.2's regex was too narrow.** The first real host was `user@host`, not an
  alias. `@` is now allowed once, before the host part. The leading-`-` rule is
  unchanged.
- **The remote login shell is not assumed to be POSIX.** Both scripts run under
  an explicit `sh -c '…'`. That quoting is sound only because the scripts
  contain no `'`, and `shWrap` asserts it.
- **The leading-dash hazard is real on the remote too.** Project directories are
  named like `-home-dev-llvm`, so any remote command that takes one as a bare
  argument reads it as an option. The scripts only ever pass `./…` or
  `"$root/$rel"`.
- **§6.1, for this host only:** 1 project, 1 session, 286 KB, 62 events, read in
  one ~0.4 s round trip (the list takes ~0.8 s). That is too small to size
  anything, so §6.1 stays open until a busier host is measured.
- **The event vocabulary has grown since `model.py`.** Seen: `mode`,
  `permission-mode`, `atis-latch`, `attachment`, `last-prompt`, `ai-title`,
  `cost-state` and `file-history-snapshot`, beside `user`, `assistant` and
  `system`. `ai-title` is a better source for a session title than the first
  prompt, so `parse.ts` should prefer it. The rest are `meta`.
- **§6.2 is still unverified.** This host is plain ssh, not coder.

## 8. Out of scope

- Tags, pins, renames, notes, links to posts (§1).
- Export to Markdown or to a post (§1). `transcript.export_markdown` is the
  reference if this comes back.
- Agent access through MCP (§1). When it comes back, it is a decision about
  showing secrets to an agent, not a wiring task.
- Encryption at rest, and redaction of secrets in storage or display (§4.5).
- Live tail of a running session.
- The VPS build.
- The branch-aware view of §2.5. v1 renders both branches in file order, as
  `claude_remote` does.
- The machine's own `~/.claude/projects`. Adding a host whose alias is
  `localhost` works if sshd runs; a native local source is a later decision.

## 9. Open questions

1. **Is any remote not GNU/Linux?** `find -printf` and `stat -c` are GNU. A macOS
   coder workspace would need a BSD branch in the list script.
2. **Main-area route instead of pane tabs (§4.6) — acceptable for v1?**
   *Yes (4 Oct 2026).* Phase 5 is therefore not planned.
3. **Fix `MarkdownText`'s `href` for Copilot too?** *Yes (4 Oct 2026), done
   in phase 3 through `src/lib/safeHref.ts`.* It is the same one-line
   scheme check. It is out of this plan's scope, and the risk there is lower
   because the author of the text is the model.

### 7.2 Phase 2 log (4 Oct 2026)

Built: the four models and migration `20261004120000_remote_sessions`
(`pg_trgm`, the trigram index), `src/lib/claudeSessions/parse.ts` and
`sync.ts`, `src/repositories/remoteSessions.ts`, `requireRemoteHost`,
`refuseOffDesktop`, and the routes under `/api/remote-sessions/hosts` — list
and create, get and forget, then `manifest`, `ingest` and `finish`, the three
steps of a sync. `syncHost` in `packages/desktop/src/remoteSessions.js` drives
those steps, with the HTTP poster injected. **Not wired yet**: the main
process does not call it and `preload.cjs` has no `sessions` bridge. That
wiring is phase 3, along with the UI that would call it.

Verified against a throwaway cluster from the bundled embedded Postgres 17,
with every migration applied. A real sync of `dev@192.168.1.33`, and the same
scripts run locally over this machine's own history:

| | dev host | local history |
| --- | --- | --- |
| files | 1 | 414 (151 subagent runs, all linked) |
| raw JSONL | 286 KB | 428 MB |
| stored chunks (gzip) | — | 94 MB |
| `RemoteEntry` + trigram index | 15 rows | 36,010 rows, 112 MB + 36 MB |
| first sync | 1.3 s | 31 s (ingest 9 s, derive 18 s) |
| second sync, nothing changed | 0.45 s, list only | list only |
| substring search | index scan | 11 ms |

So §6.1's question has an answer for one heavy user: **hundreds of MB, and
the derived side is about the size of the compressed source.**

What it changed from §4:

- **`mtime` is whole milliseconds in a `BigInt`, not a `Float`.** Prisma
  reads `double precision` back at 15 significant digits, so
  `1790088276.2334518` came back as `…233452`. It never compared equal, and
  every sync re-read every file. The first real sync caught it; no spec could
  have.
- **The rewrite check hashes `min(from, 4096)` bytes, not a fixed 4 KiB**, and
  `RemoteFile.head` stores those bytes rather than a hash. A fixed 4 KiB hash
  changes whenever a file under 4 KiB grows, which would have read every young
  session twice. The prefix covers bytes the server already holds, so a match
  means exactly "what I stored is still there". A same-size file with a new
  mtime is sent as a zero-length range: it reads nothing, but returns the hash.
- **Large ranges are read in 4 MiB pieces, and each piece's unfinished line
  carries into the next.** The server stores only through a newline, so
  without the carry every second piece would start past what was stored and
  be refused as stale.
- **Derivation runs once per sync, in `finish`, not once per ingest.** Ingest
  marks a file `parserVersion: 0`, and `finish` re-derives everything behind
  `PARSER_VERSION`. A parser bump and a changed file are therefore one
  mechanism. The cost is that `finish` for a first sync of a large history is
  one long request (18 s above). If phase 3's progress UI makes that visible,
  derive per file during ingest instead.
- **NUL is stripped from `text` and from every string in `body`.** Postgres
  `text` and `jsonb` reject it, and a tool result can contain it.
- **`requireRemoteHost` answers 404 for someone else's host, not 403**, and
  also for a malformed id. A malformed id would otherwise be a Prisma error,
  which is a 500.

### 7.3 Phase 3 log (4 Oct 2026)

Built:

- **Main process.** `remoteSessionsIpc.js` handles `sessions:sync` (UUID
  check first, one sync per host at a time, progress events) on top of
  `remoteSessionsBridge.js`, which has no imports and holds the
  cookie-authenticated client. `preload.cjs` gains `sessions.sync` and
  `sessions.onProgress`, and its docblock makes the narrowness argument §2.2
  asks for.
- **Read routes.** `GET /api/remote-sessions/sessions` (the tree),
  `sessions/[id]` (the header; `DELETE` forgets the session),
  `sessions/[id]/entries?from=&limit=`, and `DELETE hosts/[id]/projects?dir=`.
  Authorization goes through `requireRemoteSession`, which checks via the host.
- **UI** in `src/components/RemoteSessions/`:
  - a fourth `SidebarView` (`sessions`), with an activity-rail button on
    desktop only;
  - a Remote hosts section in Settings;
  - `/sessions` (a landing page with a marked spot for the phase 4 dashboard)
    and `/sessions/[id]`, a transcript virtualised with
    `@tanstack/react-virtual` (MIT, as is its `virtual-core`).
- **Security spec.** `TranscriptEntry.test.tsx` renders the real entry
  components over `<img onerror>`, `javascript:` and `data:` links,
  `<script>`, `<svg onload>` and the contents of an HTML `Write`, and asserts
  that none of it becomes markup.

What it changed:

- **§4.7 assumed the link handlers in `main.js` were already safe. They were
  not.** `setWindowOpenHandler` passed *any* non-app URL to
  `shell.openExternal`, which is `xdg-open`, so a `file://` link could launch
  a `.desktop` file. Both handlers also recognised the app with
  `startsWith(origin)`, which `http://127.0.0.1:PORT@evil.example/`
  satisfies. `links.js` (`linkDisposition`) now compares parsed origins and
  lets only http(s) reach the shell.
- **`src/lib/diff` produces HTML, so the transcript cannot use it.** Edit
  inputs use a small line diff in `transcriptModel.ts` instead.
- **Progress stops at the end of the byte transfer.** Derivation in `finish`
  sends no events, so the UI shows "Indexing…" from `done === total` until
  `sync()` resolves (§7.2's 18 s).
- **Deferred:**
  - find-in-session searches only the pages already loaded, and outlines the
    matching row rather than highlighting the match;
  - pages load in order, with no jumping ahead to an unloaded part;
  - "add one in Settings" is text, not a button, because whether Settings is
    open is local state inside `RightRail`.
- **Not verified: any of it on screen.** Nothing has run inside Electron, so
  the IPC round trip, a sync through the real cookie, row measurement in the
  virtualiser, both colour schemes, and whether links open in the system
  browser are all unchecked. That is the same compositor limit as §6.3.

### 7.4 Phase 4 log (4 Oct 2026)

Built:

- **Routes.** `GET /api/remote-sessions/search` and `GET
  /api/remote-sessions/stats`. Their contract is in
  `src/lib/claudeSessions/types.ts`, and their parameter parsing, LIKE
  escaping, snippet cutting and zero-fill helpers are in `search.ts` and
  `stats.ts`, which have no imports.
- **Search UI.** In the Sessions sidebar, the filter box turns into a
  transcript search: a toggle, or Enter. Results are grouped by session, and a
  hit opens `/sessions/<id>?entry=<idx>&q=`, which loads the page holding that
  entry and highlights the query.
- **Stats dashboard** on `/sessions`.

Measured on this machine's history: 418 files, 36,437 entries, 433 MB raw, a
40 MB trigram index.

| Query | Time | Hits |
| --- | --- | --- |
| rare term (`remoteSessions`) | 17 ms | 173 |
| common word (`the`) | 129 ms | 1000, truncated |
| stats, all hosts | 3–4 ms | — |

The plan uses `RemoteEntry_text_trgm_idx` both for literal queries and for
the generic plan (`like_escape($2,'\')`).

What it decided, where §4.9 and §4.10 were silent:

- **LIKE metacharacters are escaped.** Searching `foo_bar`, `100%` or
  `back\slash` matches only that literal text, checked against real rows.
- **Thinking is excluded unless `thinking=1`, or unless `kind=thinking` is
  asked for explicitly.** Otherwise that explicit filter would always return
  nothing.
- **Subagent runs never count as sessions.** They are also left out of
  prompts, active time, sessions per day and prompts by hour: a run's "prompt"
  comes from its parent, not from the user, and its active time overlaps the
  parent's. They do count towards assistant messages and tools, as the work
  they did. So the tool breakdown sums to `toolCalls`.
- **`tz` must be an IANA name.** Offsets like `+05:00` are refused: Postgres
  reads a bare offset in `AT TIME ZONE` with the opposite sign from ISO.
- **The charts are drawn with MUI boxes, not `@mui/x-charts`.** That library
  takes colours as JS values, which would fix one scheme's colour in both
  (DESIGN.md §19).

Deferred:

- search has no project filter in the UI, though the route and fetcher
  support one;
- find-in-session still searches only the pages already loaded.

**Not verified:** anything over HTTP or on screen, the same limit as §7.3.
The queries ran against the scratch cluster through the repository, not
through the routes.
