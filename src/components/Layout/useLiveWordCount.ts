"use client";
/**
 * The focused document's word count, read off its live editor.
 *
 * The status bar used to count the store's `post.data`, which is the content
 * as it was *loaded*: autosave writes a revision without writing the tree back
 * into Redux (quiet autosave), so a post typed into — or written by the agent —
 * read "No content yet" until it was reopened (docs/plans/archive/agent-bar.md
 * §6.8). Writing the document back on every save would undo that design, so
 * the count goes to the editor instead.
 *
 * ### Which editor
 *
 * `ActiveEditorContext`, which the focused pane's active panel publishes. It
 * is a ref, set before the editor necessarily exists, so while a document is
 * focused and no editor has turned up this looks again every
 * `EDITOR_POLL_MS` — the same answer `AgentComposer` gives the same problem.
 * An editor is only believed once its root sits inside the panel for
 * `docId` (`locateEditor`): during a switch the context can still name the
 * previous post's editor, and a count from it is exactly the stale reading
 * this must not show. Read mode is the same editor with `editable` off, so it
 * needs nothing of its own.
 *
 * ### Cost
 *
 * A selection-only update (no dirty nodes) is ignored, and the rest coalesce
 * into one count per idle period, so a keystroke pays for nothing but the
 * schedule. The count itself is one pass over the node map with no string of
 * the whole post built — `wordsInText` per text node.
 */
import { useContext, useEffect, useState } from "react";
import { $isTextNode, type EditorState, type LexicalEditor } from "lexical";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { locateEditor } from "@/components/CopilotPanel/agentJump";
import { wordsInText } from "@/utils/editorContent";

/** How often to look for a focused document's editor that has not mounted. */
const EDITOR_POLL_MS = 250;

/** The longest an idle-scheduled count may wait behind continuous work. */
const IDLE_TIMEOUT_MS = 1000;

/** A live count, tagged with the document it was taken from. */
export interface LiveWordCount {
  docId: string;
  words: number;
}

/**
 * Words in an editor state, counted as `countWords` counts the serialized
 * tree: `text` nodes only, so code highlights and decorators stay out of it.
 */
function countEditorWords(state: EditorState): number {
  return state.read(() => {
    let words = 0;
    for (const node of state._nodeMap.values()) {
      if ($isTextNode(node) && node.getType() === "text") {
        words += wordsInText(node.getTextContent());
      }
    }
    return words;
  });
}

type Cancel = () => void;

function scheduleIdle(fn: () => void): Cancel {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}

/**
 * The live count for `docId`, or `null` while its editor is not mounted. A
 * count taken from another document's editor is never returned.
 */
export function useLiveWordCount(docId: string | null): number | null {
  const ref = useContext(ActiveEditorContext);
  const [live, setLive] = useState<LiveWordCount | null>(null);

  useEffect(() => {
    if (!docId) return;
    let current: LexicalEditor | null = null;
    let offs: Cancel[] = [];
    let pending: Cancel | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const release = () => {
      pending?.();
      pending = null;
      for (const off of offs) off();
      offs = [];
    };
    const count = () => {
      pending = null;
      if (!current) return;
      setLive({ docId, words: countEditorWords(current.getEditorState()) });
    };
    const matches = (editor: LexicalEditor | null) =>
      editor?.getRootElement()?.isConnected &&
        locateEditor(editor).docId === docId
        ? editor
        : null;

    const check = () => {
      const next = matches(ref.current);
      if (next && timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!next && !timer) timer = setInterval(check, EDITOR_POLL_MS);
      if (next === current) return;
      release();
      current = next;
      if (!next) {
        setLive(null);
        return;
      }
      count();
      offs = [
        next.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
          pending ??= scheduleIdle(count);
        }),
        // The panel unmounting takes the root away; look again rather than
        // count an editor nobody can see.
        next.registerRootListener((root) => {
          if (!root) queueMicrotask(check);
        }),
      ];
    };
    check();
    return () => {
      if (timer) clearInterval(timer);
      release();
    };
  }, [ref, docId]);

  return live && live.docId === docId ? live.words : null;
}
