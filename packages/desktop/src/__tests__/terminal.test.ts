import {
  CLAUDE_ARGV,
  DEFAULT_SIZE,
  MAX_DIMENSION,
  buildTerminalEnv,
  resolveClaudeBinary,
  sanitizeSize,
  withLocalBin,
} from "../terminal.js";

/**
 * What the terminal runs and the environment it runs in
 * (docs/plans/in-app-terminal.md §4.1, §4.5, §2.4).
 *
 * Every assertion here is on something that fails *silently* — which is the
 * reason this logic was pulled out of `pty.js` in the first place, and the
 * reason it could be: a spec cannot import `pty.js` at all, because `node-pty`
 * is a native addon built against Electron's ABI and will not open under plain
 * Node. So the decisions were moved to the side of the seam a spec can reach.
 *
 * The four silent failures, in the order they are tested:
 *
 * - A binary that is not found because a `.desktop` launch's `PATH` does not
 *   have `~/.local/bin` on it, which §2.4 calls the likeliest first-launch
 *   failure — and which a developer checking from their own rich shell will
 *   never see.
 * - `ELECTRON_RUN_AS_NODE` inherited into an interactive session, which turns
 *   every `node` the user runs into an Electron pretending to be one.
 * - A `claude` found in the working directory because `PATH` had an empty
 *   entry, in a directory the user is invited to drop files into (§4.6).
 * - A number from the renderer that is not a measurement, resizing a working
 *   terminal to nothing.
 */

/** `isExecutable`, as a spec can supply it: a set of paths, and nothing else. */
const present = (...paths: string[]) => (candidate: string) => paths.includes(candidate);
const nothing = () => false;

describe("CLAUDE_ARGV", () => {
  /**
   * The bridge exposes no `spawn` *because* this is fixed in the main process
   * (§4.1). An argument appearing here later is a decision; an argument
   * appearing here from the renderer would be arbitrary code execution.
   */
  it("is empty — the resolved binary is the whole command", () => {
    expect(CLAUDE_ARGV).toEqual([]);
  });

  /**
   * §4.6 declines a bypass the user did not type, in a surface that looks
   * exactly like their terminal. It is worth a test rather than a comment
   * because adding it would be a one-word edit that nothing else would notice.
   */
  it("passes no permission bypass", () => {
    expect(CLAUDE_ARGV.join(" ")).not.toMatch(/permission|dangerous/i);
  });
});

describe("resolveClaudeBinary", () => {
  const home = "/home/someone";

  it("prefers PATH, in the order PATH gives", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/opt/bin:/usr/bin" },
      home,
      isExecutable: present("/opt/bin/claude", "/usr/bin/claude"),
    });
    expect(resolved).toEqual({ command: "/opt/bin/claude" });
  });

  /**
   * §2.4's second hazard, and the whole reason §4.5 exists. A packaged app
   * started from a `.desktop` file gets the *session's* `PATH`, not a login
   * shell's, so the directory the installer writes to is routinely missing —
   * and the same binary is one Alt-Tab away in a terminal that finds it.
   */
  it("finds the installer's binary when PATH does not mention it", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/usr/bin:/bin" },
      home,
      isExecutable: present("/home/someone/.local/bin/claude"),
    });
    expect(resolved).toEqual({ command: "/home/someone/.local/bin/claude" });
  });

  it("falls back to the native installer's other home", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/usr/bin" },
      home,
      isExecutable: present("/home/someone/.claude/local/claude"),
    });
    expect(resolved).toEqual({ command: "/home/someone/.claude/local/claude" });
  });

  it("searches PATH before either of them", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/usr/bin" },
      home,
      isExecutable: present("/usr/bin/claude", "/home/someone/.local/bin/claude"),
    });
    expect(resolved.command).toBe("/usr/bin/claude");
  });

  /**
   * The empty state names the paths (§4.5). "claude was not found" is an
   * unanswerable bug report; the same sentence with the list under it is a
   * five-second diagnosis of a `PATH` that came from a desktop file.
   */
  it("reports every path it tried when there is nothing to run", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/usr/bin:/bin" },
      home,
      isExecutable: nothing,
    });
    expect(resolved).toEqual({
      reason: "no-binary",
      searched: [
        "/usr/bin/claude",
        "/bin/claude",
        "/home/someone/.local/bin/claude",
        "/home/someone/.claude/local/claude",
      ],
    });
  });

  it("lists a repeated PATH entry once, so the empty state does not look broken", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: "/usr/bin:/usr/bin:/usr/bin/" },
      home,
      isExecutable: nothing,
    });
    expect(resolved.searched).toEqual([
      "/usr/bin/claude",
      "/home/someone/.local/bin/claude",
      "/home/someone/.claude/local/claude",
    ]);
  });

  /**
   * POSIX reads an empty `PATH` entry as the working directory. Honouring that
   * would make a file named `claude` in the workspace — a directory §4.6
   * invites the user to keep scratch files in — the thing this app executes,
   * arriving from a stray `:` in an environment nobody typed.
   */
  it("never searches the working directory, whatever PATH's punctuation says", () => {
    const resolved = resolveClaudeBinary({
      env: { PATH: ":/usr/bin::" },
      home,
      isExecutable: nothing,
    });
    expect(resolved.searched).toEqual([
      "/usr/bin/claude",
      "/home/someone/.local/bin/claude",
      "/home/someone/.claude/local/claude",
    ]);
  });

  it("still has somewhere to look with no PATH at all", () => {
    const resolved = resolveClaudeBinary({
      env: {},
      home,
      isExecutable: present("/home/someone/.local/bin/claude"),
    });
    expect(resolved.command).toBe("/home/someone/.local/bin/claude");
  });
});

describe("buildTerminalEnv", () => {
  const options = { home: "/home/someone", workspace: "/data/workspace" };

  /**
   * The opposite policy to `server.js`'s closed environment, and deliberately
   * so (§2.4): that child must not inherit the developer's configuration, and
   * this one must inherit the user's, because a terminal that behaves unlike
   * the user's terminal is the one thing a terminal may not do.
   */
  it("inherits the user's environment rather than rebuilding one", () => {
    const env = buildTerminalEnv(
      { NVM_DIR: "/home/someone/.nvm", SSH_AUTH_SOCK: "/run/keyring/ssh", EDITOR: "vim" },
      options,
    );
    expect(env.NVM_DIR).toBe("/home/someone/.nvm");
    expect(env.SSH_AUTH_SOCK).toBe("/run/keyring/ssh");
    expect(env.EDITOR).toBe("vim");
  });

  /**
   * The hazard that does not announce itself. The main process sets this in
   * every environment it spawns, and a shell that inherits it turns `node` and
   * `electron` into something subtly other than themselves — with no error, in
   * a session that otherwise looks completely normal.
   */
  it("deletes ELECTRON_RUN_AS_NODE", () => {
    const env = buildTerminalEnv({ ELECTRON_RUN_AS_NODE: "1", PATH: "/usr/bin" }, options);
    expect("ELECTRON_RUN_AS_NODE" in env).toBe(false);
  });

  it("declares a terminal xterm.js can actually render", () => {
    const env = buildTerminalEnv({}, options);
    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
  });

  /**
   * Inherited from wherever the launcher started the app, and a child with no
   * shell has nothing that corrects it — so a `PWD` disagreeing with the actual
   * `cwd` (§4.6's workspace) would be reported by anything that reads it.
   */
  it("points PWD at the workspace it is actually started in", () => {
    expect(buildTerminalEnv({ PWD: "/" }, options).PWD).toBe("/data/workspace");
  });

  it("keeps an inherited HOME and supplies one when there is none", () => {
    expect(buildTerminalEnv({ HOME: "/home/other" }, options).HOME).toBe("/home/other");
    expect(buildTerminalEnv({}, options).HOME).toBe("/home/someone");
  });

  it("survives an environment with holes in it", () => {
    const env = buildTerminalEnv({ A: undefined, B: "b" }, options);
    expect("A" in env).toBe(false);
    expect(env.B).toBe("b");
  });
});

describe("withLocalBin", () => {
  /**
   * Resolving the binary by absolute path is enough to *start* Claude Code and
   * not enough for anything it then shells out to — so the directory a
   * `.desktop` launch is missing goes back on `PATH` as well (§2.4).
   */
  it("appends ~/.local/bin when a minimal PATH is missing it", () => {
    expect(withLocalBin("/usr/bin:/bin", "/home/someone")).toBe(
      "/usr/bin:/bin:/home/someone/.local/bin",
    );
  });

  /**
   * Appended, never prepended: overriding the user's own ordering is how a
   * version manager's shim gets bypassed by a directory they forgot was there.
   */
  it("leaves an existing entry where the user put it", () => {
    expect(withLocalBin("/home/someone/.local/bin:/usr/bin", "/home/someone")).toBe(
      "/home/someone/.local/bin:/usr/bin",
    );
  });

  it("does not add it twice over a trailing slash", () => {
    expect(withLocalBin("/home/someone/.local/bin/:/usr/bin", "/home/someone")).toBe(
      "/home/someone/.local/bin/:/usr/bin",
    );
  });

  it("drops the empty entries that would mean the working directory", () => {
    expect(withLocalBin(":/usr/bin::", "/home/someone")).toBe(
      "/usr/bin:/home/someone/.local/bin",
    );
  });
});

describe("sanitizeSize", () => {
  /**
   * The bridge is a privileged surface (§2.1), so nothing arriving over it is
   * trusted — including from our own renderer, which computes these from a
   * measured element.
   */
  it("takes a measurement whole", () => {
    expect(sanitizeSize({ cols: 62, rows: 40 })).toEqual({ cols: 62, rows: 40 });
  });

  it("floors a fractional measurement rather than passing it to an ioctl", () => {
    expect(sanitizeSize({ cols: 62.9, rows: 40.2 })).toEqual({ cols: 62, rows: 40 });
  });

  /**
   * `TIOCSWINSZ` takes an unsigned short. A renderer that sends 10^9 either
   * wraps to something arbitrary or asks the child to allocate a screen that
   * does not exist.
   */
  it("clamps a real measurement of an unreal element", () => {
    expect(sanitizeSize({ cols: 1e9, rows: 1e9 })).toEqual({
      cols: MAX_DIMENSION,
      rows: MAX_DIMENSION,
    });
    expect(sanitizeSize({ cols: 0, rows: -5 })).toEqual({ cols: 1, rows: 1 });
  });

  /**
   * The distinction the whole function turns on: a number out of range is a
   * measurement of something very small, and is clamped; anything that is not a
   * number is not a measurement at all, and defaulting it would resize a
   * working terminal to 80x24 for no reason the user could see.
   */
  it("refuses what is not a measurement instead of defaulting it", () => {
    expect(sanitizeSize({ cols: Number.NaN, rows: 40 })).toBeNull();
    expect(sanitizeSize({ cols: Number.POSITIVE_INFINITY, rows: 40 })).toBeNull();
    expect(sanitizeSize({ cols: "80", rows: 24 })).toBeNull();
    expect(sanitizeSize({})).toBeNull();
    expect(sanitizeSize(undefined)).toBeNull();
    expect(sanitizeSize(null)).toBeNull();
  });

  it("has a default to start from when the renderer has measured nothing yet", () => {
    expect(DEFAULT_SIZE).toEqual({ cols: 80, rows: 24 });
  });
});
