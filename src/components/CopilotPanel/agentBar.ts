/**
 * What the desktop bar shows of the agent (docs/plans/archive/agent-bar.md §4.2), as
 * plain functions over plain values so a spec can answer them without an
 * editor or a window.
 *
 * The bar is the input and the post is the display (§2.1), so almost all of
 * this is about *not* showing things: a running turn is the node's to show,
 * and the bar says only what it must — whether it can send, Stop while a turn
 * of this post runs, and "waiting on you" from any post (§6.5).
 *
 * Editors are compared by identity only, so they are typed as `unknown` here
 * and a spec can hand in any object.
 */

/** Where the window's agent host stands: read in an effect, so first unknown. */
export type AgentHostState = "pending" | "missing" | "present";

/**
 * What the bar can see of the focused post's editor: none (no post focused,
 * or a route without panes), loading (a post is focused but its editor has
 * not mounted yet), read mode, or ready.
 */
export type AgentEditorState = "none" | "loading" | "readonly" | "ready";

export type AgentBarAvailability =
  | { state: "ready" }
  /** No post is open: a send asks where to work first (§2.7, `agentPick.ts`). */
  | { state: "pick" }
  | { state: "loading"; reason: string }
  | { state: "disabled"; reason: string };

/**
 * Whether the bar can send, and if not, the one line it shows instead (DESIGN.md
 * §9's loading and disabled states). The host is asked first: without one,
 * nothing about the post matters.
 */
export function agentBarAvailability(
  host: AgentHostState,
  editor: AgentEditorState,
): AgentBarAvailability {
  if (host === "pending") return { state: "loading", reason: "Connecting…" };
  if (host === "missing") {
    return {
      state: "disabled",
      reason: "This desktop shell cannot run the agent — update the app",
    };
  }
  switch (editor) {
    case "loading":
      return { state: "loading", reason: "Opening the post…" };
    case "none":
      return { state: "pick" };
    case "readonly":
      return { state: "disabled", reason: "This post is in read mode" };
    default:
      return { state: "ready" };
  }
}

/** The fields of `AgentTurnState` this module reads. */
export interface TurnLike {
  editor: unknown;
  nodeKey: string;
  phase: "idle" | "running" | "waiting";
}

/**
 * The turn Stop and `Esc` act on: one running in the focused post, preferring
 * its current session's node. `null` when nothing in this post is running —
 * a turn in another post is not the bar's to stop (§6.5).
 */
export function turnToStop<T extends TurnLike>(
  turns: readonly T[],
  editor: unknown,
  currentNodeKey: string | null,
): T | null {
  if (!editor) return null;
  const here = turns.filter((t) => t.editor === editor && t.phase !== "idle");
  return here.find((t) => t.nodeKey === currentNodeKey) ?? here[0] ?? null;
}

/**
 * The permission card the bar points at, from any post: this post's first,
 * because that is the one the author is most likely to be about to answer.
 * `here` says which, so the bar can name the other post.
 */
export function turnWaitingOnYou<T extends TurnLike>(
  turns: readonly T[],
  editor: unknown,
): { turn: T; here: boolean } | null {
  const waiting = turns.filter((t) => t.phase === "waiting");
  const mine = editor ? waiting.find((t) => t.editor === editor) : undefined;
  if (mine) return { turn: mine, here: true };
  return waiting[0] ? { turn: waiting[0], here: false } : null;
}

/**
 * The session chip's text. `null` when there is nothing to say: a post with
 * no session node and no "new session" armed — the next send makes one.
 */
export function sessionChipLabel(
  session: { turns: number } | null,
  fresh: boolean,
): string | null {
  if (fresh) return "new session";
  if (!session) return null;
  if (session.turns === 0) return "session · not started";
  return `session · ${session.turns} turn${session.turns === 1 ? "" : "s"}`;
}

/** Why a draft cannot go, before it is tried; `null` when it can. */
export function promptProblem(draft: string, max: number): string | null {
  const length = draft.trim().length;
  if (length <= max) return null;
  return `${length.toLocaleString("en-US")} characters — the limit is ${
    max.toLocaleString("en-US")
  }`;
}
