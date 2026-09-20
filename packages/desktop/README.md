# @blog/desktop

The Electron shell. **Phases 2–6 of
[docs/plans/desktop-app.md](../../docs/plans/desktop-app.md)**: the main process
brings up an embedded Postgres cluster, applies the repo's migrations to it,
starts a Next standalone server against it, signs the local user in, points its
blob store and its attachments at directories under `userData`, and opens a
window — and since phase 6 the whole of that ships as an AppImage or a `.deb`.
See "Packaging" below.

Nothing here is a second implementation of anything. The window loads the same
server the VPS runs (§3), so there is no desktop branch in the 66 route handlers
or in `src/lib/access.ts` — what differs is the environment the server is handed,
and, since phase 3, a session row the shell writes rather than an OAuth callback.
**`src/lib/auth.ts` is untouched by this package.**

## Running it

```bash
pnpm install          # once — see "The two install traps" below
pnpm build:desktop    # the shell serves the output; it does not build it
pnpm desktop          # == pnpm --filter @blog/desktop start
pnpm package:desktop  # an AppImage and a .deb, into packages/desktop/.dist/
```

`pnpm build:desktop` is `DESKTOP=1 BUILD_DIR=.next-desktop next build`, and the
second build directory is the point — see "Two builds, and why" below. Plain
`pnpm build` still writes `.next` and is still exactly the VPS bundle; the shell
refuses to serve it.

### Chromium's sandbox on Ubuntu 23.10+

`pnpm desktop` aborts on this machine with

```
The SUID sandbox helper binary was found, but is not configured correctly.
```

because npm/pnpm cannot extract a setuid binary, and
`kernel.apparmor_restrict_unprivileged_userns=1` closes the namespace sandbox
that would otherwise stand in for it. Two ways out, in preference order:

```bash
# Right fix, once per checkout. The path moves when electron's version does.
E=$(node -p "require('electron')"); E=${E%/dist/electron}/dist
sudo chown root:root "$E/chrome-sandbox" && sudo chmod 4755 "$E/chrome-sandbox"

# Or, for a throwaway run: drop the sandbox.
pnpm --filter @blog/desktop start:no-sandbox
```

This is a development-from-the-working-tree problem only, and phase 6 checked it
rather than assuming it: **the packaged AppImage launches on this machine with
no `--no-sandbox` and no other flag.** See "The sandbox" under Packaging for the
two caveats — an *extracted* AppImage still fails, and the `.deb`'s install-time
decision is unverified because it needs root.

Everything the app owns lives under Electron's `userData`
(`~/.config/blog-desktop/` on Linux — `productName` in `package.json` is what
names it, and without it a scoped package name would nest the directory):

| | |
| --- | --- |
| `pgdata/` | the Postgres cluster, including the `Session` row you are signed in with |
| `uploads/` | attachments (`UPLOADS_DIR`), under `uploads/attachments/` |
| `blobs/` | editor images (`BLOB_DIR`), at `blobs/<hash[0:2]>/<hash>` |
| `secrets.json` | the cluster password and `NEXTAUTH_SECRET`, 0600 |

Deleting that directory is how you get a clean first run. It does not touch the
development database on 5432 — nothing in this package can reach it (see
"Not the dev database" below).

## What happens on boot

In order, each step logged with its timing:

1. **Preflight the Postgres binaries** — the 14 shared-library symlinks in
   `@embedded-postgres/linux-x64/native/lib/` must exist. Without them Postgres
   dies with `error while loading shared libraries: libicui18n.so.60`, three
   steps from its cause (plan §10.3). Checked here so the failure names the fix.
2. **Resolve paths and secrets** under `userData`.
3. **Cluster** — `initdb` on first launch only (~350–700 ms), then `start`
   (~13 ms every launch after, matching the spike's §10.1 numbers). The port is
   taken from the ephemeral range each launch; 5432, 55432 and 55433 are refused
   outright. The Unix socket gets a short, explicit directory under `/tmp`,
   because Postgres caps that path at 107 bytes (§10.4).
4. **Migrations** — `prisma migrate deploy` as a child process, then a check that
   `_prisma_migrations` in *this* cluster is non-empty. 48 migrations today.
5. **Seed a local user** (§4.2). One row, `author@localhost`, created only if
   `User` is empty. Idempotent, and it never touches an existing row — including
   a `disabled` one.
6. **Next server** — `.next-desktop/standalone/server.js` as a child process
   under Electron's own Node, on its own ephemeral loopback port. Before it is
   spawned, `assertDesktopBundle` reads `NEXT_PUBLIC_DESKTOP` back out of the
   bundle's `required-server-files.json`: a VPS bundle does not fail here, it
   succeeds *wrongly*, so the wrong artifact is refused rather than served.
7. **Health** — poll `GET /api/health` until it returns ok. That route does
   `SELECT 1` through Prisma, so a 200 is the whole chain proving itself:
   Electron → Next → Prisma → the embedded cluster. This is phase 2's acceptance
   check. Then a second, independent check that the server's connection actually
   landed in our cluster (`pg_stat_activity`) rather than somewhere it inherited.
8. **Sign in** — mint or reuse a NextAuth `Session` row for that user and put
   its token in the window's cookie jar. See "Local auth" below.
9. **Window**, and only then.

Shutdown is the reverse: the Next child first (SIGTERM, then SIGKILL after 5 s),
then the cluster. A cluster left running after the app exits is a bug.

Any failure in 1–8 opens a **real error window** carrying the message and the
boot log, per §4.4 — a console line at this stage is indistinguishable from a
hung splash screen.

## Local auth

The desktop user is genuinely signed in: `context.user` is populated, and the
whole authorized surface — series, projects, notes, blobs, proposals — works
exactly as it does on the VPS.

It is done by **writing the pair an OAuth sign-in would have left behind** — a
row in `Session`, and the cookie that names it — not by teaching NextAuth a new
way to authenticate. `authOptions` keeps its `PrismaAdapter`, so NextAuth stays
on the **database** session strategy and `getServerSession` validates the cookie
by reading `Session` and running the existing `session` callback over the joined
`User`. That callback is what puts `id`, `role` and `disabled` on
`session.user`, and it runs here unchanged. §4.2's rule — *change nothing above
the seam* — is therefore satisfied by construction rather than by care: there is
nothing above the seam to change.

**The Credentials provider (§4.2's suggested shape) does not work here**, and
NextAuth says so itself. `core/lib/assert.js` returns `UnsupportedStrategy` —
"Signin in with credentials only supported if JWT strategy is enabled" — when an
adapter is configured and credentials are the only provider, which is exactly
the desktop case. Taking it would mean forcing `session.strategy = "jwt"` for
this build alone: two builds keeping sessions in two different places, and a
`session` callback handed a `token` here and a `user` there. `DESKTOP=1` is
still set in the child's environment, and is still the only thing any gate hangs
off (never "no OAuth is configured", which a misconfigured VPS also satisfies).
Phase 5 is what started reading it.

**The cookie name is derived, not written down.** NextAuth prefixes it with
`__Secure-` when `NEXTAUTH_URL` is https, and `parse-url.js` treats a value with
no scheme *as* https. So `127.0.0.1:41234` and `http://127.0.0.1:41234` ask for
different cookies, and the wrong one is never sent — a window quietly showing
the signed-out experience, with a clean boot log above it. `session.js` derives
the name from the same URL the server is handed, and
`src/__tests__/session.test.ts` pins that rule along with the other three
silent ones: `expirationDate` is in **seconds**, `secure` must follow the
scheme, and a row hours from lapsing must not be reused.

### Expiry

Sessions are 30 days, matching NextAuth's own `maxAge` so that the server's
rolling refresh (`updateAge`, 24 h) computes as it does on the VPS. Every launch
either reuses the existing row or replaces it: anything expired, missing, or
within a day of lapsing is re-minted, and `lastLogin` is stamped when it is —
the same moment the OAuth `signIn` callback stamps it.

So a lapse across a restart cannot happen. The only way to reach the bound is to
leave the app running for 30 days while making no authenticated request at all,
since any request that does refreshes the row.

### Sign-out is a trap, and is answered rather than removed

The workspace still renders the web app's Logout button. Pressing it does what
it does on the VPS — deletes the `Session` row, clears the cookie — but here
there is no OAuth provider to sign back in *with*, so the window would sit in
the guest/IndexedDB experience until you quit, with nothing on screen saying so.

The shell therefore watches the cookie jar, restores the session, reloads the
window and **says that it did**, in a dialog. Not silently: a button that
appears to do nothing is its own bug. The listener re-reads the jar after a
short settle rather than trusting Chromium's `cause`, because NextAuth rewrites
this cookie on every authenticated request and each rewrite looks like a removal
first.

**Phase 5 took the affordance out of the UI**, which is the better answer:
`UserSessionActions` renders nothing when `IS_DESKTOP_CLIENT`, so neither the
Logout button nor the sign-in buttons behind it appear. The watcher above stays,
demoted from the answer to a safety net — `/api/auth/signout` is still a route
and the session is still worth repairing whenever the cookie goes.

### The `disabled` rule is intact, and is enforced earlier

A disabled account is the app's one refusal. `establishLocalSession` will not
mint for one, so a disabled desktop user is never signed in — the same order the
OAuth `signIn` callback uses — and `requireUser` in `src/lib/api-utils.ts` would
refuse them a second time regardless. In practice the app fails to start and the
error window names the reason; the only way out is to clear the flag on the row.

## Blobs and attachments

A laptop does not run MinIO, so the desktop build stores editor images as files:
`~/.config/blog-desktop/blobs/<hash[0:2]>/<hash>`, one implementation behind the
six-function surface in `src/lib/storage.ts` (`src/lib/blobFs.ts`, §4.3).
Attachments were already filesystem-backed and only needed a root, which phase 2
gave them.

**The bug this fixes was silent, not loud.** With no store configured,
`POST /api/blob` threw "Blob storage is not configured" and returned **500** —
and the editor's `blobSrcOrFallback` treats any failure as "keep the data URI",
because on the web that fallback exists for guest drafts. So inserting a picture
appeared to work, and quietly re-created exactly what
[blob-storage.md](../../docs/plans/blob-storage.md) was written to eliminate: a
base64 copy of the image serialized into every revision, growing with every
save. Importing a bundle that carries blobs failed outright, since
`/api/import` calls `blobExists` rather than guarding on `isStorageConfigured`.

### How the backend is chosen, and why it cannot happen by accident

`BLOB_DIR` names the directory, and naming it is the entire signal. The
tempting alternative — reuse the `isStorageConfigured()` branch that already
exists, so "no S3" means "use the disk" — is refused on purpose: **a
misconfigured VPS also has no S3**, and the result would be a production server
cheerfully writing every uploaded image into a container filesystem that the
next deploy throws away, with nothing in any log to say so. A directory has to
be named to be used.

`DESKTOP=1` (which phase 5 does read, for a different class of decision) would
also have been explicit, but it says which *build* this is rather than where the bytes go, and
leaving the location implicit is the part that loses data.

Configuring both is **refused**, not resolved by precedence — whichever way it
went, the other half of the configuration would be a deployment asking for
something it is silently not getting. That is why `S3_*` being blanked in the
child environment matters twice over now: it is not only about MinIO, it is what
keeps the selection unambiguous.

### The path-traversal surface, which is new

The hash in `GET /api/blob/<hash>` comes from a URL segment. Under S3 it indexed
into a key space, where `../` is an ordinary character sequence; here it derives
**a path on disk**, two directories below `secrets.json`. So `src/lib/blobPath.ts`
is deliberately paranoid and deliberately import-free: `isValidHash` (64
lowercase hex, uppercase rejected so one blob cannot have two names), then
`resolveWithin` from `src/lib/safePath.ts`, then a containment check against the
blob root rather than the shard — which is itself derived from the same
untrusted string. Every one of the four filesystem operations goes through it,
so an unvalidated hash cannot reach the disk from any of them.
`src/lib/__tests__/blobPath.test.ts` and `blobFs.test.ts` are almost entirely
refusals: traversal, absolute paths, Windows separators, percent- and
double-encoded traversal, NUL bytes, a separator inside a hash-shaped string,
empty, uppercase and overlong.

Authorization is **untouched**. `requireBlobRead` still decides who may read a
blob, from the documents referencing it; this phase changed where the bytes
live, not who may have them.

## Not the dev database

`next build` traces the working tree's `.env` into the bundle's `.env`, and
`@next/env` applies it at server start to every variable the process does not
already define. So the bundle carries the developer's real `DATABASE_URL`,
`GITHUB_CLIENT_*` and `S3_*`, and a child process that merely *omits* them
inherits them.

Three defences, all in `src/server.js` and `src/cluster.js`:

- The child's environment is **built up, not inherited** — a short passthrough
  list plus the values we mean, and every key found in the traced `.env` set to
  `""`. Empty is what the app's readers already treat as absent, and it is what
  stops `@next/env` filling the gap.
- `DATABASE_URL` is checked before it is handed anywhere: not 5432, not a remote
  host.
- After health, `pg_stat_activity` is asked whether the server actually connected
  *here*. Asking is not enough when the bundle disagrees.

This corrects §4.2's claim that a desktop build "configures no OAuth provider
without modification". That is true of a clean environment and false of every
bundle built from a working tree.

## The two install traps

Both are in `pnpm-workspace.yaml`'s `allowBuilds`, which blocks postinstall
scripts unless a package is named:

- `@embedded-postgres/linux-x64` recreates those 14 symlinks in its postinstall.
  npm tarballs cannot carry symlinks.
- `electron` downloads its binary in one.

And `embedded-postgres` publishes **only** prerelease versions — `^17` resolves
to nothing — so it is pinned exactly to `17.10.0-beta.17` (§10.5). Do not let a
caret or tilde in.

## Two builds, and why

Phase 5 (§5) turns off the features whose premise is a public server. Three of
them cannot be decided at runtime:

- **The service worker.** `next-pwa` is enabled by `NODE_ENV=production`, which
  a packaged build is, and it injects its registration script into the client
  entry from a **webpack plugin**. Whether a service worker exists is therefore
  settled when the bundle is written, not when the server starts.
- **The client flag.** `NEXT_PUBLIC_*` is inlined as a string literal at build
  time. A runtime variable can never reach a client component, so
  `DESKTOP=1` in the child's environment — which has existed since phase 2 —
  cannot hide a button rendered in the browser.
- **`/offline`,** which exists only as the service worker's document fallback,
  and whose existence is a route in the build.

So the desktop build is a *separate build*: `pnpm build:desktop`, into
`.next-desktop`. `next.config.ts` reads `DESKTOP` once and derives both the PWA
switch and `env.NEXT_PUBLIC_DESKTOP` from it, so the two halves cannot be set
differently — they are set by one command.

The alternative was one shared artifact with the flag delivered from the server
at request time (a header, a context provider fed by a server component). It
keeps a single bundle, and it cannot answer the first bullet at all; the service
worker would have to be *unregistered* after the fact, which is the phase 2
half-measure rather than a fix. Phase 6 needs a build step regardless, so the
second build is close to free.

What it costs is that the shipped bundle is no longer the VPS one. That is why
`assertDesktopBundle` exists: the wrong bundle runs fine and is wrong silently.

`pnpm build` is untouched — same output, same directory, same behaviour. The
desktop build skips `typescript.ignoreBuildErrors` because `next build` writes
its generated route types into `<distDir>/types` *and adds that directory to
`tsconfig.json`*; two dist directories in scope declare the same globals twice,
which is a type error in whichever is staler. `.next-desktop` is in tsconfig's
`exclude`, so `pnpm exec tsc --noEmit` — which does check this source — never
sees either.

## What phase 5 turned off

| | |
| --- | --- |
| Service worker + `/offline` | Off at build (`next.config.ts`); `/offline` 404s |
| `/api/mcp`, and every `AgentToken` with it | 404 from `route()`'s `token` mode, **before** the bearer header is read |
| The three MCP rate-limit budgets | Unreachable by consequence — the route never runs |
| `/api/revalidate` | 404; it is the CDN/ISR half of a public site, and locally could only ever answer 403 |
| `robots.txt` | `Disallow: /`, no `Sitemap:` line |
| `sitemap.xml` | Empty |
| The Logout button | Not rendered (`IS_DESKTOP_CLIENT`); the shell's restore watcher stays as a safety net |
| `/view/[id]`, `/user/[id]`, `/embed/[id]` | **Kept** — they are how you see what a published post looks like, and they are the only preview there is |

`PUBLIC_URL` is set, to the loopback origin: `src/app/api/utils.ts` self-fetches
`/api/embed` through it to render `/view` and `/embed`, and would otherwise fall
back to `http://localhost:3000` — usually a stale `next start` on this machine.
The two readers that want "where is this site published" rather than "where does
this server answer" go through `publicSiteUrl()` in `src/lib/desktop.ts`, which
returns `null` here. Blanking the variable would have broken the first three to
serve the last two.

## Packaging

Phase 6. Linux only, unsigned — AppImage and `.deb`, both from electron-builder.

```bash
pnpm build:desktop        # the bundle, first — packaging does not build it
pnpm package:desktop      # == pnpm --filter @blog/desktop package
```

That is `node scripts/stage-resources.mjs && electron-builder --linux`, and the
output lands in `packages/desktop/.dist/`:

| | |
| --- | --- |
| `blog-desktop-<version>-x86_64.AppImage` | ~237 MiB |
| `blog-desktop-<version>-amd64.deb` | ~193 MiB |
| `linux-unpacked/` | ~724 MiB installed |

Configuration is `electron-builder.yml`. Three decisions in it are not defaults:

- **`asar: false`.** The archive would have to be opened again immediately —
  `@embedded-postgres`'s binaries and its fourteen library symlinks can be
  neither executed nor resolved from inside one, and `asarUnpack` then leaves
  the package handing out the *archive's* path for a binary that only runs from
  `app.asar.unpacked`. The tree also stays inspectable, which is what makes the
  gate below checkable by hand.
- **Two `extraResources` entries, not one.** app-builder-lib refuses a matcher's
  root `node_modules` outright (`if (relative === "node_modules") return false`,
  `util/filter.ts`) with no pattern able to override it, so the Prisma CLI needs
  an entry aimed straight at the directory.
- **`publish: null`** — there is no update feed, and the default would write a
  `latest-linux.yml` describing one.

### What ships, and how it is assembled

`scripts/stage-resources.mjs` builds `packages/desktop/.stage/`, which becomes
`process.resourcesPath`. `resolveAppRoot` in `src/paths.js` already looked there,
so nothing in the boot sequence changes shape between development and a package:

```
<resources>/.next-desktop/standalone/          server.js, its node_modules, .env stripped
<resources>/.next-desktop/standalone/.next-desktop/static
<resources>/.next-desktop/standalone/public    minus the web build's sw.js
<resources>/prisma/{schema.prisma,migrations}  48 migrations
<resources>/node_modules/prisma                the CLI, plus its pnpm store closure
<resources>/app/                               this package and embedded-postgres
```

Three things it does that a plain copy does not:

- **Strips every `.env`.** See below — this is the whole reason the step exists.
- **Keeps symlinks as symlinks, and refuses any that leave the tree.** The
  standalone bundle's `node_modules` is a pnpm store: 329 relative links.
  Dereferencing them multiplies the bundle; Node's default `cp` rewrites them to
  absolute paths, which produces an app that runs on the build machine and
  nowhere else.
- **Reproduces pnpm's layout for the Prisma CLI rather than flattening it.**
  Copying `node_modules/prisma` and `node_modules/@prisma` out of the store
  gives a CLI that dies on its first `require` with `Cannot find module
  '@prisma/config'` — under pnpm a package's dependencies are its *siblings*,
  and lifting it out of that directory loses them. The store's shape is kept and
  the reachable part of it copied (35 packages).

### The gate

`scripts/verify-package.mjs` runs as electron-builder's `afterPack` hook and
**throws**, failing the build. It is also a CLI, so the same twelve checks run
against an extracted artifact:

```bash
./blog-desktop-0.0.0-x86_64.AppImage --appimage-extract
node scripts/verify-package.mjs ./squashfs-root

dpkg-deb -x blog-desktop-0.0.0-amd64.deb ./debroot
node scripts/verify-package.mjs ./debroot/opt/blog-desktop
```

A hook rather than a line after `electron-builder` in the `package` script,
because every one of these is false *silently*: an artifact that ships a
credential runs perfectly, and so does one with dereferenced symlinks, a
`public/sw.js` nobody registers, or a Prisma CLI that will only be discovered
missing on a user's first launch.

| check | why it is a build failure |
| --- | --- |
| No `.env`, `.env.*` anywhere | `next build` traces the working tree's `.env` into `<distDir>/standalone/.env` (plan §11.3). On this machine that file holds a real `GITHUB_CLIENT_SECRET`, a real `ANTHROPIC_API_KEY` and `AI_CREDENTIAL_KEYS` — the key that decrypts every user's stored provider key |
| No credential *value* from the working tree's `.env` in any packaged file | Belt and braces to the above: catches a credential that arrived under a name nobody thought to filter. By key name (`SECRET`, `TOKEN`, `_KEY`…), because the first version flagged nine files for `http://localhost:3000` |
| `NEXT_PUBLIC_DESKTOP === "1"` in the bundle's own manifest | `assertDesktopBundle`, at package time as well as launch time (§14.1) |
| `.next` absent | The VPS bundle packages just as well, and is wrong silently |
| `static/` and `public/` are real directories | `ensureStandaloneAssets` symlinks them when running from the working tree; a package must copy them, and a symlink into a vanished build tree is not an error anyone would read as one |
| No `sw.js` / `workbox-*.js` / `fallback-*.js` | `next-pwa` writes into the *source* `public/`, so it is shared state between the two builds (§14.5) |
| `prisma/migrations` matches the repository's count, CLI present | `migrate deploy` runs on boot (§4.4) |
| The schema engine is present and executable | |
| **The packaged Prisma CLI actually runs**, resolving its engine from inside the package | The strongest of them, and the one that came from being wrong: every file the other checks look for can be present while the CLI dies on its first `require` |
| The 14 `native/lib` symlinks are symlinks, and resolve | §10.3, the one packaging risk the plan named in advance. Missing → `error while loading shared libraries: libicui18n.so.60` at launch; dereferenced → the tree doubles, 60 MB to 122 MB |
| `initdb`, `pg_ctl`, `postgres` present and executable | |
| `chrome-sandbox` packaged | §11.5's development workaround must not ship |

There is a runtime backstop too, in `ensureStandaloneAssets`: when `app.isPackaged`
it *checks* the layout instead of building it — a packaged `resources/` is
read-only, so the development link farm would fail with `EROFS` on the first
launch after install — and it refuses to start at all if a `.env` is found in the
bundle. By then the credential is already distributed; a build that ships one
must not also look fine.

### The sandbox

`chrome-sandbox` is packaged correctly and **the AppImage launches without
`--no-sandbox`** — §11.5's workaround is development-only, as predicted.

Two things do need saying. An *extracted* AppImage
(`--appimage-extract`) fails with "The SUID sandbox helper binary was found, but
is not configured correctly", because extraction gives the helper to the
extracting user; that is the extraction, not the package. And the `.deb`'s
postinst decides between `chmod 4755` and `chmod 0755` by testing
`unshare --user true` — which on Ubuntu 24.04 succeeds because `unshare` has an
AppArmor profile granting it, while the app does not. The test can therefore
conclude "user namespaces work" on a host where they do not work *for this
binary*. Unverified: whether an installed `.deb` launches sandboxed here, since
that needs root.

### Not covered

Two things the packaged Prisma CLI carries that `migrate deploy` does not need:
`typescript` (23 MB, an optional peer) and the CLI's own copy of the query
engine (18 MB). Both are shipped rather than trimmed, because the closure is
computed rather than curated and a hand-maintained exclusion list is the kind of
thing that is right until Prisma changes.

## Stubbed, deliberately

| | Phase |
| --- | --- |
| Menu bar, window state, `printToPDF`, native dialogs | 7 (§6) |
