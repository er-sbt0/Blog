import { useMemo } from "react";
import { actions, useDispatch } from "@/store";
import type { EditorDocument } from "@/types";
import type { EditorState, LexicalEditor } from "lexical";
import { debounce } from "@mui/material/utils";
import { v4 as uuidv4 } from "uuid";

export function useAutoSave(document: EditorDocument | undefined) {
  const dispatch = useDispatch();

  const debouncedUpdateLocalDocument = useMemo(
    () =>
      debounce((id: string, partial: Partial<EditorDocument>) => {
        dispatch(actions.updateLocalDocument({ id, partial }));
        dispatch(actions.setDirty(true));
      }, 300),
    [dispatch],
  );

  function handleChange(
    editorState: EditorState,
    _editor: LexicalEditor,
    tags: Set<string>,
  ) {
    if (!document) return;
    const data = editorState.toJSON();
    const updatedDocument: Partial<EditorDocument> = {
      data,
      updatedAt: new Date().toISOString(),
      head: uuidv4(),
      parentId: document.parentId,
    };
    const tagValue = tags.values().next().value as string | undefined;
    if (tagValue) {
      try {
        const payload = JSON.parse(tagValue);
        if (payload.id === document.id) {
          Object.assign(updatedDocument, payload.partial);
        }
      } catch (e) {
        console.error("Failed to parse editor change tag payload:", e);
      }
    }
    debouncedUpdateLocalDocument(document.id, updatedDocument);
  }

  return { handleChange };
}
