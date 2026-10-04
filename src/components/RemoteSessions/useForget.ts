"use client";
/**
 * Forget — the feature's only delete (docs/plans/remote-claude.md §4.8), per
 * session, per project and per host. Each one confirms first, and the
 * confirmation says what makes it irreversible: a session still on the remote
 * comes back on the next sync, and one gone from the remote does not.
 */
import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actions, useDispatch } from "@/store";
import { useConfirm } from "@/hooks/useConfirm";
import { errorMessage, remoteSessionsApi } from "@/api/remoteSessions";
import type {
  RemoteHostSummary,
  RemoteSessionSummary,
} from "@/lib/claudeSessions/types";
import { refreshSessions } from "./sessionsStore";
import type { ProjectNode } from "./sessionTree";

const RETURNS =
  "A session still on the remote comes back on the next sync. One marked “gone from remote” cannot be recovered — this deletes the only copy.";

export function useForget() {
  const confirm = useConfirm();
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  const run = useCallback(
    async (work: () => Promise<unknown>, failTitle: string, viewedIds: string[]) => {
      try {
        await work();
      } catch (error) {
        dispatch(actions.announce({ message: { title: failTitle, subtitle: errorMessage(error) } }));
        return;
      }
      // Leave a transcript that no longer exists rather than showing its 404.
      if (viewedIds.some((id) => pathname === `/sessions/${id}`)) router.push("/sessions");
      await refreshSessions();
    },
    [dispatch, pathname, router],
  );

  const forgetSession = useCallback(
    async (session: RemoteSessionSummary, subagents: RemoteSessionSummary[] = []) => {
      const name = session.title ?? "Untitled session";
      const ok = await confirm({
        title: "Forget this session?",
        content: `“${name}”${
          subagents.length ? ` and its ${subagents.length} subagent run(s)` : ""
        } will be deleted from this machine. ${
          session.goneAt
            ? "It is gone from the remote, so this cannot be undone."
            : "It is still on the remote and will come back on the next sync."
        }`,
        confirmLabel: "Forget",
      });
      if (!ok) return;
      await run(
        () => remoteSessionsApi.sessions.forget(session.id),
        "Could not forget the session",
        [session.id, ...subagents.map((s) => s.id)],
      );
    },
    [confirm, run],
  );

  const forgetProject = useCallback(
    async (project: ProjectNode) => {
      const ok = await confirm({
        title: "Forget this project?",
        content: `Every session under ${project.label} (${project.sessions.length}) will be deleted from this machine. ${RETURNS}`,
        confirmLabel: "Forget project",
      });
      if (!ok) return;
      await run(
        () => remoteSessionsApi.hosts.forgetProject(project.hostId, project.projectDir),
        "Could not forget the project",
        project.sessions.flatMap((n) => [n.session.id, ...n.subagents.map((s) => s.id)]),
      );
    },
    [confirm, run],
  );

  const forgetHost = useCallback(
    async (host: RemoteHostSummary, sessionIds: string[] = []) => {
      const ok = await confirm({
        title: `Remove ${host.label}?`,
        content: `The host and every session synced from it will be deleted from this machine. Adding it again and syncing restores what is still on the remote; anything gone from the remote cannot be recovered.`,
        confirmLabel: "Remove host",
      });
      if (!ok) return;
      await run(() => remoteSessionsApi.hosts.forget(host.id), "Could not remove the host", sessionIds);
    },
    [confirm, run],
  );

  return { forgetSession, forgetProject, forgetHost };
}
