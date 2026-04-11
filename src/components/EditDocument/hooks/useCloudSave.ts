import { useCallback, useEffect, useRef } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { registerSaveCallback, unregisterSaveCallback } from "../saveRegistry";
import type { EditorDocument, EditorDocumentRevision } from "@/types";
import type { LexicalEditor } from "lexical";

export function useCloudSave(
  document: EditorDocument | undefined,
  editorRef: React.RefObject<LexicalEditor | null>,
) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const errorAnnounce = useErrorAnnounce();
  const lastSavedCloud = useRef<string | null>(null);

  const saveToCloud = useCallback(async () => {
    if (!document || !user) return false;

    try {
      const editorState = editorRef.current?.getEditorState();
      if (!editorState) return false;

      const data = editorState.toJSON();
      const serializedData = JSON.stringify(data);

      if (lastSavedCloud.current === serializedData) {
        return true; // No changes to save
      }

      // Reuse the local document's head ID so local and cloud heads stay in sync,
      // and we don't create a new revision ID if an unsynced local one already exists.
      const revisionId = document.head;
      const timestamp = new Date().toISOString();

      const revision: EditorDocumentRevision = {
        id: revisionId,
        documentId: document.id,
        createdAt: timestamp,
        data,
      };

      const documentUpdate = {
        id: document.id,
        partial: {
          head: revisionId,
          updatedAt: timestamp,
          parentId: document.parentId,
        },
      };

      await dispatch(actions.createCloudRevision(revision)).unwrap();
      await dispatch(actions.updateCloudDocument(documentUpdate)).unwrap();
      lastSavedCloud.current = serializedData;
      dispatch(actions.setDirty(false));
      return true;
    } catch (err) {
      errorAnnounce("Failed to auto-save document to cloud", err);
      return false;
    }
  }, [document, user, dispatch, editorRef, errorAnnounce]);

  useEffect(() => {
    registerSaveCallback(saveToCloud);
    return () => {
      unregisterSaveCallback();
    };
  }, [saveToCloud]);

  return { saveToCloud, lastSavedCloud };
}
