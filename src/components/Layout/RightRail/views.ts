import {
  GitPullRequest,
  History,
  Info,
  type LucideIcon,
  SquareTerminal,
  Table,
} from "lucide-react";
import type { ViewId } from "./panelState";

/**
 * What the rail and the panel header both need to know about a view.
 *
 * One table rather than two, because the rail icon and the panel header title
 * used to be the same fact written in two places — `RailSection` took a `title`
 * and an `icon` from inside each section, and the compact strip repeated both
 * as literals. They drifted: the strip's Agent-changes tooltip said "agent
 * changes waiting for review" while the section called itself "Agent changes".
 *
 * The count is *not* here. It comes from a hook per view (`useViewSignals`),
 * because three of the five need a selector and two need a fetch, and a
 * descriptor that could hold a hook would be a component in a lookup table.
 */
interface ViewDescriptor {
  id: ViewId;
  /** The panel header's title, and the rail tooltip. */
  title: string;
  icon: LucideIcon;
  /**
   * Whether the view speaks about the open document or about the account.
   *
   * Only `agent-changes` is global, and that is load-bearing rather than
   * incidental: an agent writes to whatever it was asked about, so work waiting
   * on the author is not a property of the document that happens to be open.
   * It is the one view with something to say when nothing is open, and the one
   * whose rail icon must not be dimmed just because the workspace is empty.
   */
  scope: "document" | "global";
  /**
   * What the badge counts, for the icon's accessible name. Rendered into
   * "3 pending changes" / "1 revision", so it has to read as a noun.
   */
  countNoun: readonly [singular: string, plural: string];
}

export const VIEWS: Record<ViewId, ViewDescriptor> = {
  "agent-changes": {
    id: "agent-changes",
    title: "Agent changes",
    icon: GitPullRequest,
    scope: "global",
    countNoun: ["change waiting for review", "changes waiting for review"],
  },
  outline: {
    id: "outline",
    title: "Outline",
    icon: Table,
    scope: "document",
    countNoun: ["heading", "headings"],
  },
  properties: {
    id: "properties",
    title: "Properties",
    icon: Info,
    scope: "document",
    countNoun: ["property", "properties"],
  },
  revisions: {
    id: "revisions",
    title: "Revisions",
    icon: History,
    scope: "document",
    countNoun: ["revision", "revisions"],
  },
  /**
   * Claude Code, in a PTY (docs/plans/in-app-terminal.md §4.3).
   *
   * Described here in both builds although `VIEW_IDS` only carries it in the
   * desktop one: this table is total over `ViewId` so that anything holding a
   * stored id — the panel header, the rail label — can name it without first
   * asking which build it is in. Membership is `VIEW_IDS`' decision and only
   * `VIEW_IDS`'.
   *
   * `global`, for the same reason `agent-changes` is: the session is not about
   * the document that happens to be focused. It has a cwd of its own (§4.6), it
   * outlives the pane you started it from (§4.7), and an agent writes to
   * whatever it was asked about. Dimming its icon because the workspace is
   * empty would be describing the wrong thing.
   *
   * The noun is "session" and it is never rendered today — the view has no
   * count (`useViewData`) — but it has to be the honest one for when it does:
   * one session per window is §4.7's decision, so the plural is what a tab
   * strip would need rather than a number this view could show now.
   */
  terminal: {
    id: "terminal",
    title: "Terminal",
    icon: SquareTerminal,
    scope: "global",
    countNoun: ["session", "sessions"],
  },
};

/**
 * A rail icon's accessible name.
 *
 * The count belongs in the name rather than only in the badge: the badge is a
 * number in a circle, which a screen reader either reads as a bare digit next
 * to an icon or skips entirely. "Revisions, 3 revisions" is clumsy, so the
 * count replaces the plain title rather than following it.
 */
export const railIconLabel = (view: ViewId, count: number | null): string => {
  const { title, countNoun } = VIEWS[view];
  if (count === null || count === 0) return title;
  return `${title}, ${count} ${count === 1 ? countNoun[0] : countNoun[1]}`;
};
