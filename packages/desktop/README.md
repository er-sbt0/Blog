# @blog/desktop

The Electron shell. **Phases 2–4 of
[docs/plans/desktop-app.md](../../docs/plans/desktop-app.md)**: the main process
brings up an embedded Postgres cluster, applies the repo's migrations to it,
starts the existing `.next/standalone` server against it, signs the local user
in, points its blob store and its attachments at directories under `userData`,
and opens a window.

Nothing here is a second implementation of anything. The window loads the same
server the VPS runs (§3), so there is no desktop branch in the 66 route handlers
or in `src/lib/access.ts` — what differs is the environment the server is handed,
and, since phase 3, a session row the shell writes rather than an OAuth callback.
**`src/lib/auth.ts` is untouched by this package.**

## Running it

```bash
pnpm install          # once — see "The two install traps" below
pnpm build            # the shell serves .next/standalone; it does not build it
pnpm desktop          # == pnpm --filter @blog/desktop start
```

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

This is a development-from-the-working-tree problem only. A packaged AppImage or
`.deb` (phase 6) installs `chrome-sandbox` with the right ownership, so neither
workaround ships.

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
6. **Next server** — `.next/standalone/server.js` as a child process under
   Electron's own Node, on its own ephemeral loopback port.
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
still set in the child's environment, and is still the only thing any future
gate should hang off (never "no OAuth is configured", which a misconfigured VPS
also satisfies) — but nothing reads it today.

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

Taking the affordance out of the UI is the better answer and belongs with §5's
other "this build has no public server" strippings (phase 5). It is a change
above the seam, and phase 3's rule is not to make one.

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

`DESKTOP=1` (set since phase 2, still read by nothing) would also have been
explicit, but it says which *build* this is rather than where the bytes go, and
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

`next build` traces the working tree's `.env` into `.next/standalone/.env`, and
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

## Stubbed, deliberately

| | Phase |
| --- | --- |
| Service worker, `/api/mcp`, rate limiter, `PUBLIC_URL` audit | 5 (§5) |
| Packaging — `.next/static` and `public/` are **symlinked** into `.next/standalone`; the Dockerfile's lines 63–64 are what copies them in production | 6 |
| Menu bar, window state, `printToPDF`, native dialogs | 7 (§6) |

One packaging note that belongs in phase 6 and is worth having written down
early: **shipping `.next/standalone` as built locally would ship the developer's
`.env`**, including a real GitHub client secret. `.dockerignore` protects the
Docker path; nothing protects an Electron packaging path.
