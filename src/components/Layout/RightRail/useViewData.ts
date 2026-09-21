"use client";
import { useEffect, useState } from "react";
import { postsSelectors, useSelector } from "@/store";
import { extractHeadings, type OutlineHeading } from "@/utils/editorContent";
import { documentScrollerFor } from "@/components/EditDocument/paneChrome";
import { getDesktopBridge } from "@/lib/desktopBridge";
import type { ViewId } from "./panelState";

/**
 * The data the rail badges with and the sections render.
 *
 * Read once, by `RightRail`, and handed to both. That is the whole reason this
 * file exists: going from an all-visible stack to one-visible means the rail has
 * to say what is inside a view without the view being mounted, and the obvious
 * way to do that — have the rail compute its own counts — would run the
 * outline's `MutationObserver` twice whenever that section happened to be open.
 *
 * The cost this makes explicit: the outline's DOM fallback is now eager. It
 * used to run only when the card was expanded; a badge that is only right once
 * you have already looked is not a badge, so the observer now runs for the
 * focused document whether or not the view is on screen.
 */

function extractDomHeadings(el: HTMLElement): OutlineHeading[] {
  const result: OutlineHeading[] = [];
  el.querySelectorAll("h2, h3").forEach((h) => {
    const level = parseInt(h.tagName.slice(1), 10) as 2 | 3;
    const text = h.textContent?.trim() ?? "";
    if (text) result.push({ text, level, key: text });
  });
  return result;
}

/**
 * A document's headings, lifted out of `OutlineSection`.
 *
 * The DOM fallback comes with it, and its reason is unchanged: in view mode
 * (`/view/[id]`) `doc.data` is the `EMPTY_EDITOR_STATE` placeholder `loadPosts`
 * stores to keep every document's content out of memory at startup, so the
 * rendered HTML is the only copy of the headings there is.
 */
export const useOutlineHeadings = (
  activeDocId: string | null,
  /** Scoped to the focused pane's scroller — in a split, the other pane's
   * headings belong to the other pane's outline. */
  paneId: string | null,
) => {
  const [domHeadings, setDomHeadings] = useState<OutlineHeading[]>([]);

  const docData = useSelector((state) => {
    if (!activeDocId) return undefined;
    return postsSelectors.selectById(state, activeDocId)?.data;
  });

  const jsonHeadings = extractHeadings(docData);
  const needsDomFallback = jsonHeadings.length === 0;

  useEffect(() => {
    if (!needsDomFallback) return;
    const el = documentScrollerFor(paneId);
    if (!el) return;
    setDomHeadings(extractDomHeadings(el));
    const observer = new MutationObserver(() =>
      setDomHeadings(extractDomHeadings(el))
    );
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [needsDomFallback, activeDocId, paneId]);

  return needsDomFallback ? domHeadings : jsonHeadings;
};

/**
 * How many revisions the focused document has.
 *
 * The *section* can show more than this: it has a "This tab / All tabs" filter,
 * and "All tabs" sums every tab in the pane. The badge deliberately reports the
 * section's default rather than its current filter — a rail icon that changed
 * its number because of a chip inside a panel that may not even be open would
 * be reporting on the control instead of on the document.
 */
const useRevisionCount = (activeDocId: string | null): number =>
  useSelector((state) =>
    activeDocId
      ? postsSelectors.selectById(state, activeDocId)?.revisions?.length ?? 0
      : 0
  );

/**
 * What each rail icon knows about its view.
 *
 * `count: null` means the view has no number worth showing — Properties is a
 * fixed set of keys, and "7 properties" tells nobody anything. It is distinct
 * from `0`, which is a real emptiness and dims the icon.
 */
export interface ViewSignal {
  count: number | null;
  /** Nothing to show for this document — dims the icon, never disables it. */
  empty: boolean;
}

/**
 * Whether the terminal view has anything behind it — i.e. whether the shell's
 * preload bridge is there at all (docs/plans/in-app-terminal.md §2.1).
 *
 * Read in an effect rather than during render, and it starts `false`. Both
 * halves matter. `getDesktopBridge()` answers `null` on the server — the
 * desktop build runs a real Next server in the shell's child process, so there
 * *is* a server pass — and a value that differs between that pass and the first
 * client render is the hydration mismatch `docs/guides/hydration.md` is about.
 * The same shape as `LayoutModeContext`'s stored bar state, for the same
 * reason, and it costs the same single frame.
 *
 * `false` is the right starting answer rather than merely the convenient one:
 * an icon dimmed for a moment on every desktop launch would be saying the
 * feature is unavailable in exactly the build where it is.
 *
 * This is never `true` on the web build, because on the web build the view is
 * not in `VIEW_IDS` and this signal is never read.
 */
const useTerminalUnavailable = (): boolean => {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => setUnavailable(getDesktopBridge() === null), []);
  return unavailable;
};

export const useViewSignals = (
  rootId: string | null,
  activeDocId: string | null,
  headingCount: number,
): Record<ViewId, ViewSignal> => {
  const pendingAgentChanges = useSelector((state) =>
    state.ui.proposals.count.total
  );
  // The active tab, not the pane's root: Revisions is a per-tab list, and the
  // badge has to agree with the list it is a summary of.
  const revisionCount = useRevisionCount(activeDocId);
  const terminalUnavailable = useTerminalUnavailable();

  return {
    // Global: never dimmed for want of an open document, because it is the one
    // view that still has something to say when nothing is open.
    "agent-changes": {
      count: pendingAgentChanges,
      empty: pendingAgentChanges === 0,
    },
    outline: { count: headingCount, empty: headingCount === 0 },
    // No count, but a real emptiness: with nothing open there are no properties
    // to show at all.
    properties: { count: null, empty: !rootId },
    revisions: { count: revisionCount, empty: revisionCount === 0 },
    // No count, like Properties: one session per window (§4.7) is not a number
    // anybody needs on a rail. `empty` is the bridge's absence rather than an
    // idle session — a session that has not been started yet is one keystroke
    // away, and dimming the icon for that would be reporting on the view's
    // lifecycle instead of on what is behind it.
    terminal: { count: null, empty: terminalUnavailable },
  };
};
