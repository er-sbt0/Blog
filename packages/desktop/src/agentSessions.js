import fs from "node:fs";
import path from "node:path";
import { isGrant, MAX_GRANTS } from "./agentPermissions.js";

/**
 * Which folder each agent session runs in, remembered by the main process
 * (docs/plans/archive/agent-block.md §4.3, phase 1).
 *
 * A block stores its session id and, for display, the folder. When a post is
 * reopened after a restart and its block sends a follow-up, main has to know
 * the folder to `resume` in — and §4.3's rule is that the renderer never names
 * one. So the folder the dialog returned is recorded **here**, keyed by the id
 * main minted, and a resume reads it back from here, never from the block. A
 * renderer that edits the stored `cwd` in a post changes what the chip says and
 * nothing else.
 *
 * Phase 2 adds each session's **grants** ("always for this session",
 * `agentPermissions.js`) to the same record, for the same reason: a reopened
 * block shows its grants and claims them on send, and main re-applies one only
 * if it is recorded here too. A grant the renderer names that this file does
 * not hold is never applied.
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
      write({ ...read(), [sessionId]: { cwd, at: now(), grants: [] } });
    },

    /** The grants recorded for `sessionId`; `[]` for none or an unknown id. */
    grantsOf(sessionId) {
      if (!isSessionId(sessionId)) return [];
      const grants = read()[sessionId]?.grants;
      return Array.isArray(grants) ? grants.filter(isGrant).slice(0, MAX_GRANTS) : [];
    },

    /** Replace a known session's grants. An id with no folder record is ignored. */
    setGrants(sessionId, grants) {
      if (!isSessionId(sessionId)) return;
      const sessions = read();
      const entry = sessions[sessionId];
      if (!entry || typeof entry.cwd !== "string") return;
      const kept = (Array.isArray(grants) ? grants : []).filter(isGrant).slice(0, MAX_GRANTS);
      write({ ...sessions, [sessionId]: { ...entry, grants: kept } });
    },
  };

  function write(sessions) {
    const kept = Object.entries(sessions)
      .sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0))
      .slice(0, MAX_REMEMBERED);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, sessions: Object.fromEntries(kept) }));
    fs.renameSync(temp, file);
  }
}
