import { useCallback, useEffect, useRef } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { registerSaveCallback, unregisterSaveCallback } from "../saveRegistry";
import type { EditorDocument, EditorDocumentRevision } from "@/types";
import type { LexicalEditor } from "lexical";
import { v4 as uuidv4 } from "uuid";

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

      const revisionId = uuidv4();
      const now = new Date().toISOString();

      const revision: EditorDocumentRevision = {
        id: revisionId,
        documentId: document.id,
        createdAt: now,
        data,
      };

      const documentUpdate = {
        id: document.id,
        partial: {
          head: revisionId,
          updatedAt: now,
          parentId: document.parentId,
        },
      };

      const revisionResponse = await dispatch(
        actions.createCloudRevision(revision),
      );

      if (
        revisionResponse.type === actions.createCloudRevision.fulfilled.type
      ) {
        const docResponse = await dispatch(
          actions.updateCloudDocument(documentUpdate),
        );

        if (docResponse.type === actions.updateCloudDocument.fulfilled.type) {
          lastSavedCloud.current = serializedData;
          dispatch(actions.setDirty(false));
          return true;
        }
      }

      return false;
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
