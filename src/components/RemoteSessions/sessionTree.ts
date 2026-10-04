/**
 * The sidebar's host → project → session → subagent tree, built from the flat
 * `GET /api/remote-sessions/sessions` answer (docs/plans/remote-claude.md
 * §4.6), and the client-side text filter over it.
 *
 * Import-free (type imports are erased), like `SideBar/dragGeometry.ts`.
 */
import type {
  RemoteHostSummary,
  RemoteSessionSummary,
  RemoteSessionsTree,
} from "@/lib/claudeSessions/types";

export interface SessionNode {
  session: RemoteSessionSummary;
  subagents: RemoteSessionSummary[];
}

export interface ProjectNode {
  /** `${hostId}:${projectDir}` — unique across hosts, for expand state. */
  key: string;
  hostId: string;
  projectDir: string;
  /** The newest session's cwd, falling back to the directory name. */
  label: string;
  guessed: boolean;
  sessions: SessionNode[];
}

export interface HostNode {
  host: RemoteHostSummary;
  projects: ProjectNode[];
  sessionCount: number;
}

/** Newest first by the time the session last did anything. */
const recency = (s: RemoteSessionSummary): number => {
  const t = Date.parse(s.endedAt ?? s.startedAt ?? "");
  return Number.isNaN(t) ? 0 : t;
};
const newestFirst = (a: RemoteSessionSummary, b: RemoteSessionSummary) =>
  recency(b) - recency(a);

/**
 * Does a session match the filter? Title, cwd and branch, case-insensitively.
 * `q` is already lower-cased and trimmed.
 */
const matches = (s: RemoteSessionSummary, q: string): boolean =>
  [s.title, s.cwd, s.gitBranch, s.projectDir].some((v) => v?.toLowerCase().includes(q));

/**
 * Builds the tree. With a filter, a session stays when it or one of its
 * subagent runs matches (and then keeps only the matching runs, unless the
 * session itself matched), and hosts and projects left empty drop out — except
 * that with no filter every host stays, so an unsynced host still has a row to
 * hang its Sync button on.
 */
export function buildSessionTree(tree: RemoteSessionsTree, filter = ""): HostNode[] {
  const q = filter.trim().toLowerCase();
  const byId = new Map(tree.sessions.map((s) => [s.id, s]));
  const subagentsOf = new Map<string, RemoteSessionSummary[]>();
  const tops: RemoteSessionSummary[] = [];
  for (const s of tree.sessions) {
    // A subagent whose parent is not in the list is shown as a session rather
    // than lost.
    if (s.isSubagent && s.parentId && byId.has(s.parentId)) {
      const list = subagentsOf.get(s.parentId) ?? [];
      list.push(s);
      subagentsOf.set(s.parentId, list);
    } else {
      tops.push(s);
    }
  }

  const out: HostNode[] = [];
  for (const host of tree.hosts) {
    const projects = new Map<string, ProjectNode>();
    let sessionCount = 0;
    for (const s of tops.filter((t) => t.hostId === host.id).sort(newestFirst)) {
      let subs = (subagentsOf.get(s.id) ?? []).slice().sort(newestFirst);
      if (q && !matches(s, q)) {
        subs = subs.filter((sub) => matches(sub, q));
        if (subs.length === 0) continue;
      }
      sessionCount++;
      let project = projects.get(s.projectDir);
      if (!project) {
        // The first session seen is the newest, so its cwd names the project.
        project = {
          key: `${host.id}:${s.projectDir}`,
          hostId: host.id,
          projectDir: s.projectDir,
          label: s.cwd || s.projectDir,
          guessed: Boolean(s.cwd) && s.cwdGuessed,
          sessions: [],
        };
        projects.set(s.projectDir, project);
      }
      project.sessions.push({ session: s, subagents: subs });
    }
    if (q && sessionCount === 0) continue;
    out.push({ host, projects: [...projects.values()], sessionCount });
  }
  return out;
}

/** Messages in a session, as the secondary line counts them. */
export const messageCount = (s: RemoteSessionSummary): number =>
  s.userMsgs + s.assistantMsgs;
