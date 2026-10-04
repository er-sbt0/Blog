# Remote Claude Code sessions

**Status: proposal, 4 Oct 2026. Nothing is built.** A read-only browser for the
Claude Code transcripts on remote machines — view, browse, toggle, search, and
stats — in the desktop app. It ports `~/code/claude_remote` (a Python/Textual
TUI over `coder ssh`) into the shell, with an incremental sync into the embedded
Postgres in place of a full dump per launch, and the content **encrypted at
rest** (§4.5).

The scope was set by eleven answers given on 4 Oct 2026; §1 records them, so
that a later reader can tell a decision from a default. Two of them this plan
does not follow as given, and says so where it departs: §4.6 (sessions open in
the main area, not as pane tabs) and §4.5 (encrypted, not plaintext — taken back
by the author the same day on company policy grounds).

Read §2 before anything else. §2.1 is why a session cannot simply be a pane tab,
§2.4 is why the transcript renderer is a security surface rather than a styling
job, and §2.5 is the trap that would make §4.5's encryption silently worthless
on the machine this was asked from.

This is a **desktop-only** feature by construction (§3). The VPS build answers
404 for every route it adds.

---

## 1. What is being asked

> We want to introduce the same concept into our desktop app: fetch, lay out,
> organise etc. the content of Claude Code sessions from a remote ssh machine.
> … We just want a nice way to view, browse, toggle, search, etc. Claude Code
> sessions.

Answered on 4 Oct 2026:

| Question         | Answer                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where data lives | **Postgres cache** in the embedded cluster; the remote JSONL stays the source of truth                                                                   |
| Transport        | Author's call, noting `ssh coder.main` already goes through the coder CLI via `~/.ssh/config`. Taken as **system `ssh <alias>` only** (§4.1)             |
| Freshness        | **Incremental, on demand** — a Sync that pulls only what changed                                                                                         |
| UI surface       | **Activity-rail view** (host → project → session) **plus pane tabs** for transcripts. The second half is revised in §4.6                                 |
| Organising       | **None.** No tags, pins, renames or notes — viewing, browsing, toggling and search only                                                                  |
| v1 features      | **Transcript viewer, full-text search, stats dashboard.** Not export                                                                                     |
| MCP access       | **Not in v1** — the in-app terminal's agent cannot read these                                                                                            |
| Scope            | **Desktop only**                                                                                                                                         |
| At rest          | First answered "plaintext in local Postgres"; **changed to encrypted** the same day, because company policy requires AES-256-GCM for sensitive data (§4.5) |
| Hosts            | **Many, user-added** — alias plus display name, grouped by host in the explorer                                                                          |
| Deletions        | **Keep locally** — a "gone from remote" badge and a manual Forget                                                                                        |

Taken literally, "organise" was answered no. What survives is *layout*: group by
host and project, sort by recency, filter by text. Nothing a user does in this
view writes anything except a sync.

## 2. What the tree permits

Six findings, gathered before designing.

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

### 2.5 `safeStorage` on Linux can quietly be plaintext

Electron's `safeStorage` wraps keys with the OS keyring — libsecret / kwallet on
Linux. When neither is reachable it falls back to the **`basic_text`** backend,
which "encrypts" with a hard-coded key. `isEncryptionAvailable()` still returns
`true`. The only way to know is
`safeStorage.getSelectedStorageBackend()`.

This question was asked from WSL2, where a desktop keyring is commonly absent.
A design that trusted `isEncryptionAvailable()` would wrap the data key with a
constant compiled into Electron, and every check in this plan would pass. §4.5
refuses `basic_text` by name.

### 2.6 A transcript is a tree, and `claude_remote` reads it as a list

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
                                 │ POST chunks ───────▶ Next: parse, seal, store
                                 ▼
 /sessions/... ◀────────── GET /api/remote-sessions/* (decrypt, render data)
```

- **The main process owns ssh** (§2.3) and nothing else. It never parses a
  transcript and never touches the database: it moves bytes from the remote host
  to a loopback route, authenticated with the session cookie it already mints
  for the window (`session.js`).
- **The Next server owns the data**, behind `userRoute` and new repositories,
  like every other table. It parses, seals and serves. This keeps `access.ts`'s
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

The policy concern is direct: a value the user typed becomes part of a spawned
process. Three things together make that safe.

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
     rewritten: drop its chunks and want `[0, size)`;
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
§9 question 2.

Budget: the ingest route takes at most 8 MiB per POST, and the main process
batches chunks to fit. A first sync of a large history is many POSTs and one
ssh read. Progress goes back over `onProgress`.

### 4.4 Storage — raw bytes are the source of truth, everything else is derived

```prisma
model RemoteHost {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  alias       String    // §4.2 — validated, not sealed: it is a name in ~/.ssh/config
  label       String
  lastSyncAt  DateTime? @db.Timestamptz
  lastError   String?   // ssh's stderr, truncated; never transcript content
  createdAt   DateTime  @default(now()) @db.Timestamptz
  files       RemoteFile[]
  @@unique([userId, alias])
}

model RemoteFile {            // one .jsonl = one session or one subagent run
  id           String    @id @default(uuid()) @db.Uuid
  hostId       String    @db.Uuid
  pathKey      Bytes     // HMAC-SHA256(macKey, relative path) — lookup without plaintext
  pathSealed   Bytes     // the path itself, sealed (it encodes the cwd)
  size         BigInt
  mtime        Float
  consumed     BigInt    // bytes up to the last newline
  headHash     Bytes     // SHA-256 of the first 4 KiB, to detect rewrites
  goneAt       DateTime? @db.Timestamptz
  isSubagent   Boolean
  parentFileId String?   @db.Uuid
  // Derived at ingest, plaintext because it is numbers and tool names:
  startedAt    DateTime? @db.Timestamptz
  endedAt      DateTime? @db.Timestamptz
  activeMs     Int
  userMsgs     Int
  assistantMsgs Int
  toolCalls    Int
  tools        Json      // { "Bash": 41, "Read": 17, … }
  promptTimes  DateTime[] @db.Timestamptz  // prompts-by-hour, without the prompts
  metaSealed   Bytes     // { title, cwd, gitBranch, projectPath, firstPrompt }
  chunks       RemoteChunk[]
  @@unique([hostId, pathKey])
}

model RemoteChunk {
  id      String @id @default(uuid()) @db.Uuid
  fileId  String @db.Uuid
  seq     Int
  offset  BigInt
  sealed  Bytes  // gzip, then AES-256-GCM
  @@unique([fileId, seq])
}
```

Stored this way because:

- **Raw chunks, not parsed entries.** A parser fix (and there will be several,
  since the format changes between Claude Code versions — `model.py` says so)
  re-derives from what is stored, without fetching again. The stats columns are
  recomputed by re-parsing the whole file at ingest. That is affordable because
  ingest only touches changed files.
- **Sealing covers everything derived from content.** That includes the title,
  since it falls back to the first prompt, which is where people paste tokens;
  the cwd and branch, which name customers' repos; and the path, which encodes
  the cwd. What stays plaintext is counts, timestamps, tool names, and the ssh
  alias.
- **The AAD binds each ciphertext to its row**, as `credentialAad` does for
  provider keys (`src/lib/providerCredentials/crypto.ts`): `fileId‖seq‖offset`
  for a chunk, `fileId‖"meta"` for metadata. Chunks copied between rows fail to
  open.

`crypto.ts` is import-free and already does AES-256-GCM with a 96-bit IV and a
full tag. **Reuse its seal/open functions.** Do not reuse its keyring, which
reads `AI_CREDENTIAL_KEYS` (§4.5).

### 4.5 Keys — a random data key, wrapped by the OS keyring, never `basic_text`

The author first chose plaintext. It was changed to encrypted on 4 Oct 2026
because the company's Data Protection policy requires AES-256-GCM for sensitive
data at rest, and transcripts routinely contain credentials (`Read` of a `.env`,
a pasted token) and output from customer environments.

- On first use the main process generates 64 random bytes. The first 32 are the
  AES-256-GCM data key and the last 32 the HMAC key for `pathKey`. It wraps them
  with `safeStorage.encryptString` into `userData/remote-sessions.key` (0600).
- **Before wrapping, and on every unwrap, it checks
  `safeStorage.getSelectedStorageBackend()`.** `basic_text`, or `unknown`, means
  the feature is **unavailable**, and the view says why: "no OS keyring
  (gnome-keyring / KWallet) is running, so sessions cannot be stored encrypted".
  There is no plaintext fallback and no "store it anyway" button (§2.5).
- The unwrapped key goes to the Next child as `REMOTE_SESSIONS_KEY` in
  `serverEnv`. That is the same channel and the same exposure as
  `NEXTAUTH_SECRET` and the cluster password: `/proc/<pid>/environ`, readable
  only by this uid. `serverEnv.test.ts` gains the assertion that it is passed
  only when the shell set it, and is blanked otherwise, so a traced `.env` can
  never supply it.
- **A lost key is lost data, by design.** If the keyring entry is gone (new
  machine, profile reset), unwrap fails and the view offers exactly one action,
  "Forget cached sessions and re-sync". The remote is the source of truth, so
  this costs a sync, except for files that are already `goneAt` (§4.8). That
  loss is stated in the dialog.

**This is a policy question as well as a design one.** The policy names cloud
KMS and HashiCorp Vault as approved key stores. An offline desktop app cannot
reach any of them, and the OS keyring is the platform equivalent. It still needs
confirming with security before this ships: §9 question 1.

Search consequence: there can be no Postgres full-text index, because the text
is not in Postgres. §4.9.

### 4.6 Placement — a sidebar view and a `/sessions` route, not pane tabs

The author asked for pane tabs. This plan proposes the main area instead, as a
route, and asks for that to be confirmed (§9 question 3):

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
  whether Copilot output needs it too (§9 question 4).
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

Long sessions need **virtualised rendering**. 2000+ entries as MUI elements is
too slow to scroll, and there is no list virtualiser in `package.json` today, so
this is a dependency decision. `@tanstack/react-virtual` is MIT; the licence
check is part of phase 3. Results are clipped at 200 lines in the viewer, as in
`transcript.py`, with "show all" in place of "export to see all".

All states DESIGN.md requires: loading (skeleton rows), empty ("No sessions on
this host yet — Sync"), error (ssh's message, verbatim and truncated), and
unavailable (§4.5's keyring message, and "the web build has no sessions").

### 4.8 Deletions — keep, badge, forget

Claude Code prunes transcripts after `cleanupPeriodDays` (30 by default). A file
the manifest no longer lists gets `goneAt`, keeps every byte, and shows a "gone
from remote" badge. **Forget** is per session, per project and per host. It is
the only delete in the feature, and it is irreversible for a gone file, so it
confirms and says so. Removing a host forgets everything under it, with the same
confirmation.

Postgres frees the space on vacuum. Forgotten ciphertext is unreadable without
the key anyway, but this plan does not claim more than that.

### 4.9 Search — decrypt and scan, in the server, with a bound

There is no plaintext to index (§4.5), so search works as `model.search` does:
decrypt, parse, lower-case, `includes`. It runs in the Next server, never in
the renderer, because the renderer should not hold every transcript at once.

- `GET /api/remote-sessions/search?q=` streams results newest session first and
  stops at 1000 matches. Each result has session, entry index, kind and a
  ±40-character snippet. Clicking one opens the session at that entry with the
  match highlighted.
- A per-process LRU of parsed, lower-cased sessions (keyed by `fileId` and
  `consumed`) holds up to 256 MiB, so a second search is a scan, not a decrypt.
  That memory is plaintext in use, not at rest. It is never written to disk, and
  it is dropped on Forget and on exit.

How fast this is depends on how big a real history is, and nobody has measured
that (§6.1). If a full scan is too slow, the next step is a **sealed
token index** (HMAC of each lower-cased word → file ids) rather than plaintext
`tsvector`. It is deliberately left out of v1.

### 4.10 Stats — computed at ingest, aggregated in SQL

Every number `report.py` shows can be computed from the plaintext columns in
§4.4 without decrypting anything except project names. That covers totals,
per-project sessions, subagent runs, messages, tools, active time, first and
last, the 30-day sessions-per-day sparkline, prompts by hour, and the tool
breakdown. `/sessions` renders them with MUI and the existing chart conventions
(`dataviz` guidance). It can be filtered by host.

## 5. What changes, by file

| Where | What |
| --- | --- |
| `prisma/schema.prisma` + a migration | §4.4's three models |
| `packages/desktop/src/remoteSessions.js` | spawn, the two fixed scripts, framing, batching to the ingest route |
| `packages/desktop/src/sessionsKey.js` | §4.5: generate, wrap, unwrap, refuse `basic_text` |
| `packages/desktop/src/preload.cjs` | `sessions.sync(hostId)`, `sessions.onProgress`, `sessions.status()` |
| `packages/desktop/src/server.js` | pass `REMOTE_SESSIONS_KEY`; add to the blanked list otherwise |
| `src/lib/claudeSessions/parse.ts` | port of `model.parse_session`, import-free |
| `src/lib/claudeSessions/sync.ts` | manifest diff and newline-boundary consumption, import-free |
| `src/lib/claudeSessions/seal.ts` | key from env, AAD builders, over `providerCredentials/crypto.ts` |
| `src/repositories/remoteSessions.ts` | rows; owner-scoped only, no public variant exists |
| `src/lib/access.ts` | `requireRemoteHost`, `requireRemoteSession` |
| `src/lib/api-utils.ts` | `refuseOffDesktop` |
| `src/app/api/remote-sessions/**` | hosts CRUD, manifest, ingest, list, session, search, stats — all `userRoute`, all `parseBody`, all `.strict()` |
| `src/components/RemoteSessions/` | sidebar tree, transcript, dashboard |
| `src/app/(workspace)/sessions/` | the two routes |

## 6. What this plan has not verified

### 6.1 How big a real history is

`claude_remote` loads everything into memory in one go and works, but nobody has
measured `~/.claude/projects` on `coder.main`. §4.9's scan and §4.3's first sync
both depend on that number. Phase 1 measures it before phase 3 builds on it.

### 6.2 Whether the WSL2 environment has a keyring

§2.5 says it commonly does not. If it does not, this feature is unavailable on
the machine it was asked from until gnome-keyring is running. Phase 1's first
check is `getSelectedStorageBackend()` there.

### 6.3 That `BatchMode=yes` works with coder's `ProxyCommand`

It should, because coder authenticates with its own token and not ssh's prompt.
It has not been tried. If it fails, the error must say so, and not report
"permission denied".

### 6.4 What it looks like

Same compositor limit as `desktop-app.md` and `in-app-terminal.md`.

## 7. Phases

1. **Spike: reach and measure.** Write `sessionsKey.js` with the `basic_text`
   refusal, and `remoteSessions.js` able to list and read one host, printing
   counts and bytes. No database. Answers §6.1–§6.3. The gate: if there is no
   keyring and none can be run, stop and go back to the author before phase 2.
2. **Schema, parse, sync.** The models, `parse.ts` and `sync.ts` with specs, the
   ingest and manifest routes, and `seal.ts`. The specs use **synthetic
   fixtures written by hand**. A real transcript must never be committed: it is
   exactly the data §4.5 encrypts. They cover the `model.py` rules in §2.6,
   truncation at the last newline, the rewrite detection, AAD swap refusal, and
   `refuseOffDesktop`.
3. **Browse and view.** The sidebar view, host management in Settings, the
   transcript route with §4.7's renderer, and the virtualiser (licence checked).
   Includes a spec that feeds a transcript containing
   `<img src=x onerror=…>`, a `javascript:` link and an HTML file's contents, and
   asserts none of it becomes markup.
4. **Search and stats.** §4.9 and §4.10.
5. **Optional: sessions in panes.** Only if §9 question 3 says the split matters.
   This is the §2.1 refactor.

## 8. Out of scope

- Tags, pins, renames, notes, links to posts (§1).
- Export to Markdown or to a post (§1). `transcript.export_markdown` is the
  reference if this comes back.
- Agent access through MCP (§1). When it comes back, it is a decision about
  showing secrets to an agent, not a wiring task.
- Live tail of a running session.
- The VPS build.
- The branch-aware view of §2.6. v1 renders both branches in file order, as
  `claude_remote` does.
- The machine's own `~/.claude/projects`. Adding a host whose alias is
  `localhost` works if sshd runs; a native local source is a later decision.

## 9. Open questions

1. **Does the OS keyring meet the key-storage requirement?** The policy lists
   cloud KMS and Vault. Ask security whether a desktop app's
   libsecret/KWallet-wrapped key is acceptable, or whether an exception is
   needed. This blocks shipping, not building.
2. **Is any remote not GNU/Linux?** `find -printf` and `stat -c` are GNU. A macOS
   coder workspace would need a BSD branch in the list script.
3. **Main-area route instead of pane tabs (§4.6) — acceptable for v1?**
4. **Fix `MarkdownText`'s `href` for Copilot too?** It is the same one-line
   scheme check. It is out of this plan's scope, and the risk there is lower
   because the author of the text is the model.
