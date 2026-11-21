"use client";
/**
 * Taking the author from the bar to a session node — and, when one is open,
 * its permission card (docs/plans/archive/agent-bar.md §3, §4.2).
 *
 * The bar knows a turn only by its editor and node key (`turns.ts`), so where
 * that editor lives is read off the DOM: `EditorTabPanel` marks its root with
 * the pane and the tab it belongs to. A node in a background tab or an
 * unfocused pane is made visible first — `display: none` cannot be scrolled
 * to or focused — and the scroll waits for the render that shows it.
 */
import type { LexicalEditor, NodeKey } from "lexical";
import { actions, type AppDispatch } from "@/store";

export interface EditorLocation {
  paneId: string | null;
  docId: string | null;
}

/** The pane and tab holding `editor`, when it is mounted in one. */
export function locateEditor(editor: LexicalEditor): EditorLocation {
  const panel = editor.getRootElement()?.closest<HTMLElement>(
    "[data-editor-pane]",
  );
  return {
    paneId: panel?.dataset.editorPane ?? null,
    docId: panel?.dataset.editorDoc ?? null,
  };
}

/** The first answerable button of an open card inside `element`. */
const pendingCardButton = (element: HTMLElement) =>
  element.querySelector<HTMLButtonElement>(
    '[role="group"][data-state="pending"] button:not(:disabled)',
  );

/**
 * Show the node, centred. With `toCard`, focus the first choice on its open
 * card, which also makes its pane the focused one (focus is DOM focus,
 * `WorkspacePanes.tsx`) — a keyboard author can answer without a click.
 */
export function revealAgentNode(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  dispatch: AppDispatch,
  { toCard }: { toCard: boolean },
): void {
  const { paneId, docId } = locateEditor(editor);
  if (paneId) {
    dispatch(actions.focusPane(paneId));
    if (docId) dispatch(actions.setActiveTab({ paneId, tabId: docId }));
  }
  // A task, not a frame: the dispatch commits when the click's event ends, and
  // `scrollIntoView` forces the layout of a tab that has just been shown.
  // `requestAnimationFrame` would also wait for a paint, which a window that
  // is covered does not produce — the jump would then wait for it to be seen.
  setTimeout(() => {
    const element = editor.getElementByKey(nodeKey);
    if (!element) return;
    // Instant: a smooth scroll is driven by frames too, and stalls part-way
    // in a window that is not painting.
    element.scrollIntoView({ block: "center" });
    if (toCard) pendingCardButton(element)?.focus({ preventScroll: true });
  }, 0);
}
