/**
 * The sidebar's host → project → session → subagent grouping and its filter
 * (docs/plans/remote-claude.md §4.6).
 */
import type {
  RemoteHostSummary,
  RemoteSessionSummary,
} from "@/lib/claudeSessions/types";
import { buildSessionTree } from "../sessionTree";

const host = (id: string): RemoteHostSummary => ({
  id,
  alias: id,
  label: id.toUpperCase(),
  lastSyncAt: null,
  lastError: null,
  createdAt: "2026-10-01T00:00:00Z",
});

const session = (over: Partial<RemoteSessionSummary> & { id: string }): RemoteSessionSummary => ({
  hostId: "h1",
  path: `-home-dev-app/${over.id}.jsonl`,
  projectDir: "-home-dev-app",
  title: null,
  cwd: "/home/dev/app",
  cwdGuessed: false,
  gitBranch: null,
  startedAt: "2026-10-01T00:00:00Z",
  endedAt: "2026-10-01T01:00:00Z",
  goneAt: null,
  isSubagent: false,
  parentId: null,
  activeMs: 0,
  userMsgs: 0,
  assistantMsgs: 0,
  toolCalls: 0,
  size: 0,
  ...over,
});

const tree = {
  hosts: [host("h1"), host("h2")],
  sessions: [
    session({ id: "old", title: "Old work", endedAt: "2026-09-01T00:00:00Z" }),
    session({ id: "new", title: "New work", gitBranch: "feat/login" }),
    session({ id: "sub", title: "Find callers", isSubagent: true, parentId: "new" }),
    session({ id: "lost", title: "Orphan run", isSubagent: true, parentId: "missing" }),
    session({ id: "other", projectDir: "-srv-x", cwd: "/srv/x", cwdGuessed: true }),
  ],
};

it("groups by host and project, newest first, subagents under their session", () => {
  const [h1, h2] = buildSessionTree(tree);
  expect(h2.projects).toEqual([]);
  expect(h1.projects.map((p) => p.label)).toEqual(["/home/dev/app", "/srv/x"]);
  const app = h1.projects[0];
  expect(app.sessions.map((n) => n.session.id)).toEqual(["new", "lost", "old"]);
  expect(app.sessions[0].subagents.map((s) => s.id)).toEqual(["sub"]);
  expect(h1.projects[1].guessed).toBe(true);
});

it("filters on title, cwd and branch, keeping a session for a matching subagent", () => {
  const byBranch = buildSessionTree(tree, "LOGIN");
  expect(byBranch).toHaveLength(1);
  expect(byBranch[0].projects[0].sessions.map((n) => n.session.id)).toEqual(["new"]);

  const bySub = buildSessionTree(tree, "callers");
  expect(bySub[0].projects[0].sessions).toEqual([
    expect.objectContaining({ session: expect.objectContaining({ id: "new" }), subagents: [expect.objectContaining({ id: "sub" })] }),
  ]);

  expect(buildSessionTree(tree, "/srv")[0].projects.map((p) => p.projectDir)).toEqual(["-srv-x"]);
  expect(buildSessionTree(tree, "nothing like this")).toEqual([]);
});

it("falls back to the project directory when no cwd is known", () => {
  const [h] = buildSessionTree({ hosts: [host("h1")], sessions: [session({ id: "a", cwd: null })] });
  expect(h.projects[0]).toMatchObject({ label: "-home-dev-app", guessed: false });
});
