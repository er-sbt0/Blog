import { useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { actions, useDispatch, useSelector } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { registerSaveCallback, unregisterSaveCallback } from "../saveRegistry";
import type { EditorDocument, EditorDocumentRevision } from "@/types";
import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";

export function useCloudSave(
  document: EditorDocument | undefined,
  editorRef: RefObject<LexicalEditor | null>,
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

      // Always generate a fresh revision ID so the upsert in createRevision
      // creates a new record rather than hitting the no-op update:{} branch.
      const revisionId = uuidv4();
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
      // Sync local data + head so that on reload useDocumentLoader finds heads
      // matching and loads the correct content rather than stale local state.
      await dispatch(actions.updateLocalDocument({
        id: document.id,
        partial: { data, head: revisionId, updatedAt: timestamp, parentId: document.parentId },
      }));
      lastSavedCloud.current = serializedData;
      dispatch(actions.markTabClean(document.id));
      return true;
    } catch (err) {
      errorAnnounce("Failed to auto-save document to cloud", err);
      return false;
    }
  }, [document, user, dispatch, editorRef, errorAnnounce]);

  const docId = document?.id;
  useEffect(() => {
    if (!docId) return;
    registerSaveCallback(docId, saveToCloud);
    return () => {
      unregisterSaveCallback(docId);
    };
  }, [docId, saveToCloud]);

  return { saveToCloud, lastSavedCloud };
}
