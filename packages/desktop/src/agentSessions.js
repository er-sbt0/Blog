import fs from "node:fs";
import path from "node:path";

/**
 * Which folder each agent session runs in, remembered by the main process
 * (docs/plans/agent-block.md §4.3, phase 1).
 *
 * A block stores its session id and, for display, the folder. When a post is
 * reopened after a restart and its block sends a follow-up, main has to know
 * the folder to `resume` in — and §4.3's rule is that the renderer never names
 * one. So the folder the dialog returned is recorded **here**, keyed by the id
 * main minted, and a resume reads it back from here, never from the block. A
 * renderer that edits the stored `cwd` in a post changes what the chip says and
 * nothing else.
 *
 * Sync I/O on a small file, like `windowState.js`: it is read once per resume
 * and written once per new session. A missing or corrupt file reads as empty —
 * losing it costs old blocks their resume (they say so), never a crash.
 */

export const MAX_REMEMBERED = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True for something shaped like an id main minted (`randomUUID`). */
export const isSessionId = (value) => typeof value === "string" && UUID_RE.test(value);

export function createSessionStore(file, { now = () => Date.now() } = {}) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const sessions = parsed && typeof parsed.sessions === "object" ? parsed.sessions : {};
      return sessions ?? {};
    } catch {
      return {};
    }
  }

  return {
    /** The folder `sessionId` was started in, or null. */
    lookup(sessionId) {
      if (!isSessionId(sessionId)) return null;
      const entry = read()[sessionId];
      return entry && typeof entry.cwd === "string" && path.isAbsolute(entry.cwd)
        ? entry.cwd
        : null;
    },

    /** Record a new session's folder, dropping the oldest past the cap. */
    remember(sessionId, cwd) {
      if (!isSessionId(sessionId) || !path.isAbsolute(cwd)) return;
      const sessions = { ...read(), [sessionId]: { cwd, at: now() } };
      const kept = Object.entries(sessions)
        .sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0))
        .slice(0, MAX_REMEMBERED);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, sessions: Object.fromEntries(kept) }));
      fs.renameSync(temp, file);
    },
  };
}
