# @blog/desktop

The Electron shell. **Phases 2–7 of
[docs/plans/desktop-app.md](../../docs/plans/desktop-app.md)**: the main process
brings up an embedded Postgres cluster, applies the repo's migrations to it,
starts a Next standalone server against it, signs the local user in, points its
blob store and its attachments at directories under `userData`, and opens a
window — and since phase 6 the whole of that ships as an AppImage or a `.deb`.
See "Packaging" below. Phase 7 gave it a menu bar, a window that remembers where
it was, PDF export and native file dialogs for the backup bundles: see "Desktop
affordances".

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
pnpm desktop:dev      # watch mode: next dev instead of the bundle — see below
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

## Watch mode

`pnpm desktop:dev` (or `./run.sh desktop:dev`) starts the same shell with
`next dev` as its child instead of the standalone bundle. Edit `src/` or
`packages/editor/src/` and the window updates — no build, and nothing to go
stale.

It changes the child process and nothing else. Same cluster, same
`prisma migrate deploy`, same seeded author, same minted `Session` row, same
closed environment: `DESKTOP=1`, `BLOB_DIR`, `UPLOADS_DIR` and a blanked `.env`
are all handed to the dev server exactly as they are to the built one. **There
is no "skip it in development" branch** — §4.2's rule applies here too, and the
sign-in you get is the same real one.

| | built (`pnpm desktop`) | watch (`pnpm desktop:dev`) |
| --- | --- | --- |
| Child | `.next-desktop/standalone/server.js` | `next dev` in the working tree |
| `distDir` | `.next-desktop` | `.next-desktop-dev` |
| `NODE_ENV` | `production` | `development` |
| Data | `~/.config/blog-desktop/` | the same — see below |
| Boot | ~2 s | ~4 s, plus a compile per route on first visit |
| Window title | Blog | Blog (dev) |

### What the guard is replaced by

`assertDesktopBundle` refuses to serve a bundle built by `pnpm build`, and it
exists because that bundle runs *fine* while being wrong (see "Two builds, and
why"). There is no bundle to interrogate in watch mode, so the three properties
it asserts are established instead:

- **The client flag.** `next dev` reads `next.config.ts` *after* the shell hands
  it `DESKTOP=1`, so `NEXT_PUBLIC_DESKTOP` is inlined into the client from the
  same variable the server half reads. The hazard the assertion exists for is a
  build that happened at some other time with some other flag; there is no such
  artifact here.
- **The service worker.** `next-pwa` is disabled whenever `NODE_ENV` is not
  production, so nothing is injected and nothing lands in `public/`.
- **The asset layout.** `output: "standalone"` is ignored by `next dev`, which
  serves `public/` and its own output itself — so there is no link farm to build
  and none to get wrong.

### Three things it is deliberate about

**A third `distDir`.** `.next` is the VPS bundle and `.next-desktop` is what the
packaged app serves; a dev server compiling into either leaves a half-built tree
where a finished one is expected — and `.next-desktop` is the very directory
`assertDesktopBundle` reads. `.gitignore` already covers `/.next-*/`.

It does cost one thing, and it is the defect `next.config.ts` describes under
`typescript.ignoreBuildErrors`: **`next dev` rewrites the committed
`tsconfig.json`**, adding `.next-desktop-dev/types/**/*.ts` to `include` on
first launch. Two generated route-type trees in scope declare the same globals
twice, and `pnpm exec tsc --noEmit` then fails in whichever is staler. So
`.next-desktop-dev` is in tsconfig's `exclude`, beside `.next` and
`.next-desktop`, and the include line is committed so no later launch rewrites
the file again.

**Its own process group.** `next dev` is a process *tree*, and a SIGTERM
delivered only to its root leaves the compiler workers holding the port; the
next launch meets that as a dev server that never becomes healthy, with nothing
on screen to say why. So the child is spawned `detached` and signalled as a
group. The health wait is 5 minutes rather than 60 seconds for the same class of
reason: the first request compiles the route graph it touches, and timing out on
a compile that was going to succeed would raise the error window over a server
that then comes up behind it.

### Which library it opens

**The same one, either way.** You start the app in watch mode to work on the
app, and an app with no posts in it is not the app — so `pnpm desktop:dev` and
`pnpm desktop` both open `~/.config/blog-desktop/` by default.

Two consequences follow, and neither is hidden:

- **They cannot run at once.** One data directory holds one cluster. Starting
  the second launch is refused in about four seconds, by name, rather than by
  Postgres timing out thirty seconds later with a message about a lock file
  (`assertDataDirFree`). The pid in `postmaster.pid` is what is checked, not the
  file, so a crash does not leave the app unopenable.
- **A watch-mode boot applies the working tree's migrations to your real
  library**, because `prisma migrate deploy` runs on every boot in both modes.
  That is the one thing worth stopping to think about, and it is what the
  override below is for.

```bash
./run.sh desktop:dev ~/blog-scratch      # a bare path is the common case
pnpm desktop:dev --data-dir=~/blog-scratch
DESKTOP_USER_DATA=~/blog-scratch pnpm desktop:dev
```

A directory that does not exist yet is created and seeded: a cluster, the
migrations, one local author, an empty library. To start from a copy of the real
one instead, close both apps and `cp -a ~/.config/blog-desktop/. ~/blog-scratch/`
— `secrets.json` travels with it, which is what keeps the copied cluster
openable.

Precedence is `--data-dir`, then `DESKTOP_USER_DATA`, then the default, and the
boot log names which one answered. `~` is expanded here rather than by the
shell, which does not expand it after an `=`. The flag is deliberately *not*
`--user-data-dir`: that is one of Chromium's own switches, and using it would
move the browser profile as a side effect of asking for a database.

It applies to the built app too (`./run.sh desktop ~/blog-scratch`), which is
how you open a restored backup without disturbing the real one.

### What still needs a restart

`packages/desktop/src/` itself. Electron loads `main.js` once, so a change to
the shell — the menu, the boot sequence, the session logic — needs the app
restarted. Nothing watches it, deliberately: a relaunch restarts the Postgres
cluster too, and an automatic one triggered by a save is a worse trade than
pressing Ctrl+C.

Two other things behave as they do in any `next dev`: a change to
`next.config.ts` or to `prisma/schema.prisma` needs a restart (the second also
needs `pnpm exec prisma generate`, which `run.sh desktop:dev` runs for you), and
the first visit to each route pays for its compile.

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

`PUBLIC_URL` is set, to the loopback origin, for one remaining reader: the root
layout's `metadataBase`, which would otherwise fall back to
`http://localhost:3000` — usually a stale `next start` on this machine. It used
to be three; `src/app/api/utils.ts` self-fetched `/api/embed` through it to
render `/view` and `/embed`, and now calls `generateServerHtml` in-process. The
two readers that want "where is this site published" rather than "where does
this server answer" go through `publicSiteUrl()` in `src/lib/desktop.ts`, which
returns `null` here. Blanking the variable would still break the first to serve
the last two.

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

## Desktop affordances

Phase 7 (§6, §8 item 7). Six modules — `menuTemplate.js` / `menu.js`,
`windowState.js`, `pdf.js`, `bundles.js` and `fileTargets.js` — of which three
are import-free and specced, because the whole of their risk is invisible at
runtime: nobody can see this window, and none of these failures throws.

### The menu, and the audit under it

`menuTemplate.js` holds the template; `menu.js` installs it. They are split
because of one fact about Electron: **an accelerator the menu registers never
reaches the page.** Chromium gives the keystroke to the native menu, the menu
runs its item, and the renderer's listener is never called. A File menu that
took ⌘K would take the command palette; an Edit menu with a `selectAll` role
takes ⌘A from the posts list, the sidebar *and* the notes canvas. All of it
silently, with the menu item itself looking like it works.

So `APP_SHORTCUTS` is an inventory of every modifier chord `src/` and
`packages/editor/src/` bind (plus what Lexical registers on the editor's
behalf), each with the file and line it comes from, and `collisions()` refuses
any template that shadows one. `menu.js` runs it again at startup and throws.

| | |
| --- | --- |
| File | New Post `Ctrl+N` · Export as PDF… `Ctrl+P` · Import Backup… `Ctrl+O` · Export Backup… `Ctrl+Shift+O` · Close Window `Ctrl+W` · Quit `Ctrl+Q` |
| Edit | the standard roles, **all label-only** |
| View | Reload `Ctrl+R` · Force Reload `Ctrl+Shift+R` · DevTools `F12` · zoom (label-only) · Full Screen `F11` |
| Window | Minimize `Ctrl+M` · Maximize / Restore |
| Help | About · Open Data Folder · Copy Boot Log |

Two decisions worth keeping:

- **The Edit menu registers nothing.** `registerAccelerator: false` shows the
  chord and leaves the key to the page, which is the only way ⌘A can go on
  meaning three different things and ⌘C can keep writing
  `application/x-lexical-editor` alongside the plain text. On Linux — the only
  platform this build targets — Chromium handles those keys in the renderer
  anyway, so it costs nothing. On macOS `registerAccelerator` is ignored, so a
  second platform has to revisit this.
- **The three zoom roles are label-only too**, because
  `useCanvasZoomShortcuts` binds `Ctrl+0`/`Ctrl+=`/`Ctrl+-` on a notes canvas
  and tests `ctrlKey` alone.

`Ctrl+Shift+E` looks like the obvious accelerator for Export and is not free:
the inline-code handler matches `KeyE` with no `shiftKey` guard, so it owns the
shifted chord too. `absorbsShift` in `APP_SHORTCUTS` is what encodes that.

### Window state

`windowState.js` is arithmetic, `paths.js` does the I/O, and
`window-state.json` under `userData` is the file. The two cases it exists for
are the ones that break: a position on a monitor that has been unplugged, and a
size larger than the display that is left. Both end with a window that exists
and cannot be reached, so **the saved geometry is dropped rather than honoured
off-screen** — re-centred when less than a title bar's worth of it would be
visible, nudged back inside when it is merely over an edge, and clamped to the
*work area* rather than the screen. A maximized window saves `getNormalBounds()`,
so un-maximizing gives back the window it had before.

**On Wayland the position is advisory.** Verified here: a window asked for
`140,120` was placed by the compositor at `22,19`, and that is what came back
from `getBounds()` and got saved. Size and the maximized flag restore exactly;
the coordinates are a request. There is nothing to fix — a Wayland client
cannot place its own window — but it is why the saved `x`/`y` may not be the
ones you last saw.

### PDF export

`pdf.js`, and it is a main-process feature rather than a route: **there is no
`src/app/api/pdf/`** (CLAUDE.md lists one; it is gone, and there is no
`puppeteer` dependency), so what makes this possible again is Electron's own
Chromium. The source is `/view/<id>` — the existing read-only render, served by
the same server to the same session, so authorization is exactly where it
already was. The hidden window uses `session.defaultSession`, which is the jar
phase 3 minted the cookie into; a partitioned session would have produced a
perfectly valid PDF of the signed-out page.

Two checks stand between it and a blank file, and the second one is there
because the first was not enough:

1. A settle script waits for images to decode and `document.fonts.ready` to
   resolve, then for the content height to stop changing, and reports the
   character and image counts it found. `did-finish-load` alone is too early.
2. **The print layout is measured under print media**, via
   `Emulation.setEmulatedMedia` over Electron's debugger. This caught a real
   blank: `globals.css`'s `@media print` block carries
   `body > *:not(.editor-container) { display: none !important; }`, and on
   `/view` the content is `.document-container.document-view` several wrappers
   below a body child that is neither — so the printed page was empty while the
   screen DOM was full. `printToPDF` reported success and returned a valid
   947-byte document with the right title and no content.

That rule was evidently written for `/embed`, which is the one route that
mounts `PrintTrigger` and whose `EmbedDocument` *is* the `.editor-container`.
On `/view` — and on the workspace, where `AppLayoutContent` puts the same class
several levels down — it hides the page. **It is a pre-existing app bug rather
than a desktop one**, and printing `/view` from a browser today has the same
result; whether `/embed`'s own print button still works was not checked.

The shell works around it by pinning each `body > *` to its on-screen `display`
with an inline `!important` before printing — read rather than guessed, so a
flex wrapper stays flex and anything genuinely hidden stays hidden. Fixing
`globals.css` is the real answer and belongs to whoever owns that stylesheet.

### Native dialogs for the bundles

`bundles.js`. `/api/export` and `/api/import` already round-trip a whole
account and §7 makes them the v1 answer to "two libraries that both exist";
what they lacked on desktop was a way to say where the file goes. Both requests
carry the session cookie and go through `userRoute` exactly as the browser's
do — the shell is presenting a file picker, not obtaining access.

The export streams to `<chosen>.part` and renames on success, because a
truncated `.zip` sitting at the name the user chose is a backup they will trust
until the day they need it. The import is the one affordance that *reports*:
`/api/import` skips anything already present, so a restore into the account the
bundle came from imports nothing and returns 200 — `describeImport` says
"Nothing was imported" rather than "Import complete".

One trap, found by running it: the route answers `{ data: summary }`, not the
summary. Read straight, every count is `undefined`, every default fires, and a
restore that worked reports that it did nothing.

### Drag and drop: nothing was built, deliberately

Electron delivers a drop from the file manager as an ordinary HTML5 drop with
`dataTransfer.files`, and `DragDropPastePlugin` already handles that through
Lexical's `DRAG_DROP_PASTE` — the same path a drop from a browser's downloads
takes. There is nothing for the shell to add, and nothing was added.

**Read as a code path, not as a gesture**: a physical drag cannot be performed
here (§11.4's Wayland limitation, which also rules out synthesising one), so
this is the mechanism being present rather than a drop having been watched to
land.

Two notes on the edges of that:

- **Non-image files are not attachments.** `DragDropPastePlugin` accepts image
  MIME types and answers anything else with "Unsupported file type". Making a
  dropped `.pdf` become an attachment is a change to the editor package, not to
  the shell, so it is not phase 7's.
- Dropping a file anywhere the editor is *not* listening would navigate the
  window to `file://…` — Chromium's default, and a one-way trip in a window
  with no address bar and an ephemeral port. `main.js` now handles
  `will-navigate`: anything off-origin is cancelled, an `http(s)` link is
  handed to the real browser (the answer `setWindowOpenHandler` already gave),
  and everything else is simply refused.
