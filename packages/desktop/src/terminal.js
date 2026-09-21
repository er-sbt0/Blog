/**
 * What the terminal runs, where it looks for it, and the environment it runs in.
 *
 * docs/plans/in-app-terminal.md §4.1, §4.5 and §2.4. Three decisions live here
 * and none of them involves a process, a window or a native module — which is
 * why they are in an import-free module with a spec, the rule `dragGeometry.ts`
 * sets and `session.js` and `windowState.js` follow. `pty.js` is the thin half
 * that owns `node-pty` and `ipcMain`; a spec cannot load that file at all,
 * because `node-pty` is built against Electron's ABI and will not open under
 * plain Node. So everything a spec could usefully pin had to end up on this
 * side of the seam.
 *
 * Every failure these functions prevent is silent in the same way: the window
 * shows a black rectangle, or a terminal that is subtly not the user's
 * terminal, and nothing is logged anywhere that says which.
 *
 * Linux only, per docs/plans/desktop-app.md §8 and §8 of the terminal plan —
 * `PATH` is split on `:` and paths are joined with `/` deliberately rather than
 * through `node:path`, because a `node:path` import would be the first thing
 * here that a spec has to mock.
 */

/**
 * The child's argv, fixed in the main process.
 *
 * Empty on purpose: `claude` with no arguments is the whole command, and the
 * resolved binary is argv[0]. It is a named constant rather than an inline `[]`
 * because of what it *is* rather than what it holds — §4.1's central decision
 * is that the renderer can never choose what runs, and that is precisely what
 * lets the bridge in `preload.cjs` expose no `spawn`. A future flag belongs
 * here, in the main process, where the renderer cannot reach it.
 *
 * In particular there is no `--dangerously-skip-permissions`. §4.6 declines it:
 * a bypass the user did not type, in a surface that looks exactly like their
 * terminal and therefore sets exactly the expectations their terminal sets.
 */
export const CLAUDE_ARGV = [];

/** The binary's name, on the only platform this build targets. */
export const CLAUDE_BINARY = "claude";

/**
 * Where the `claude` installer puts the binary, relative to `$HOME`.
 *
 * Read twice, for two different reasons — as a place to look (§4.5) and as a
 * `PATH` entry a `.desktop` launch may be missing (§2.4) — so it is one
 * constant rather than two string literals that could drift apart.
 */
export const LOCAL_BIN = ".local/bin";

/** The native installer's other home, checked after `~/.local/bin`. */
export const CLAUDE_LOCAL = ".claude/local";

/**
 * Which `claude` this session will run, and — when there is none — every path
 * that was tried.
 *
 * §4.5. `PATH` first, so a user who has their own build or a version manager
 * gets theirs; then the two directories the installer uses, because §2.4's
 * second hazard is that a packaged app launched from a `.desktop` file has the
 * *session's* `PATH` rather than a login shell's, and `~/.local/bin` is
 * routinely absent from it. That is the likeliest way this feature fails on
 * first launch, and it fails by finding nothing while a terminal one Alt-Tab
 * away finds it immediately.
 *
 * `searched` is returned rather than merely counted because §4.5's empty state
 * names the paths: "claude was not found" is an unanswerable bug report, and
 * the same sentence with three paths under it is a five-second diagnosis.
 *
 * `isExecutable` is injected — the one piece of I/O this decision needs — so a
 * spec can hand it a set of paths instead of building a filesystem.
 */
export function resolveClaudeBinary({ env, home, isExecutable }) {
  const searched = [];
  for (const candidate of claudeCandidates({ env, home })) {
    // A `PATH` with a repeated entry is ordinary, and listing the same path
    // three times in an empty state reads as a bug in the empty state.
    if (searched.includes(candidate)) continue;
    searched.push(candidate);
    if (isExecutable(candidate)) return { command: candidate };
  }
  return { reason: "no-binary", searched };
}

function claudeCandidates({ env, home }) {
  const candidates = [];
  for (const entry of splitPath(env?.PATH)) {
    candidates.push(joinPath(entry, CLAUDE_BINARY));
  }
  if (home) {
    candidates.push(joinPath(home, LOCAL_BIN, CLAUDE_BINARY));
    candidates.push(joinPath(home, CLAUDE_LOCAL, CLAUDE_BINARY));
  }
  return candidates;
}

/**
 * `PATH` as entries, with the empty ones dropped.
 *
 * POSIX reads an empty `PATH` entry as the working directory, and honouring
 * that here would mean a `claude` file sitting in the workspace directory —
 * which the user is invited to keep scratch files in (§4.6) — becoming the
 * binary this app executes. A leading, trailing or doubled `:` is how that
 * arrives, and it arrives from a `.desktop` file's environment rather than
 * from anything the user typed.
 */
function splitPath(value) {
  return String(value ?? "").split(":").filter((entry) => entry !== "");
}

/** `path.join`, for the one shape this module needs, without the import. */
function joinPath(dir, ...rest) {
  return [String(dir).replace(/\/+$/, ""), ...rest].join("/");
}

/** Trailing slashes are not a difference; `/usr/bin/` and `/usr/bin` are one entry. */
function normalizeEntry(entry) {
  return entry.replace(/\/+$/, "");
}

/**
 * The environment the PTY's child runs in.
 *
 * **Deliberately open, and that is the opposite of the policy next door.**
 * `server.js` builds a *closed* environment for the Next child — six variables
 * through `PASSTHROUGH_ENV` (`server.js:51`) and everything the traced `.env`
 * could supply blanked — because that child must not inherit the developer's
 * OAuth or S3 configuration. This child must inherit almost everything:
 * `claude` reads its own configuration, its credentials and its version
 * manager's shims out of the real environment, and §2.4 states the rule this
 * follows from — a terminal that behaves unlike the user's terminal is the one
 * thing a terminal may not do.
 *
 * So this function is a short list of *corrections* to what is inherited, and
 * two of them are hazards rather than niceties:
 *
 * - **`ELECTRON_RUN_AS_NODE` must go.** The main process sets it in the
 *   environments it spawns (`server.js:398`, and `mcpConfig.js` again for the
 *   MCP child), and if it reaches an interactive session then every `node` and
 *   every `electron` the user runs from here is something subtly other than
 *   itself — an Electron binary pretending to be Node, with a different
 *   `process.versions` and no window. Deleted explicitly rather than trusted
 *   not to be on `process.env`, because whether it is there depends on how the
 *   app was launched.
 * - **`PATH` may not have `~/.local/bin` on it.** §2.4's second hazard, and the
 *   same one `resolveClaudeBinary` works around: a `.desktop` launch carries
 *   the session's `PATH`. Resolving the binary by absolute path is enough to
 *   *start* Claude Code, and not enough for anything it then shells out to, so
 *   the directory is appended here too. Appended rather than prepended: the
 *   user's own ordering wins, because overriding it is how a version manager's
 *   shim gets bypassed.
 *
 * `PWD` is overwritten for a smaller reason with the same shape. It is
 * inherited from wherever the launcher started the app, so leaving it would
 * hand the child a `PWD` that disagrees with its actual `cwd` (§4.6's workspace
 * directory) — and a shell-less child has nothing that corrects it.
 *
 * The annotation on `env` is load-bearing rather than decorative. Without it
 * TypeScript infers the return type from the handful of keys this function
 * *names* — `HOME`, `PWD`, `PATH`, `TERM`, `COLORTERM` — and everything the
 * loop copies becomes invisible to a caller: reading `env.SSH_AUTH_SOCK` off
 * the result is then a type error, although the value is right there. A
 * signature that describes five variables is the wrong description of a
 * deliberately open environment.
 *
 * @param {Record<string, string | undefined> | undefined} parentEnv
 * @param {{ home?: string, workspace?: string }} options
 * @returns {Record<string, string>}
 */
export function buildTerminalEnv(parentEnv, { home, workspace }) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [key, value] of Object.entries(parentEnv ?? {})) {
    if (typeof value === "string") env[key] = value;
  }

  delete env.ELECTRON_RUN_AS_NODE;

  if (home) env.HOME = env.HOME || home;
  if (workspace) env.PWD = workspace;
  env.PATH = withLocalBin(env.PATH, home);

  // What xterm.js renders, said out loud. The default `TERM` a PTY gets is
  // whatever the parent had, which for a packaged app launched from a desktop
  // file is nothing at all — and a `claude` that believes it is on a dumb
  // terminal draws none of the TUI this feature exists to show.
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";

  return env;
}

/** `PATH` with `<home>/.local/bin` on it, appended only if it is missing. */
export function withLocalBin(pathValue, home) {
  const entries = splitPath(pathValue);
  if (!home) return entries.join(":");
  const localBin = joinPath(home, LOCAL_BIN);
  if (entries.some((entry) => normalizeEntry(entry) === localBin)) return entries.join(":");
  return [...entries, localBin].join(":");
}

/** The size a session starts at when the renderer has not measured one yet. */
export const DEFAULT_SIZE = { cols: 80, rows: 24 };

/**
 * The widest and tallest a PTY may be told it is.
 *
 * Not a guess about screens — 1000 columns is far past any rail (§2.3 puts the
 * rail's maximum at about 66) — but a bound on a number that arrives over the
 * bridge. `ioctl(TIOCSWINSZ)` takes an unsigned short, and a renderer that
 * sends 10^9 either wraps to something arbitrary or makes the child allocate a
 * buffer for a screen that does not exist.
 */
export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 1000;

/**
 * The cols/rows pair the renderer sent, or `null` if it did not send one.
 *
 * The bridge is a privileged surface (§2.1), so nothing arriving over it is
 * trusted — including from our own renderer, which computes these from a
 * measured element and can legitimately produce `0` or `NaN` before the rail
 * has laid out. The two cases are answered differently on purpose: a number
 * out of range is *clamped*, because it is a real measurement of a very small
 * or very large element, while anything that is not a number at all is
 * *refused*, because snapping it to a default would resize a working terminal
 * to 80x24 for no reason the user could see.
 */
export function sanitizeSize(raw) {
  const cols = dimension(raw?.cols);
  const rows = dimension(raw?.rows);
  if (cols === null || rows === null) return null;
  return { cols, rows };
}

function dimension(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const whole = Math.floor(value);
  return Math.min(Math.max(whole, MIN_DIMENSION), MAX_DIMENSION);
}
