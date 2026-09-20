# @blog/desktop

The Electron shell. **Phase 2 of [docs/plans/desktop-app.md](../../docs/plans/desktop-app.md)**:
the main process brings up an embedded Postgres cluster, applies the repo's
migrations to it, starts the existing `.next/standalone` server against it, and
opens a window once `/api/health` answers.

Nothing here is a second implementation of anything. The window loads the same
server the VPS runs (§3), so there is no desktop branch in the 66 route handlers
or in `src/lib/access.ts` — what differs is the environment the server is handed.

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
| `pgdata/` | the Postgres cluster |
| `uploads/` | attachments (`UPLOADS_DIR`) |
| `blobs/` | created, unused until phase 4 |
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
5. **Seed a local user** — the phase-2 stand-in for phase 3's real local session
   (§4.2). One row, `author@localhost`, created only if `User` is empty.
6. **Next server** — `.next/standalone/server.js` as a child process under
   Electron's own Node, on its own ephemeral loopback port.
7. **Health** — poll `GET /api/health` until it returns ok. That route does
   `SELECT 1` through Prisma, so a 200 is the whole chain proving itself:
   Electron → Next → Prisma → the embedded cluster. This is phase 2's acceptance
   check. Then a second, independent check that the server's connection actually
   landed in our cluster (`pg_stat_activity`) rather than somewhere it inherited.
8. **Window**, and only then.

Shutdown is the reverse: the Next child first (SIGTERM, then SIGKILL after 5 s),
then the cluster. A cluster left running after the app exits is a bug.

Any failure in 1–7 opens a **real error window** carrying the message and the
boot log, per §4.4 — a console line at this stage is indistinguishable from a
hung splash screen.

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
| Auth — a seeded `User` row, no session provider | 3 (§4.2) |
| Blobs — `blobs/` exists, nothing writes to it; S3 is blanked, so `isStorageConfigured()` is false | 4 (§4.3) |
| Service worker, `/api/mcp`, rate limiter, `PUBLIC_URL` audit | 5 (§5) |
| Packaging — `.next/static` and `public/` are **symlinked** into `.next/standalone`; the Dockerfile's lines 63–64 are what copies them in production | 6 |
| Menu bar, window state, `printToPDF`, native dialogs | 7 (§6) |

One packaging note that belongs in phase 6 and is worth having written down
early: **shipping `.next/standalone` as built locally would ship the developer's
`.env`**, including a real GitHub client secret. `.dockerignore` protects the
Docker path; nothing protects an Electron packaging path.
