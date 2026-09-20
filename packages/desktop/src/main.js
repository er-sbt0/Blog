import { app, BrowserWindow, session, shell } from "electron";
import { preflightPostgresBinaries } from "./preflight.js";
import { assertNotForbidden, desktopPaths, freePort, loadSecrets, resolveAppRoot } from "./paths.js";
import {
  APP_DATABASE,
  assertServerUsesOurCluster,
  countMigrations,
  databaseUrl,
  ensureDatabase,
  runMigrations,
  seedLocalUser,
  startCluster,
} from "./cluster.js";
import {
  buildServerEnv,
  ensureStandaloneAssets,
  startNextServer,
  stopNextServer,
  waitForHealth,
} from "./server.js";

/**
 * Phase 2 of docs/plans/desktop-app.md: the whole stack under Electron.
 *
 * The main process owns three things that have to come up in order — a Postgres
 * cluster, the migrations against it, and the existing `.next/standalone` server
 * — and the window opens only once `/api/health` has proved all three. Auth is
 * still a seeded row rather than a session (§4.2, phase 3).
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

  // 5. The phase-2 auth stub.
  const user = await seedLocalUser(cluster, { name: "Local author", email: "author@localhost" });
  log(`local user ${user.email} (${user.seeded ? "seeded" : "already present"})`);

  // 6. The Next server.
  const { standalone, entry } = ensureStandaloneAssets(appRoot, log);
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
  log(`booted in ${Date.now() - bootStarted} ms`);

  // 8. The window, and only now.
  await openWindow(origin);
}

async function openWindow(origin) {
  // next-pwa registers a service worker in any production build, and its
  // NetworkFirst rule over /api/* caches responses from a server that changes
  // port every launch. Turning it off properly is §5 / phase 5; clearing it each
  // boot is the cheap half, and stops a stale cache from being mistaken for a
  // bug in something else.
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
