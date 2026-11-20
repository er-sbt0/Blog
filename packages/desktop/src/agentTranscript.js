import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSessionId } from "./agentSessions.js";

/**
 * A session's whole record: the SDK's own `<sessionId>.jsonl`
 * (docs/plans/archive/agent-block.md §3.3, phase 6).
 *
 * The block keeps a capped log — 4 KB an entry, 400 entries — because it is
 * stored in every revision of the post. What it cut is still on disk, in the
 * transcript Claude Code writes for every session, and the block's "Full
 * transcript" link shows it. This file finds and reads that transcript; the
 * renderer parses and renders it as text (`TranscriptView`).
 *
 * ### The path is main's, never the renderer's
 *
 * The renderer sends a session id and nothing else. The folder comes from
 * main's own record of the session (`agentSessions.js`, or the live entry),
 * the directory is derived from it the way the CLI derives it, and the id is
 * checked to be a UUID main could have minted before it becomes a filename. So
 * every byte of the path is either main's record, a constant, or `[0-9a-f-]`:
 * there is no traversal to refuse because there is nothing to traverse with.
 * The file is still opened `O_NOFOLLOW` and must be a regular file.
 *
 * ### Where the CLI keeps it
 *
 * `<config>/projects/<encoded cwd>/<sessionId>.jsonl`, where `<config>` is
 * `CLAUDE_CONFIG_DIR` or `~/.claude`, and the encoding replaces every character
 * that is not `[a-zA-Z0-9]` with `-` (SDK 0.3.309, `pl()` in `sdk.mjs`). An
 * encoded name longer than 200 characters is cut to 200 and given a hash
 * suffix; rather than copy a hash function that is the CLI's business, a long
 * one is found by its 200-character prefix and the session's own file name,
 * which is a UUID and so unique on its own.
 *
 * ### The cap
 *
 * `MAX_TRANSCRIPT_BYTES`. A longer file is read from its **start**, cut at the
 * last whole line, and flagged: the block's log keeps the newest entries and
 * drops the oldest, so the beginning is the part the link exists to recover.
 *
 * No `electron` import: the spec drives it against a temporary directory.
 */

export const MAX_TRANSCRIPT_BYTES = 20 * 1024 * 1024;
/** Where the CLI starts hashing a project directory's name. */
export const MAX_PROJECT_DIR = 200;

/** The CLI's project directory name for `cwd`. */
export const encodeProjectDir = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** Claude Code's config directory, as the SDK child resolves it. */
export const claudeConfigDir = (env = process.env, home = os.homedir()) =>
  env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");

/** The transcript's path, or null when there is none. */
export async function findTranscript({ configDir, cwd, sessionId }) {
  if (!isSessionId(sessionId) || typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    return null;
  }
  const projects = path.join(configDir, "projects");
  const encoded = encodeProjectDir(cwd);
  const file = `${sessionId}.jsonl`;
  if (encoded.length <= MAX_PROJECT_DIR) {
    const candidate = path.join(projects, encoded, file);
    return (await isFile(candidate)) ? candidate : null;
  }
  const prefix = `${encoded.slice(0, MAX_PROJECT_DIR)}-`;
  let names;
  try {
    names = await fs.readdir(projects);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const candidate = path.join(projects, name, file);
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

async function isFile(candidate) {
  try {
    return (await fs.lstat(candidate)).isFile();
  } catch {
    return false;
  }
}

/**
 * `{ ok: true, text, size, truncated }` or `{ ok: false, error }`. Never
 * throws: a missing or unreadable file is an answer the block can show.
 */
export async function readTranscript({
  configDir = claudeConfigDir(),
  cwd,
  sessionId,
  maxBytes = MAX_TRANSCRIPT_BYTES,
}) {
  const file = await findTranscript({ configDir, cwd, sessionId });
  if (!file) {
    return {
      ok: false,
      error: "Claude Code has no transcript for this session on this computer " +
        "yet — it is written when the session's first turn starts.",
    };
  }
  let handle;
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) return { ok: false, error: "The session's transcript is not a file." };
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    const truncated = stat.size > read;
    let bytes = buffer.subarray(0, read);
    if (truncated) {
      const lastNewline = bytes.lastIndexOf(0x0a);
      bytes = lastNewline >= 0 ? bytes.subarray(0, lastNewline + 1) : bytes.subarray(0, 0);
    }
    return { ok: true, text: bytes.toString("utf8"), size: stat.size, truncated };
  } catch (cause) {
    return {
      ok: false,
      error: `The session's transcript could not be read: ${cause?.message ?? cause}`,
    };
  } finally {
    await handle?.close();
  }
}
