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
is a local session: one `User` row seeded on first launch, and a provider that
authenticates it without a network hop.

Two rules, because this is the one seam that can weaken the whole authorization
model:

- **Gate it on an explicit `DESKTOP=1`**, checked in `configuredProviders()`
  alongside the two OAuth branches. Not on "no OAuth configured", which is a
  condition a misconfigured VPS also satisfies.
- **Change nothing above it.** `userRoute`, `optionalUserRoute`, `context.user`
  and every rule in `src/lib/access.ts` keep working unmodified, because what
  they receive is the same `SessionUser` shape from the same `session` callback.
  The desktop build must not acquire a "skip the check when local" branch
  anywhere; a single-user machine is not a reason to stop authorizing, and the
  moment it is one the two builds stop being the same product.

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
2. **Boot the stack under Electron** (§3.1, §4.4). Main process starts cluster
   and server, window opens on the workspace. Auth still stubbed — run it with a
   manually seeded user and session.
3. **Local auth** (§4.2).
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
