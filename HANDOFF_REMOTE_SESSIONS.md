# Handoff: remote Claude Code sessions

5 Oct 2026. The plan, with a log for each phase, is
[docs/plans/remote-claude.md](./docs/plans/remote-claude.md). This file says
where things stand and what to do next. The reasons behind each decision are
in the plan's §7.1–§7.4.

## State

**v1 is built and committed on `main`, but it has never run inside the desktop
app.** Everything below was checked with specs, against a throwaway Postgres
17 cluster, or over real ssh, and never on screen.

| Commit | Phase |
| --- | --- |
| `5d4af59d` | 1. Reach and read a host over ssh: the fixed scripts and length-framed reads |
| `56965d4e` | 2. Schema plus the `pg_trgm` migration, the parser, the incremental sync, and the ingest routes |
| `904fffc2` | 3. Sidebar view, Settings → Remote hosts, `/sessions/[id]` viewer, preload bridge, link-safety fixes |
| `e7fbca4a` | 4. Transcript search, open at a hit, stats dashboard on `/sessions` |

The author's decisions, made on 4 Oct 2026:

- Sessions open on their own `/sessions` route, not as pane tabs, so phase 5
  is declined.
- Copilot's `MarkdownText` gets the same link fix as the transcripts
  (`src/lib/safeHref.ts`).

Checks at `e7fbca4a`: 96 spec files and 1764 tests pass, `tsc --noEmit` and
`pnpm lint` are clean, and `pnpm check:theme` is clean.

## Next: the first real launch

This is the only step that needs a person, and it is what phase 4 left
unverified.

1. `pnpm desktop:dev`. The migration `20261004120000_remote_sessions` applies
   to the real library (`~/.config/blog-desktop/`) on this boot. To keep it
   off real content, use `--data-dir=<scratch>`.
2. Settings → Remote hosts → add `dev@192.168.1.33`.
3. Press Sync in the Sessions sidebar view (activity rail). Expect "Reading…
   N%", then "Indexing…".
4. Check each of these:
   - [ ] the sync completes. If it fails, the host row shows ssh's error
     verbatim.
   - [ ] the session tree runs host → project → session, and the title is
     "Build-llm.sh CPU utilization".
   - [ ] the transcript renders in **both** colour schemes; tool calls
     collapse and expand; `n`/`p` move between prompts and `/` opens find.
   - [ ] search (toggle the filter box, or press Enter) finds `bash`, and a hit
     scrolls to its entry and highlights it.
   - [ ] the `/sessions` dashboard shows tiles and charts.
   - [ ] a link in a transcript opens in the system browser, not in the app
     window.
   - [ ] a second Sync with nothing changed finishes almost instantly (it only
     lists).
   - [ ] Forget a session, then Sync: it comes back, because it is still on the
     remote.
5. For a larger test, add `localhost` (if sshd runs) or a busier host. A first
   sync of this machine's 430 MB history took about 31 s, 18 s of it in
   "Indexing…".

## Where things are

| What | Where |
| --- | --- |
| ssh, the fixed remote scripts, `syncHost` | `packages/desktop/src/remoteSessions.js` |
| IPC `sessions:sync`, the cookie-authenticated client | `packages/desktop/src/remoteSessionsIpc.js`, `remoteSessionsBridge.js` |
| Link policy (http(s) only to the shell; app matched by parsed origin) | `packages/desktop/src/links.js` |
| Renderer bridge | `preload.cjs` (`sessions`); types in `src/lib/desktopBridge.ts` |
| Parser, sync diff, search and stats helpers, wire types | `src/lib/claudeSessions/` (`parse.ts`, `sync.ts`, `search.ts`, `stats.ts`, `types.ts`) |
| Repository | `src/repositories/remoteSessions.ts` (owner-scoped only) |
| Authorization | `requireRemoteHost`, `requireRemoteSession` in `src/lib/access.ts` |
| Routes (all `refuseOffDesktop`) | `src/app/api/remote-sessions/**` |
| UI | `src/components/RemoteSessions/`, `src/app/(workspace)/sessions/` |
| Real-ssh spike | `node packages/desktop/scripts/spike-remote-sessions.mjs <host>` |

## Invariants: don't break these

- **No transcript byte reaches the DOM as markup.** That window can also type
  into a running Claude Code (§2.4). `TranscriptEntry.test.tsx` pins this. Use
  no `dangerouslySetInnerHTML`, no HTML-capable Markdown, and no
  `codeToHtml`.
- **The renderer passes a host id, never an alias.** The main process fetches
  the alias from the server and re-validates it. The remote scripts are
  constants with nothing interpolated into them, and they must contain no
  `'`, because they run under `sh -c '…'`.
- **mtime is whole milliseconds in a `BigInt`.** A float did not round-trip
  through Prisma, and every sync re-read everything (§7.2).
- **Never commit a real transcript as a fixture.** Transcripts are where
  credentials end up. Every spec uses hand-written fixtures.
- Storage is plaintext by decision (§4.5). Forget is the only control.

## Known gaps, none blocking

- Search has no project filter in the UI; the route and the fetcher support
  one.
- Find-in-session searches only the pages already loaded. Pages also load as
  one contiguous run, so there is no jumping ahead to an unloaded part.
- The empty sidebar says "add one in Settings" as text, not a button, because
  whether Settings is open is local state inside `RightRail`.
- `finish` derives every changed file in one request, which took 18 s on a
  large first sync. If that hurts in practice, derive during ingest instead
  (§7.2).
- Untested:
  - coder `ProxyCommand` hosts with `BatchMode=yes` (§6.2);
  - a non-GNU remote (§9 q1);
  - several hosts at once;
  - the HTTP layer of the routes (the repository was tested directly);
  - whether `CREATE EXTENSION pg_trgm` is allowed for the production database
    role (§6.4).

## Environment notes

- The dev database on `:5432` was down throughout. All database checks used a
  scratch cluster started from the bundled embedded-postgres binaries, over
  TCP only, because the scratchpad's socket path is too long. The dev database
  will need `prisma migrate deploy` when it is next up.
- Out of scope, but fixed on the way: `main.js` used to pass any non-app URL
  to `shell.openExternal` (`xdg-open`), and it matched the app with
  `startsWith(origin)`.
