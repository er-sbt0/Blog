import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  claudeConfigDir,
  encodeProjectDir,
  findTranscript,
  MAX_PROJECT_DIR,
  readTranscript,
} from "../agentTranscript.js";

/**
 * Finding and reading an agent session's own `.jsonl`
 * (docs/plans/archive/agent-block.md phase 6), against a temporary config
 * directory laid out the way the CLI lays out `~/.claude/projects`.
 */

const SESSION = "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10";
const LINE = JSON.stringify({ type: "user", message: { content: "hello" } });

let config: string;
beforeEach(() => {
  config = fs.mkdtempSync(path.join(os.tmpdir(), "agent-transcript-"));
});
afterEach(() => fs.rmSync(config, { recursive: true, force: true }));

function write(cwd: string, body: string, name = encodeProjectDir(cwd)) {
  const dir = path.join(config, "projects", name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${SESSION}.jsonl`);
  fs.writeFileSync(file, body);
  return file;
}

describe("where the CLI keeps a session", () => {
  it("encodes the folder as the CLI does", () => {
    expect(encodeProjectDir("/home/me/code/blog-simple")).toBe("-home-me-code-blog-simple");
    expect(encodeProjectDir("/home/me/my_proj.v2")).toBe("-home-me-my-proj-v2");
    expect(encodeProjectDir("/home/me/ünï")).toBe("-home-me--n-");
  });

  it("honours CLAUDE_CONFIG_DIR as the child does", () => {
    const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
    expect(claudeConfigDir(env({ CLAUDE_CONFIG_DIR: "/cfg" }), "/home/me")).toBe("/cfg");
    expect(claudeConfigDir(env({}), "/home/me")).toBe(path.join("/home/me", ".claude"));
  });

  it("finds the file, and a long folder by its 200-character prefix", async () => {
    const file = write("/w/project", LINE);
    expect(await findTranscript({ configDir: config, cwd: "/w/project", sessionId: SESSION })).toBe(file);

    const long = `/w/${"a".repeat(MAX_PROJECT_DIR + 40)}`;
    const hashed = `${encodeProjectDir(long).slice(0, MAX_PROJECT_DIR)}-k3j2h1`;
    const longFile = write(long, LINE, hashed);
    expect(await findTranscript({ configDir: config, cwd: long, sessionId: SESSION })).toBe(longFile);
  });

  it("names nothing it was not given: a non-UUID id, a relative folder, another folder", async () => {
    write("/w/project", LINE);
    for (const sessionId of ["../../etc/passwd", "x", "", SESSION.toUpperCase()]) {
      expect(await findTranscript({ configDir: config, cwd: "/w/project", sessionId })).toBeNull();
    }
    expect(await findTranscript({ configDir: config, cwd: "w/project", sessionId: SESSION })).toBeNull();
    expect(await findTranscript({ configDir: config, cwd: "/w/other", sessionId: SESSION })).toBeNull();
  });
});

describe("reading it", () => {
  it("answers with the text, its size and whether it was cut", async () => {
    write("/w/p", `${LINE}\n${LINE}\n`);
    const read = await readTranscript({ configDir: config, cwd: "/w/p", sessionId: SESSION });
    expect(read).toEqual({ ok: true, text: `${LINE}\n${LINE}\n`, size: (LINE.length + 1) * 2, truncated: false });
  });

  it("reads only the start of an oversized file, cut at a whole line", async () => {
    write("/w/p", `${LINE}\n${LINE}\n${LINE}\n`);
    const read = await readTranscript({
      configDir: config,
      cwd: "/w/p",
      sessionId: SESSION,
      maxBytes: LINE.length * 2,
    });
    expect(read).toMatchObject({ ok: true, text: `${LINE}\n`, truncated: true, size: (LINE.length + 1) * 3 });
  });

  it("refuses a symlink in the file's place", async () => {
    const outside = path.join(config, "secret.txt");
    fs.writeFileSync(outside, "not a transcript");
    const dir = path.join(config, "projects", encodeProjectDir("/w/p"));
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(outside, path.join(dir, `${SESSION}.jsonl`));
    const read = await readTranscript({ configDir: config, cwd: "/w/p", sessionId: SESSION });
    expect(read.ok).toBe(false);
  });

  it("says so when there is no transcript yet", async () => {
    const read = await readTranscript({ configDir: config, cwd: "/w/none", sessionId: SESSION });
    expect(read).toMatchObject({ ok: false, error: expect.stringMatching(/no transcript/) });
  });
});
