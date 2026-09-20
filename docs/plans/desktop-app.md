# Desktop app

**Status: proposed, 20 Sep 2026. Nothing built.** The two product questions are
answered — **local-first with the VPS optional**, and **Linux only** for the
first release — and §3 is a recommendation, not a decision taken. §2 is the part
that is not opinion: it is what the tree says, and it is what rules out the
cheaper shapes.

---

## 1. What is being asked

A desktop application, such that writing works with no network and no server.
The VPS deployment (`production-deployment.md`) stays, as the place posts are
published and read by other people. Synchronising the two is **explicitly out of
scope for v1** — §7 says why that is a separate plan rather than a deferred
section of this one.

"Local-first" here means the desktop app owns a complete copy of the product,
not a subset of it. That is the constraint that decides the architecture, so it
is worth being precise: a desktop build must support series, projects, notes
canvases, blobs, attachments, proposals and the Copilot — everything a signed-in
user has today — not merely the editor.

## 2. What the tree permits

Three findings, gathered before designing anything. The first two close off the
two architectures that would otherwise be obvious.

### 2.1 The client cannot stand alone

There are 66 API route handlers under `src/app/api/`. Six of the fourteen pages
do server-side work — `getServerSession` plus a repository call — rather than
merely rendering a client tree: `(workspace)/posts/[[...id]]`,
`(workspace)/new/[[...id]]`, `(workspace)/series/[id]/edit`,
`(public)/view/[id]`, `(public)/user/[id]` and `embed/[id]`.

The dual-storage seam (`src/store/backend/`) looks like a head start on a
serverless client and mostly is not. `localBackend` implements the
`PostBackend` interface — `list`/`get`/`children`/`create`/`update`/`delete`/
`move`/`reorder`/`rootOrder` and the three revision operations — and that
interface covers **posts and revisions only**. `local.ts` states the gap in its
own docblock: "a guest has no series and no projects". Notes canvases, blobs,
attachments, proposals and the agent rail, Copilot threads, export/import and
docx have no local implementation at all, because a guest has never had them.

So "ship the existing client in a window and let it use IndexedDB" is not a
packaging exercise. It is a second implementation of most of the product,
against a storage engine with no joins, maintained in parallel with the first
one forever. Refused.

### 2.2 Postgres is load-bearing — no SQLite port

The tempting move for a local database is Prisma + SQLite. It does not survive
contact with this schema.

- **Six `String[]` columns**, and they carry the entire ordering model:
  `User.rootOrder`, `Series.postOrder`, `Project.seriesOrder`,
  `Document.tabOrder`, `Revision.blobHashes`, `AgentToken.scopes`
  (`prisma/schema.prisma:24,51,117,213,261,317`). **Prisma does not support
  scalar lists on SQLite.** Every one of these would become a join table or a
  serialised string, which means rewriting `src/repositories/ordering.ts`,
  `src/lib/orderArray.ts`'s callers and the `reorder` half of the backend seam —
  and doing it in a way that diverges permanently from the server the same code
  has to keep running against.
- **`pg_notify` / `LISTEN`** is the change feed's first two hops
  (`src/lib/changes/notify.ts`, `src/lib/changes/listener.ts`). SQLite has no
  equivalent, so the feed would need a second transport for the desktop build.
- **A partial unique index** enforces one pending proposal per document
  (`prisma/migrations/20260806181119_add_revision_proposals/`). That invariant is
  the agent-gating design's spine; in SQLite it becomes application code, which
  is exactly what the index exists to avoid.
- `@db.Uuid`, `@db.Timestamptz` throughout, and a `$queryRaw` aggregate in
  `src/repositories/document.ts:792`.

Keep Postgres. The cost of carrying a database binary is a one-time packaging
problem; the cost of a second data layer is permanent.

### 2.3 What is already a seam

Three things in the tree make the recommended shape cheaper than it sounds:

- **`output: "standalone"`** is already set (`next.config.ts`), and the
  `Dockerfile` already solves the packaging half. Lines 62–71 copy exactly the
  set an installer needs: `.next/standalone`, `.next/static`, `public/`, plus
  `node_modules/.prisma`, `node_modules/@prisma`, `node_modules/prisma` and
  `prisma/` so migrations can be applied against the bundle. An Electron
  `extraResources` list is the same list.
- **`src/lib/storage.ts` is the only blob seam**, and its surface is six
  functions: `putBlob`, `getBlob`, `blobExists`, `deleteBlob`, `hashBytes`,
  `isStorageConfigured`. `presignBlobGet` is the seventh and **has no callers** —
  `/api/blob/[hash]` streams bytes through `getBlob`, so there is no presigned-URL
  shape for a filesystem implementation to imitate.
- **`src/lib/uploads.ts`** already puts attachments on the local filesystem under
  a configurable root, and already refuses to live under `public/`. On desktop it
  needs a different root, not different behaviour.

## 3. The shape

**Electron. The main process runs the existing `.next/standalone` server against
a Postgres cluster in the user's data directory; the window is a `BrowserWindow`
pointed at `http://127.0.0.1:<port>`.**

No schema port, no second data path, no change to the 66 route handlers or to
`src/lib/access.ts`. The desktop build and the VPS run the same server code
against the same schema; what differs is four adapters (§4) and a set of
disabled features (§5).

### 3.1 Process model

```
Electron main (Node)
├── embedded Postgres cluster   ~/.local/share/<app>/pgdata
├── prisma migrate deploy       on boot, before the server starts
├── next standalone server.js   127.0.0.1, ephemeral port
└── BrowserWindow ──────────────► http://127.0.0.1:<port>
```

The server is a child process rather than an in-process import: `server.js`
expects to own `process.env.PORT`/`HOSTNAME` and to be the process that exits,
and keeping it separate means a crashed server can be restarted without taking
the window with it.

### 3.2 Electron, not Tauri

Two reasons, and the first is sufficient.

The renderer must run Lexical, MathLive, Excalidraw, Shiki and the editor's
vanilla-extract chrome. All of it has been developed and verified against
Chromium only (see `verify-ui-in-browser`). Tauri on Linux is WebKitGTK; adopting
it means re-qualifying the entire editor on an engine nothing here has ever been
tested against, to save binary size on a single-user writing tool.

Second: a Node runtime is needed in the main process anyway, to run the Next
server and the Prisma CLI. Tauri would need that shipped as a sidecar binary,
which gives back most of the size advantage.

## 4. The four seams

In build order. Each is small; the risk is concentrated in §4.1.

### 4.1 Postgres

**Recommendation: `embedded-postgres`** — a real, `initdb`-ed cluster in
userland, started and stopped by the main process. ~35–60 MB of binaries per
platform.

The alternative is **PGlite** (`@electric-sql/pglite`, via Prisma's driver
adapter), which is smaller and needs no process supervision. It handles array
columns, so §2.2's first bullet survives. It is rejected on the second: PGlite is
**in-process**, and `LISTEN`/`NOTIFY` here has to cross process boundaries —
`src/lib/changes/events.ts` names two subscribers, the Next server *and* the
`mcp/` stdio process, and `listener.ts` is built on one long-lived `LISTEN`
connection per process. A single-process database cannot serve that without a
second transport, which is the same objection as §2.2.

A real cluster also keeps the desktop build on the same major version as
production (17, pinned in all three compose files). It does **not** give parity
with `ops/`'s restore drill: the package ships three binaries — `initdb`,
`pg_ctl`, `postgres` — and **`pg_dump`, `pg_restore` and `psql` are not among
them** (§10.2). A desktop backup is therefore a file-level copy of a stopped
cluster, or a separately shipped `pg_dump`, and that is a decision this plan
does not take.

**Verified 20 Sep 2026 — the spike passed, 7/7. See §10.**

### 4.2 Auth

NextAuth's OAuth flow cannot round-trip in a desktop shell: `GITHUB_CLIENT_ID`
and friends are deployment credentials, and there is no public callback URL.

`src/lib/auth.ts` already registers providers from whichever credentials are
present, and already logs an error and serves an empty list when none are — so a
desktop build configures **no** OAuth provider without modification. What it adds
is a local session: one `User` row seeded on first launch, and **a real
`Session` row plus the cookie that names it**, minted by the Electron shell.

The provider this section originally proposed is **not available** — phase 3
established that against the library rather than by argument (§12.1). NextAuth
v4's `core/lib/assert.js` returns `UnsupportedStrategy` whenever an adapter is
configured and credentials are the only provider, which is exactly the desktop
case, so a Credentials provider would force `session.strategy = "jwt"` for this
build alone. The session-row shape avoids that, and satisfies the second rule
below *by construction* rather than by discipline: there is nothing above the
seam to change, and `src/lib/auth.ts` is untouched.

Two rules, because this is the one seam that can weaken the whole authorization
model:

- **Gate it on an explicit `DESKTOP=1`**, checked in `configuredProviders()`
  alongside the two OAuth branches. Not on "no OAuth configured", which is a
  condition a misconfigured VPS also satisfies.
- **Change nothing above it.** `userRoute`, `optionalUserRoute`, `context.user`
  and every rule in `src/lib/access.ts` keep working unmodified, because what
  they receive is the same `SessionUser` shape from the same `session` callback.
  Phase 3 met this exactly: zero lines changed under `src/`.
- **Mind the cookie name.** `next-auth/utils/parse-url.js` prepends `https://`
  to any `NEXTAUTH_URL` without a scheme, and the `__Secure-` prefix follows
  from that. A scheme-less value therefore makes the server look for a cookie
  Chromium will never send over loopback http — and the symptom is a window
  showing the signed-out experience with a completely clean boot log (§12.3).
  The desktop build must not acquire a "skip the check when local" branch
  anywhere; a single-user machine is not a reason to stop authorizing, and the
  moment it is one the two builds stop being the same product.

**§4.2 was wrong as written, and phase 2 found it (§11.3).** The claim above —
that a desktop build "configures no OAuth provider without modification" because
no credentials are present — holds only for a clean environment. `next build`
traces the working tree's `.env` into `.next/standalone/.env`, and `@next/env`
fills in every variable the child process has not already defined. So
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` arrive anyway and
`configuredProviders()` registers GitHub. The child's environment must therefore
be *closed* — built explicitly, not inherited — with every traced key the desktop
build must not see blanked to `""`.

`tokenRoute` and `AgentToken` are unaffected — see §5.

### 4.3 Blobs

Running MinIO on a laptop is absurd. Write a filesystem implementation behind
the six-function surface in §2.3: content-addressed files under the user data
directory, `<blobs>/<hash[0:2]>/<hash>`, selected by the same
`isStorageConfigured` branch that exists today.

This is genuinely small because content addressing already did the hard part —
writes are idempotent, objects are immutable, and nothing in the app holds a
URL that names the store. `blob-storage.md` §11.1 retired an earlier local blob
store; note that it did so because the *guest* path did not need one, which is a
different question from this one.

Attachments need only a new `UPLOADS_DIR` (§2.3).

### 4.4 First run and migrations

On boot, in the main process, in order: ensure the cluster exists (`initdb` on
first launch), start it, run `prisma migrate deploy` against it, seed the local
`User` row if the table is empty, then start the server. The Prisma CLI and the
`prisma/` directory ship in `extraResources` for exactly this, as they do in the
image today.

Failures here are the app failing to start, so they need a real error window
rather than a console line — a silent failure at this stage looks identical to a
hung splash screen.

## 5. What a desktop build turns off

Each of these is a feature whose premise is a public server. Leaving them on is
not neutral; most fail confusingly rather than harmlessly.

- **The service worker.** `next-pwa` is enabled whenever `NODE_ENV=production`,
  which a packaged build is. Its `runtimeCaching` includes a `NetworkFirst` rule
  over `/api/.*` with a 10-second timeout — against a local server that is a
  pure liability, and a stale-data hazard the first time the server restarts
  under the window. Disable it in the desktop build, and drop `/offline` with it.
- **`/api/mcp` and `AgentToken`.** The remote endpoint exists so an agent
  elsewhere can reach the content; on desktop the stdio server is right there
  (§6). Ship the route disabled rather than listening on loopback with bearer
  tokens.
- **The rate limiter** on the same route, by consequence.
- **`PUBLIC_URL`, OG images, `/api/revalidate`, `robots`/`sitemap`.** All of them
  describe a site at a public address. Audit what reads `PUBLIC_URL` and give it
  a defined answer for the local case rather than an empty string.
- **The public routes** — `/view/[id]`, `/user/[id]`, `/embed/[id]` — are
  harmless but meaningless locally. Decide deliberately whether they stay (they
  are how you preview what a published post looks like, which is an argument for
  keeping them).
- **The sign-out affordance.** With no OAuth provider there is no way back in,
  so signing out strands the window in the guest experience until the app is
  quit. Phase 3 made the shell detect it and restore the session with a dialog
  rather than silently, but removing the button is the real answer and it is a
  change above the seam, which puts it here (§12.4).
- **`.next/standalone/.env` must never ship.** `next build` traces the working
  tree's `.env` into the bundle, so an installer built from a developer's machine
  would distribute that developer's real `GITHUB_CLIENT_SECRET`. `.dockerignore`
  is what protects the Docker path; **nothing protects an Electron one**, and
  this is a credential disclosure rather than a misconfiguration. Phase 6 strips
  it, and should fail the build if it is present (§11.3).

## 6. What gets better

Worth naming, because they are reasons to want this beyond offline writing:

- **The MCP stdio server becomes native.** `mcp/content-server.ts` already runs
  against the local database with `MCP_AUTHOR_ID`; on desktop that is the only
  author. No tokens, no 426 rule, no HTTP transport — the whole of
  `mcp-support.md`'s remote half becomes optional rather than load-bearing.
- **PDF export becomes reachable again.** Electron has its own Chromium, so
  `printToPDF` needs neither Puppeteer nor `BROWSERLESS_URL`. (Note that
  `src/app/api/pdf/` does not currently exist, despite CLAUDE.md listing it —
  that route is gone, and there is no puppeteer dependency in `package.json`.)
- **Attachments by drag from the file manager**, and a real file dialog for
  import/export bundles.
- **A backup story at one-machine scale** — the blob directory plus the
  cluster. Not `pg_dump` for free, though: §10.2 found that binary is not in the
  package.

## 7. Out of scope: sync

If the desktop app and the VPS ever need to hold the same posts, that is a
distinct plan and a large one. It has to answer: how two edits to the same
Lexical document reconcile, what a revision chain means when two of them exist,
what happens to a pending proposal created on one side and approved on the
other, and what `headRevisionId`'s compare-and-set means across two databases.

The only precedent in the tree is `importGuestDrafts`, and it is one-way and
destructive by design — it copies each draft up and then deletes the local one.
That is the right shape for a guest signing in, and the wrong shape for two
libraries that both continue to exist.

For v1 the answer is **export/import**: the `/api/export` and `/api/import`
bundle pair already round-trips documents with their blobs, and it is honest
about being a copy rather than pretending to be a sync.

## 8. Phases

1. ~~**Spike the database** (§4.1).~~ **Done 20 Sep 2026 — passed, §10.**
   The cluster initdb's, starts, takes all 48 migrations, and the three
   load-bearing Postgres features all hold. Phase 2 is unblocked.
2. ~~**Boot the stack under Electron** (§3.1, §4.4).~~ **Done 20 Sep 2026 —
   §11.** `packages/desktop` boots cluster → migrations → server → window, with
   `/api/health` as the gate. Warm launch is 1.9 s. Auth is a seeded row.
3. ~~**Local auth** (§4.2).~~ **Done 20 Sep 2026 — §12.** The shell mints a
   `Session` row and sets the cookie; `src/` is untouched. Verified: a valid
   session is 200, absent/forged/truncated are 401, and a `disabled` user is
   403 through the ordinary `requireUser` path.
4. **Filesystem blobs and uploads** (§4.3).
5. **Strip the server-only features** (§5).
6. **Package** — electron-builder, AppImage and `.deb`. Unsigned for a first
   release; there is no distribution channel yet that requires otherwise.
7. **Desktop affordances** — menu bar, window state, `printToPDF`, native file
   dialogs (§6).

Phases 1–2 are the risk. 3–5 are small and independent of each other.

## 9. What this plan has not verified

Stated rather than assumed, in the order they could derail phase 1:

- ~~That `embedded-postgres` runs unprivileged and survives Electron's resource
  packaging.~~ **Answered, §10.** It runs unprivileged, relocates cleanly
  (RUNPATH is `$ORIGIN/../lib`) and tolerates spaces in both paths. The
  packaging risk is real but specific and named: §10.3's symlinks.
- Whether `@prisma/client`'s query engine binary packages as cleanly as the
  schema engine did. The spike proved `migrate deploy`; the app uses a different
  engine, though the `Dockerfile` already ships both.
- That `.next/standalone`'s `server.js` starts correctly as an Electron child
  process with an ephemeral port, given the vendored `next-pwa` wrapper and
  `distDir` handling.
- That disabling the service worker in a production build is a config change
  rather than a fork of `next-pwa/index.js`.
- Which modules read `PUBLIC_URL` and what each does with an unset value (§5).
- Whether the workspace's six server-rendering pages have any behaviour that
  depends on a non-loopback origin.

---

## 10. Phase 1 log — the database spike, 20 Sep 2026

**Result: passed, 7/7.** `embedded-postgres` is confirmed as §4.1's choice, and
phase 2 is unblocked. The spike ran outside the repo, against a staged copy of
`prisma/schema.prisma` + `prisma/migrations` with no `.env` in scope — deliberately,
so there was no path by which it could reach the `postgres-blog` container on
5432, and so that it was simultaneously a test of §4.4's real question: can
migrations be applied from a bundle that is not the repo. They can.

### 10.1 What was measured

| | |
| --- | --- |
| `initdb` (first launch only) | **353 ms** |
| `start` (cold) | **13 ms** |
| `start` (warm, existing cluster) | **13 ms** |
| `createdb` | 27 ms |
| `prisma migrate deploy`, all 48 migrations | **815 ms** |
| binaries on disk (linux-x64) | **60 MB** |
| cluster on disk, empty | 42 MB |
| resident memory, idle | ~131 MB |

So a first launch spends about **1.2 s** on the database before the Next server
starts, and every launch after that spends **13 ms**. That is comfortably inside
what a splash screen covers, and it removes the argument for PGlite on startup
cost.

Version is **PostgreSQL 17.10** — same major as the 17.2 development container
and the production pin, which is the property §4.1 wanted.

### 10.2 The three load-bearing features, checked directly

Each of §2.2's claims was asserted against the live cluster rather than assumed:

- **`String[]` round-trip** — `rootOrder` written and read back as
  `["a","b","c"]`. The ordering model works untouched.
- **`LISTEN`/`NOTIFY` across two separate connections** — a `LISTEN`er on one
  backend received a `pg_notify` issued on another, payload intact. This is the
  check PGlite cannot pass, and the reason §4.1 chose as it did.
- **The partial unique index** — a second pending proposal on the same document
  was refused with `23505`, from the hand-written migration. The agent-gating
  invariant holds in an embedded cluster.

Plus: 17 tables created, 37 `timestamp with time zone` columns present
(`schema-organization.md` phase A survived), and data written before a `stop()`
was still there after a restart that skipped `initialise()`.

**One finding that contradicts this plan as written**, now corrected in §4.1 and
§6: the package ships **three binaries only** — `initdb`, `pg_ctl`, `postgres`.
There is no `pg_dump`, no `pg_restore`, no `psql`, no `pg_isready`. The claim
that desktop backups come free from `ops/`'s design was wrong.

### 10.3 Packaging: the one real risk, and it is specific

Relocation is fine. The binaries carry `RUNPATH=$ORIGIN/../lib`, so the tree
moves anywhere; a full `initdb` + start + query cycle was run from a copy at a
path containing **spaces** in both the binary path and the data directory, which
is the shape an installed Linux app actually has.

The risk is **14 symlinks in `native/lib/`** (`libpq.so`, `libicuuc.so.60`, and
the rest). npm tarballs cannot carry symlinks, so the package **recreates them in
a `postinstall`** from its own `pg-symlinks.json`. Two ways that goes wrong:

- **Install with `--ignore-scripts`** (common in CI for reproducibility), or a
  packager that drops symlinks, and the cluster dies at launch with
  `error while loading shared libraries: libicui18n.so.60`. Verified by deleting
  the 14 links: that is the exact failure.
- **Dereference them instead** (`cp -rL`, which some packaging steps do) and it
  works, but the tree goes **60 MB → 122 MB**, because each library is then
  stored three times.

So the build must either preserve symlinks or run the `postinstall`, and the
packaged artifact should be checked for those 14 links as a build step rather
than discovered at runtime by a user.

### 10.4 A second, smaller trap

Postgres caps a Unix socket path at 107 bytes, and the first attempt to start a
relocated cluster failed on it — the socket had been put inside a deep data
directory. Not a problem at `~/.local/share/<app>/pgdata`, but the desktop build
should pass an explicit short socket directory (or use TCP on loopback, which it
does anyway) rather than inheriting the data directory.

### 10.5 What the spike did not cover

The package publishes **only prerelease versions** — every one of its 29
releases is a `-beta`, including `latest`. There is no stable line, `^17` does
not resolve to anything, and the version pinned here is `17.10.0-beta.17`,
exactly. That is a supply-chain fact to weigh rather than a defect found: the
binaries themselves are stock PostgreSQL, and what is beta is the wrapper.

Also untested: `@prisma/client`'s **query** engine under packaging. The spike
proved the **schema** engine (`migrate deploy`) and used raw `pg` for its
assertions, so the engine the app actually queries through has not been
exercised here.

---

## 11. Phase 2 log — the stack under Electron, 20 Sep 2026

**Result: it boots.** `packages/desktop` brings up the cluster, applies the
migrations, starts the existing `.next/standalone` server against it and opens a
window once `/api/health` answers. The acceptance check is deliberately that
route rather than "a window appeared": it does `SELECT 1` through Prisma, so a
200 is Electron → Next → Prisma → the embedded cluster, proven end to end.

### 11.1 The shape that got built

`packages/desktop/` is a workspace member (the glob is already `packages/*`), at
about 1,000 lines across five modules: `preflight.js` (the binaries, §10.3),
`paths.js` (userData layout, persisted secrets, free ports), `cluster.js`
(lifecycle, migrations, seeding, the safety assertions), `server.js` (asset
bridging, the closed environment, spawn, health) and `main.js` (the ordered boot
and the error window).

`pnpm-workspace.yaml` gained two `allowBuilds` entries. This is §10.3 arriving
immediately rather than at packaging time: the repo blocks postinstall scripts by
default, and `@embedded-postgres/linux-x64` recreates its 14 symlinks in one.
Without the entry the install is silently broken in exactly the predicted way.

### 11.2 Measured, on this machine

| | first launch | warm launch |
| --- | --- | --- |
| cluster (initdb where needed) + start | 428 ms + 24 ms | **69 ms** |
| `prisma migrate deploy` | 1301 ms (48 applied) | 638 ms (none to apply) |
| Next server to `/api/health` ok | 3602 ms | 1177 ms |
| **total to a usable window** | **5444 ms** | **1928 ms** |

**This corrects §10.1's framing.** Phase 1's "13 ms warm start" is the database
alone, and reading it as the startup budget would have been wrong by two orders
of magnitude: the real number is **~1.9 s**, and the server is most of it.

One cost visible here is avoidable later: `migrate deploy` spends 638 ms on every
launch to discover there is nothing to do. Comparing a count against the bundled
migration directory before spawning the CLI would buy most of that back.

### 11.3 What phase 2 found that the plan had wrong

- **§4.2's premise was false**, and the way it failed is the dangerous kind —
  silent, and in the safe-looking direction. `next build` traces the working
  tree's `.env` into `.next/standalone/.env`. `@next/env`'s `processEnv` assigns
  a parsed value only when the key is undefined in the original `process.env`, so
  anything the launcher passes explicitly wins and **anything it forgets is
  inherited from the developer's `.env`**. Left alone, a desktop build would have
  registered GitHub OAuth and pointed the blob store at MinIO. Fixed by building
  a closed child environment and blanking the traced keys, read from the file so
  the list cannot fall behind it. Confirmed: `/api/auth/providers` returns `{}`
  and the server logs "No OAuth provider is configured".
- **The same trace is a credential leak at packaging time**, now recorded in §5.
  An installer built from a working tree would ship a real `GITHUB_CLIENT_SECRET`.
- **§4.4 understated the migration risk.** It says to run `migrate deploy`
  against the cluster; it does not say that getting it wrong points the CLI at
  the developer's database and that success looks identical either way. Three
  defences went in: an explicit `DATABASE_URL`, the CLI run in an empty scratch
  cwd so no `.env` is in reach, and — because asking is not proving — a
  post-hoc count of `_prisma_migrations` in *our* cluster plus a
  `pg_stat_activity` check that the server landed here too.

### 11.4 Verified by running it

Two launches, cold and warm. `GET /` → 200 serving the real app
(`<title>Modern Blog …</title>`), `/api/health` → `{"status":"ok","db":"up"}`,
a live `--type=renderer` process, and `postgres-blog` on 5432 never contacted.
Shutdown was exercised by `SIGTERM` to the main process, which is the real path
(`SIGTERM → app.quit → before-quit → shutdown → exit 0`): fast shutdown,
checkpoint, "database system is shut down", no `postmaster.pid`, no listening
ports. `pnpm lint` and `pnpm exec tsc --noEmit` are both clean.

**Not verified: what the window looks like.** This session's Wayland compositor
refuses both X11 `import` and the GNOME screenshot portal, so the window's
existence is established from the live renderer process and a resolved
`loadURL`, not from a picture. Someone should look at it.

### 11.5 Three operational findings

- **Electron will not start unsandboxed on this machine.** `chrome-sandbox` is
  not setuid root (pnpm cannot extract it that way) *and*
  `kernel.apparmor_restrict_unprivileged_userns=1` closes the fallback. The fix
  is `sudo chown root:root … && chmod 4755`; `start:no-sandbox` exists as the
  workaround and is what phase 2 was run under. A packaged build installs the
  helper correctly, so neither ships.
- **`embedded-postgres`'s own exit hook throws.** On the signal path it raises
  `TypeError: done is not a function` from its `AsyncExitHook(gracefulShutdown)`
  registration. Harmless here — our explicit `shutdown()` has already stopped
  everything by then — but it is an argument for keeping shutdown explicit rather
  than delegating it to the library, and it is a reminder that this dependency
  is a prerelease (§10.5).
- **Killing the launcher does not kill the app.** `pnpm --filter … start` dies on
  `SIGTERM` without propagating it, orphaning the Electron main process and
  leaving the cluster running — observed, and cleaned up by hand. A packaged app
  has no such wrapper, so this is a development-mode hazard rather than a
  shipping one, but it is the way to leave a stray postmaster behind.

---

## 12. Phase 3 log — local auth, 20 Sep 2026

**Result: the desktop build is genuinely signed in, and `src/` did not change by
a single line.** That last part is not a stylistic win — it is the whole of
§4.2's first rule, met by construction instead of by discipline.

### 12.1 The mechanism, and why the planned one was unavailable

§4.2 proposed a provider in `configuredProviders()` gated on `DESKTOP=1`. That
combination is refused by NextAuth itself, verified in
`node_modules/next-auth@4.24.15` rather than assumed:

- `core/init.js:66` — `strategy: authOptions.adapter ? "database" : "jwt"`. This
  repo has `PrismaAdapter`, so it is on the **database** strategy.
- `core/lib/assert.js:54-60` — with an adapter configured and credentials the
  only provider, NextAuth returns `UnsupportedStrategy`.

So the choice was never "provider or session row"; it was "switch this build to
JWT sessions, or don't". Switching would have meant the two builds keeping
sessions in two different places, and the `session` callback being handed a
`token` here and a `user` there — a divergence bought for nothing.

What the shell does instead is mint the pair an OAuth sign-in would have
produced: a `Session` row, and the cookie naming it.
`@next-auth/prisma-adapter`'s `getSessionAndUser` is a single
`session.findUnique({ include: { user: true } })`, so no `Account` row is needed
and the result is indistinguishable from a real sign-in. `getServerSession`
validates it, the `session` callback hydrates `id`/`role`/`disabled` from the
database exactly as on the VPS, and every route sees what it always sees.

### 12.2 Verified, and verified twice

The subagent's acceptance run and an independent check by the parent session,
the second reading the session token straight out of the cluster and presenting
it over `curl` rather than reusing the renderer's jar:

| request | status |
| --- | --- |
| `GET /api/documents` with the real session | **200** |
| `GET /api/auth/session` | 200, full row — `id`, `role: USER`, `disabled: false` |
| `POST /api/documents` (signed in) | 200, document created and listed |
| `GET`/`POST /api/documents`, **no cookie** | **401** |
| **forged** cookie (random uuid) | **401** |
| real token **truncated by one character** | **401** |
| valid session, user set `disabled` **while running** | **403** |

The last four are the point. It would be easy to build something where the
session works because the check stopped happening; these say the check is intact
and the session satisfies it. The `disabled` case is the strongest of them — it
runs through `requireUser` at request time, not through anything the shell did
at boot, and it flips back to 200 when the column is cleared.

Warm launch is 2036 ms, the session reused rather than re-minted.

### 12.3 Expiry, and the trap next to it

30 days, deliberately equal to NextAuth's own `maxAge`, so the server's rolling
refresh (`expires - maxAge + updateAge <= now`) computes as it does on the VPS
rather than as a special case. Every launch reuses the row or replaces it, and
anything **within 24 h of lapsing** is re-minted at launch — a row that is
technically valid but about to expire is worse than none, because the app would
come up signed in and sign itself out while someone was typing.

The cookie-name trap is now in §4.2, and it belongs to the same family as
§11.3's `.env` tracing: silent, and failing in the safe-looking direction. A
`NEXTAUTH_URL` without a scheme makes the server look for a `__Secure-` cookie
that Chromium will never send over loopback http, and the only symptom is a
signed-out window with a clean log.

`session.js` is import-free and `__tests__/session.test.ts` covers it in 14
tests, all aimed at the silent failures: the prefix rule, seconds-versus-
milliseconds in `expirationDate`, the re-mint margin, and every refusal path.

### 12.4 Sign-out, which is now a known trap rather than an unknown one

The Logout button still works, and with no provider configured it strands the
window until quit. The shell watches the cookie jar, restores the session,
reloads, and **says so in a dialog** — after the repair, so the window stays
usable. A silent restore would be a button that appears to do nothing, which is
its own bug.

This is a holding position, not the answer. Removing the affordance is right and
it is a change above the seam, so it is now listed in §5 with the service worker
and `/api/mcp`.

One consequence to decide: a `disabled` local user means the app **fails to
start**, with the error window naming why, rather than booting into guest. That
is the honest direction and it mirrors the OAuth `signIn` callback's ordering,
but it is a hard lock-out whose only exit is clearing the column by hand.

### 12.5 Findings and leftovers

- **`DESKTOP=1` is set but unread.** Phase 2 exports it; phase 3 needed no gate
  because it added no branch to `src/`. The rule stays in §4.2 for whatever
  phase 5 needs, but the plan should stop implying phase 3 consumes it.
- **§11.2's "638 ms to discover nothing to do"** reproduced exactly. Still the
  largest avoidable cost in a ~2 s warm launch.
- **Incidental and pre-existing, not from this work:** `POST /api/documents`
  with no `data` returns **500**, not 400. `documentCreateSchema` marks `data`
  optional, but `createDocument` hands it to Prisma, which throws
  `PrismaClientValidationError: Argument 'data' is missing`. Found because an
  acceptance request omitted it. Unrelated to desktop; worth a schema fix.
- **Not verified:** the genuine 24 h rolling-refresh overwrite against the
  sign-out watcher (the overwrite-looks-like-a-removal case *was* observed and
  guarded, the real refresh was not), and — still — what the window looks like,
  for §11.4's reason.
- A document titled "Phase 3 acceptance" now lives in the local cluster. It is
  the evidence, so it has been left there; delete `~/.config/blog-desktop` for a
  clean first run.
