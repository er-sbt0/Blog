/**
 * Sending from the bar with no post open (docs/plans/archive/agent-bar.md §2.7, §4.3):
 * the author picks a post — a new one, or one from the library — it opens in
 * a pane, and the prompt goes to that pane's editor once it can take one.
 *
 * Plain functions over plain values, like `agentBar.ts`, so a spec can drive
 * the whole hand-off without a store, a router or an editor.
 */

/** How long a picked post may take to open before the bar gives up. */
export const PICK_OPEN_TIMEOUT_MS = 30_000;

/**
 * A prompt waiting for the post it was sent to: the pane has been asked for,
 * and its editor cannot take the prompt yet.
 */
export interface AgentPending {
  prompt: string;
  docId: string;
  since: number;
}

/** What the bar can see of the workspace right now. */
export interface PendingView {
  /**
   * The focused pane's root and its active tab — `null` off the workspace
   * route, where no pane is on screen whatever the layout remembers. Either
   * naming the post counts: opening a post another pane holds as a tab
   * focuses that pane rather than rooting a new one.
   */
  focusedRootId: string | null;
  focusedDocId: string | null;
  /** Whether the bar's editor is the one mounted in the focused pane. */
  editorInFocusedPane: boolean;
  /** `useFocusedEditor`'s reading of that editor. */
  editorState: "none" | "loading" | "readonly" | "ready";
}

export type PendingEffect =
  | { kind: "send"; docId: string; prompt: string }
  | { kind: "fail"; message: string };

/**
 * One step of the hand-off: the pending prompt after looking at `view`, and
 * what to do about it. Sending and failing both clear the pending prompt, so
 * the send happens once however often this is asked — a second call with the
 * returned `null` does nothing.
 */
export function advancePending(
  pending: AgentPending | null,
  view: PendingView,
  now: number,
  timeoutMs = PICK_OPEN_TIMEOUT_MS,
): { pending: AgentPending | null; effect: PendingEffect | null } {
  if (!pending) return { pending, effect: null };
  const named = view.focusedRootId === pending.docId ||
    view.focusedDocId === pending.docId;
  const fail = (message: string) => ({
    pending: null,
    effect: { kind: "fail" as const, message },
  });
  if (named && view.editorInFocusedPane) {
    if (view.editorState === "ready") {
      return {
        pending: null,
        effect: { kind: "send", docId: pending.docId, prompt: pending.prompt },
      };
    }
    if (view.editorState === "readonly") {
      return fail("the post opened in read mode");
    }
  }
  // Another post in front is not a reason to give up: the editor that
  // mounts first on arrival may not be the picked post's yet. It is a reason
  // not to send — only `named` sends, and the bound
  // ends a wait for a post the author has since navigated away from.
  if (now - pending.since >= timeoutMs) {
    return fail("the post did not open in time");
  }
  return { pending, effect: null };
}

/** The fields of a post the picker reads. */
export interface PickablePost {
  id: string;
  title: string;
  updatedAt: string | Date;
}

const time = (value: string | Date) => new Date(value).getTime() || 0;

/**
 * The picker's results: titles containing every word of `query`, ignoring
 * case, most recently updated first. An empty query lists the most recent.
 */
export function matchPosts<T extends PickablePost>(
  posts: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return posts
    .filter((post) => {
      const title = (post.title || "Untitled").toLowerCase();
      return words.every((word) => title.includes(word));
    })
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .slice(0, limit);
}
