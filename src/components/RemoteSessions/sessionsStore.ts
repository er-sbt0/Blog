"use client";
/**
 * The one copy of the sessions tree and of every host's sync state, shared by
 * the sidebar view, Settings → Remote hosts and the `/sessions` landing
 * (docs/plans/remote-claude.md §4.6).
 *
 * A module-level store behind `useSyncExternalStore` rather than Redux: nothing
 * else in the app reads it, it is desktop-only, and a sync started from the
 * sidebar has to show its progress in Settings too — which two component-local
 * states could not do.
 *
 * A sync has two phases the user can see. `reading` is the main process moving
 * bytes, reported by `onProgress`; it ends at `done === total`. `indexing` is
 * the server re-deriving entries in `finish`, which reports nothing and can take
 * ~18 s on a large first sync (§7.2) — so it is shown as indeterminate from the
 * moment reading completes until `sync()` resolves.
 */
import { useSyncExternalStore } from "react";
import { errorMessage, remoteSessionsApi } from "@/api/remoteSessions";
import type { RemoteSessionsTree } from "@/lib/claudeSessions/types";
import { getDesktopBridge } from "@/lib/desktopBridge";

export type SyncState =
  | { phase: "reading"; done: number; total: number }
  | { phase: "indexing" };

export interface SessionsStoreState {
  status: "idle" | "loading" | "ready" | "error";
  tree: RemoteSessionsTree | null;
  error: string | null;
  /** Hosts with a sync in flight. */
  syncing: Record<string, SyncState>;
  /**
   * A sync the bridge itself reported as failed. The server records ssh's
   * message as the host's `lastError` too; this covers a failure that never
   * reached the server (the bridge missing, the main process refusing).
   */
  syncErrors: Record<string, string>;
}

let state: SessionsStoreState = {
  status: "idle",
  tree: null,
  error: null,
  syncing: {},
  syncErrors: {},
};
const listeners = new Set<() => void>();

const set = (patch: Partial<SessionsStoreState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => state;

let inflight: Promise<void> | null = null;

/**
 * Fetches the tree. Keeps showing the previous tree while a refresh is in
 * flight, so a refresh after a sync does not flash the skeleton.
 */
export function refreshSessions(): Promise<void> {
  if (inflight) return inflight;
  if (!state.tree) set({ status: "loading", error: null });
  inflight = remoteSessionsApi.sessions
    .tree()
    .then((tree) => set({ status: "ready", tree, error: null }))
    .catch((error) =>
      set(state.tree
        ? { error: errorMessage(error) }
        : { status: "error", error: errorMessage(error) })
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

let progressAttached = false;
function attachProgress() {
  if (progressAttached) return;
  const bridge = getDesktopBridge();
  if (!bridge?.sessions) return;
  progressAttached = true;
  bridge.sessions.onProgress(({ hostId, done, total }) => {
    if (!state.syncing[hostId]) return;
    set({
      syncing: {
        ...state.syncing,
        [hostId]: done >= total ? { phase: "indexing" } : { phase: "reading", done, total },
      },
    });
  });
}

/** Syncs one host and refreshes the tree when it is done, either way. */
export async function syncHost(hostId: string): Promise<void> {
  if (state.syncing[hostId]) return;
  const bridge = getDesktopBridge();
  const { [hostId]: _cleared, ...syncErrors } = state.syncErrors;
  if (!bridge?.sessions) {
    set({ syncErrors: { ...syncErrors, [hostId]: "Sync needs the desktop app." } });
    return;
  }
  attachProgress();
  set({
    syncErrors,
    syncing: { ...state.syncing, [hostId]: { phase: "reading", done: 0, total: 0 } },
  });
  let failure: string | null = null;
  try {
    const result = await bridge.sessions.sync(hostId);
    if (!result.ok) failure = result.error;
  } catch (error) {
    failure = errorMessage(error);
  }
  const { [hostId]: _done, ...syncing } = state.syncing;
  set({
    syncing,
    ...(failure ? { syncErrors: { ...state.syncErrors, [hostId]: failure } } : {}),
  });
  await refreshSessions();
}

export const useSessionsStore = (): SessionsStoreState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
