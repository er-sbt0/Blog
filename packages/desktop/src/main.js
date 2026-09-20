import { randomUUID } from "node:crypto";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { preflightPostgresBinaries } from "./preflight.js";
import { assertNotForbidden, desktopPaths, freePort, loadSecrets, resolveAppRoot } from "./paths.js";
import {
  APP_DATABASE,
  assertServerUsesOurCluster,
  countMigrations,
  databaseUrl,
  ensureDatabase,
  establishLocalSession,
  runMigrations,
  seedLocalUser,
  startCluster,
} from "./cluster.js";
import { sessionCookieName, sessionCookieSpec } from "./session.js";
import {
  buildServerEnv,
  ensureStandaloneAssets,
  startNextServer,
  stopNextServer,
  waitForHealth,
} from "./server.js";

/**
 * Phases 2–3 of docs/plans/desktop-app.md: the whole stack under Electron, with
 * its one user signed in.
 *
 * The main process owns four things that have to come up in order — a Postgres
 * cluster, the migrations against it, the existing `.next/standalone` server and
 * a NextAuth session for the local user — and the window opens only once
 * `/api/health` has proved the first three and the cookie for the fourth is in
 * the jar.
 *
 * Every step logs its timing, because the phase-1 spike's numbers (§10.1) are
 * what the startup budget is argued from and the second half of the boot has
 * never been measured.
 */

const bootLog = [];
function log(message) {
  const line = `[desktop] ${message}`;
  bootLog.push(line);
  console.warn(line);
}

let cluster = null;
let nextServer = null;
let mainWindow = null;
let shuttingDown = false;
/** Set if the Next child dies; read by the health wait so a crash is not a hang. */
let serverExit = null;
/** The one local user, resolved at step 5 and signed in at step 8. */
let localUser = null;
/** Guard so a re-established session cannot re-trigger its own watcher. */
let restoringSession = false;

async function boot() {
  const bootStarted = Date.now();

  // 1. The binaries, before anything tries to run them. §10.3.
  const binaries = await preflightPostgresBinaries();
  log(`postgres binaries ok (${binaries.count} symlinks present)`);

  // 2. Paths and the two persisted secrets.
  const appRoot = resolveAppRoot({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  const paths = desktopPaths(app.getPath("userData"));
  const secrets = loadSecrets(paths.secrets);
  log(`data directory ${paths.userData}`);
  log(`app root ${appRoot}`);

  // 3. The cluster. Never 5432 — that is the developer's container, holding real
  //    data — so the port is taken from the ephemeral range every launch and the
  //    forbidden ones are refused outright rather than merely avoided.
  const pgPort = assertNotForbidden(await freePort());
  cluster = await startCluster({
    dataDir: paths.pgdata,
    socketDir: paths.socketDir,
    port: pgPort,
    password: secrets.pgPassword,
    log,
  });
  log(`database ${APP_DATABASE} ${await ensureDatabase(cluster)}`);

  // 4. Migrations, then proof they landed here and not somewhere inherited.
  const url = databaseUrl({ port: pgPort, password: secrets.pgPassword });
  await runMigrations({ appRoot, url, log });
  const applied = await countMigrations(cluster);
  if (applied === 0) {
    throw new Error(
      "`prisma migrate deploy` reported success but this cluster has no migrations. " +
        "It applied them to a different database — do not continue.",
    );
  }
  log(`${applied} migrations recorded in this cluster`);

  // 5. The local user. Signing them in needs the origin, so the session itself
  //    is established at step 8 — this is only the row it will belong to.
  localUser = await seedLocalUser(cluster, {
    name: "Local author",
    email: "author@localhost",
  });
  log(`local user ${localUser.email} (${localUser.seeded ? "seeded" : "already present"})`);

  // 6. The Next server.
  const { standalone, entry } = ensureStandaloneAssets(appRoot, log, { packaged: app.isPackaged });
  const httpPort = await freePort();
  const origin = `http://127.0.0.1:${httpPort}`;
  nextServer = startNextServer({
    standalone,
    entry,
    env: buildServerEnv({
      standalone,
      port: httpPort,
      url: origin,
      databaseUrl: url,
      nextAuthSecret: secrets.nextAuthSecret,
      uploadsDir: paths.uploads,
      blobDir: paths.blobs,
    }),
    log,
    onExit: (code, signal) => {
      serverExit = `The Next server exited before it became healthy (code ${code}, signal ${signal}).`;
      log(`next server exited (code ${code}, signal ${signal})`);
      // Restarting it belongs to a later phase; for now the exit is on the record
      // rather than silent, and it aborts the health wait instead of hanging it.
    },
  });
  log(`next server starting on ${origin}`);

  // 7. Health: the acceptance check. A 200 here is Electron -> Next -> Prisma ->
  //    the embedded cluster, end to end.
  await waitForHealth({ url: origin, log, abortWhen: () => serverExit });
  const connections = await assertServerUsesOurCluster(cluster);
  log(`server holds ${connections} connection(s) to the embedded cluster`);

  // 8. Sign the local user in (§4.2, phase 3). A `Session` row plus the cookie
  //    that names it — the pair an OAuth sign-in would have left behind — so
  //    `getServerSession` resolves a real `context.user` and the authorized
  //    surface (series, projects, notes, blobs, proposals) is reachable.
  //    Nothing above the seam knows this happened, which is the point.
  await establishSession(origin);
  log(`booted in ${Date.now() - bootStarted} ms`);

  // 9. The window, and only now.
  await openWindow(origin);
  watchForSignOut(origin);
}

/**
 * Mint or reuse the session row, and put its token in the window's cookie jar.
 *
 * The cookie's *name* is derived from the same `NEXTAUTH_URL` the server was
 * handed rather than hardcoded, because NextAuth derives it too — and derives
 * it from the scheme (`__Secure-` on https). Hardcoding either spelling makes
 * this work on exactly one of the two, and the failure is a window that quietly
 * shows the signed-out experience with nothing logged. See `session.js`.
 */
async function establishSession(origin) {
  const { token, expires, minted } = await establishLocalSession(cluster, {
    user: localUser,
    newToken: randomUUID(),
  });
  const spec = sessionCookieSpec({ url: origin, token, expires });
  await session.defaultSession.cookies.set(spec);
  log(
    `signed in as ${localUser.email} — ${minted ? "minted" : "reused"} session, ` +
      `cookie ${spec.name}, expires ${expires.toISOString()}`,
  );
}

/**
 * Sign-out, which on a desktop build is a trap unless it is answered.
 *
 * The workspace still renders the web app's Logout button, and pressing it does
 * what it does on the VPS: `DELETE`s the `Session` row and clears the cookie.
 * On the VPS you then sign in again. Here there is no OAuth provider to sign in
 * *with* (§4.2), so the app would sit in the guest/IndexedDB experience with no
 * way back except quitting and relaunching — and nothing on screen would say
 * so.
 *
 * So the shell restores the session and reloads, after telling the user plainly
 * that it did. That is deliberately not silent: a button that appears to do
 * nothing is its own bug.
 *
 * **Phase 5 removed the button** (`src/components/User/UserSessionActions.tsx`,
 * gated on the build-time `NEXT_PUBLIC_DESKTOP`), which is the real answer and
 * is why the dialog should now be unreachable through the UI. This watcher
 * stays anyway, demoted from the answer to a safety net: `/api/auth/signout` is
 * still a route, a `next-auth` client call still exists in the bundle, and the
 * session row is still worth repairing whenever the cookie goes. Removing an
 * affordance is not the same as removing the mechanism behind it.
 *
 * The listener fires on overwrites as well as removals — NextAuth rewrites this
 * cookie on every rolling refresh — so the jar is re-read after a short settle
 * rather than trusting `cause`, and a cookie that is still there means nothing
 * happened.
 */
function watchForSignOut(origin) {
  const name = sessionCookieName(origin);
  const jar = session.defaultSession.cookies;
  let settle = null;

  jar.on("changed", (_event, cookie, _cause, removed) => {
    if (cookie.name !== name || !removed || restoringSession) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      restore(origin, name).catch((error) => {
        console.error("[desktop] could not restore the local session", error);
      });
    }, 500);
  });
}

async function restore(origin, name) {
  const jar = session.defaultSession.cookies;
  const present = await jar.get({ url: origin, name });
  if (present.length > 0) return; // A refresh, not a sign-out.
  if (restoringSession || !mainWindow) return;

  restoringSession = true;
  const window = mainWindow;
  try {
    log("session cookie gone — treating it as a sign-out");
    await establishSession(origin);
    window.webContents.reload();
  } finally {
    restoringSession = false;
  }

  // After the repair, not before it: the window is usable while this is up, and
  // the message describes something that has already happened rather than
  // something waiting on a click.
  await dialog.showMessageBox(window, {
    type: "info",
    title: "Signed out",
    message: "There is no way to sign back in on the desktop.",
    detail:
      "This build has no OAuth provider, so the sign-in buttons cannot complete " +
      "and the window would have stayed in the signed-out experience until you quit.\n\n" +
      "Your local session has been restored and the window reloaded. Nothing was lost.",
    buttons: ["OK"],
    noLink: true,
  });
}

async function openWindow(origin) {
  // Phase 5 turned the service worker off where it is decided — in the build
  // (§5). `pnpm build:desktop` sets `disable` on next-pwa, so the registration
  // script is never injected into the client entry, no `sw.js` is generated, and
  // `ensureStandaloneAssets` does not bridge the web build's leftover one out of
  // `public/`. `assertDesktopBundle` refuses to serve a bundle where that is not
  // true, so this is settled before the window exists.
  //
  // The clear stays as cleanup rather than as the mechanism: a registration
  // written by a phase 2–4 launch is scoped to `http://127.0.0.1:<port>`, and
  // the ephemeral range is small enough to hand out a port twice. Nothing
  // re-registers it, but a leftover worker would still intercept.
  await session.defaultSession.clearStorageData({ storages: ["serviceworkers"] });

  // `show: false` until `ready-to-show`: the alternative is a window painted in
  // Electron's default white before the app's own background arrives, which in
  // dark mode is a flash rather than a frame.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: "Blog",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Anything that is not the local app opens in the real browser rather than in
  // a chromeless Electron window with no address bar.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(origin);
}

/**
 * §4.4: a failure here is the app failing to start, and a console line is
 * indistinguishable from a hung splash screen. So it gets a window.
 *
 * Plain HTML with CSS system colours rather than the app's tokens: this has to
 * render when the app itself did not come up, so it cannot reach for anything the
 * app defines. DESIGN.md §19.1 bans `prefers-color-scheme` for application styles
 * because it ignores the in-app theme toggle — there is no toggle here and no app
 * to disagree with, and `color-scheme: light dark` is the browser's own mechanism
 * rather than a hardcoded pair of greys.
 */
function showErrorWindow(error) {
  const detail = `${error?.stack || error?.message || String(error)}\n\n${bootLog.join("\n")}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Blog could not start</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 32px;
    background: Canvas; color: CanvasText;
    font: 14px/1.6 system-ui, sans-serif;
  }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  p  { margin: 0 0 24px; opacity: 0.7; }
  pre {
    margin: 0; padding: 16px; overflow: auto;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, CanvasText 5%, Canvas);
    font: 12px/1.6 ui-monospace, monospace;
    white-space: pre-wrap; word-break: break-word;
  }
</style>
</head>
<body>
  <h1>Blog could not start</h1>
  <p>The desktop shell stopped during startup. The boot log is below.</p>
  <pre>${escapeHtml(detail)}</pre>
</body>
</html>`;

  const failureWindow = new BrowserWindow({
    width: 900,
    height: 640,
    title: "Blog could not start",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  failureWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  mainWindow = failureWindow;
}

function escapeHtml(value) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

/**
 * Server first, then the cluster: the server holds connections to it, and a
 * postmaster asked to stop while clients are attached takes longer to go.
 *
 * A cluster still running after the app exits is a bug — the next launch picks a
 * different port and would leave two.
 */
async function shutdown() {
  try {
    await stopNextServer(nextServer);
  } catch (error) {
    console.error("[desktop] failed to stop the next server", error);
  }
  nextServer = null;
  try {
    await cluster?.stop();
  } catch (error) {
    console.error("[desktop] failed to stop the cluster", error);
  }
  cluster = null;
}

app.whenReady().then(() => {
  boot().catch((error) => {
    console.error("[desktop] startup failed", error);
    showErrorWindow(error);
    // Tear down whatever did come up. The error window stays.
    shutdown();
  });
});

app.on("window-all-closed", () => app.quit());

// Electron does not await an async quit handler, so the quit is cancelled once,
// the shutdown is run to completion, and then the process exits for real.
app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  shutdown().finally(() => app.exit(0));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => app.quit());
}
