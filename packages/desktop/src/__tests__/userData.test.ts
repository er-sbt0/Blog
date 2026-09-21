import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { assertDataDirFree, resolveUserData } from "../paths.js";

/**
 * Which library a launch opens, and whether another launch already has it.
 *
 * The default is *shared*: watch mode and the packaged app read the same
 * cluster, because a development run on an empty database is not the app you
 * were trying to work on. That decision is what makes both of these worth a
 * spec — one directory now has two ways in, so the override has to be
 * unambiguous and the collision has to be legible.
 */
describe("resolveUserData", () => {
  const defaultDir = "/home/someone/.config/blog-desktop";

  it("opens the same library in both modes when nothing says otherwise", () => {
    expect(resolveUserData({ argv: ["electron", "."], env: {}, defaultDir })).toEqual({
      dir: defaultDir,
      source: "default",
    });
  });

  it("takes --data-dir=<path>", () => {
    expect(resolveUserData({ argv: ["electron", ".", "--data-dir=/tmp/scratch"], env: {}, defaultDir }))
      .toEqual({ dir: "/tmp/scratch", source: "--data-dir" });
  });

  it("takes --data-dir <path> too", () => {
    expect(resolveUserData({ argv: ["electron", ".", "--data-dir", "/tmp/scratch"], env: {}, defaultDir }).dir)
      .toBe("/tmp/scratch");
  });

  /**
   * The shell does not expand `~` after an `=`, so this would otherwise create
   * a directory literally named `~` beside the repository — and the app would
   * open an empty library for a reason nothing on screen could explain.
   */
  it("expands a leading ~, which the shell does not after an =", () => {
    expect(resolveUserData({ argv: ["--data-dir=~/blog-scratch"], env: {}, defaultDir }).dir)
      .toBe(path.join(homedir(), "blog-scratch"));
  });

  it("makes a relative path absolute rather than resolving it later against something else", () => {
    expect(path.isAbsolute(resolveUserData({ argv: ["--data-dir=scratch"], env: {}, defaultDir }).dir))
      .toBe(true);
  });

  it("falls back to DESKTOP_USER_DATA", () => {
    expect(resolveUserData({ argv: [], env: { DESKTOP_USER_DATA: "/tmp/env" }, defaultDir }))
      .toEqual({ dir: "/tmp/env", source: "DESKTOP_USER_DATA" });
  });

  it("prefers the flag over the variable", () => {
    const resolved = resolveUserData({
      argv: ["--data-dir=/tmp/flag"],
      env: { DESKTOP_USER_DATA: "/tmp/env" },
      defaultDir,
    });
    expect(resolved.dir).toBe("/tmp/flag");
  });

  /**
   * `--user-data-dir` is one of Chromium's own switches and moves the browser
   * profile. Answering to it here would mean two different directories changing
   * from one flag, so the parse must not treat it as a match.
   */
  it("ignores Chromium's own switches, including the one it resembles", () => {
    expect(resolveUserData({
      argv: ["electron", ".", "--no-sandbox", "--user-data-dir=/tmp/chromium"],
      env: {},
      defaultDir,
    }).source).toBe("default");
  });

  it("ignores an empty value rather than opening the filesystem root", () => {
    expect(resolveUserData({ argv: ["--data-dir="], env: {}, defaultDir }).source).toBe("default");
  });
});

describe("assertDataDirFree", () => {
  const made: string[] = [];
  const pgdata = (pid?: number) => {
    const dir = mkdtempSync(path.join(tmpdir(), "desktop-lock-"));
    made.push(dir);
    const data = path.join(dir, "pgdata");
    mkdirSync(data);
    if (pid !== undefined) {
      // postmaster.pid's first line is the pid; the rest is the data directory,
      // the start time, the port and the socket directory.
      writeFileSync(path.join(data, "postmaster.pid"), `${pid}\n${data}\n1758000000\n5432\n/tmp\n`);
    }
    return data;
  };
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("passes a directory nobody is serving", () => {
    expect(() => assertDataDirFree(pgdata())).not.toThrow();
  });

  it("refuses one a live postmaster holds, and says how to run alongside it", () => {
    expect(() => assertDataDirFree(pgdata(process.pid))).toThrow(/already using/);
    expect(() => assertDataDirFree(pgdata(process.pid))).toThrow(/--data-dir/);
  });

  /**
   * The lock file outlives a crash, and refusing to start because of one is how
   * an app becomes unopenable after a kill -9. The pid is what is checked.
   */
  it("ignores a stale file whose process is gone", () => {
    // Above the default pid_max, so it cannot be in use.
    expect(() => assertDataDirFree(pgdata(4_999_999))).not.toThrow();
  });

  it("ignores a truncated or hand-edited file", () => {
    const data = pgdata();
    writeFileSync(path.join(data, "postmaster.pid"), "");
    expect(() => assertDataDirFree(data)).not.toThrow();
    writeFileSync(path.join(data, "postmaster.pid"), "not a pid\n");
    expect(() => assertDataDirFree(data)).not.toThrow();
  });
});
