"use client";
import { useState } from "react";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";
import { actions, useDispatch, useSelector } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import {
  type DocumentCreateInput,
  type EditorDocument,
  WELCOME_NOTES_EDITOR_STATE,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

export function useDocumentLoader(
  id: string | undefined,
  lastSavedCloud: React.MutableRefObject<string | null>,
) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; subtitle?: string }>();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const errorAnnounce = useErrorAnnounce();

  useAsyncEffect(async (isCancelled) => {
    const loadDocument = async (docId: string) => {
      const localResponse = await dispatch(actions.getLocalDocument(docId));
      if (localResponse.type === actions.getLocalDocument.fulfilled.type) {
        const editorDocument = localResponse.payload as EditorDocument;
        if (!isCancelled()) setIsLoading(false);

        if (user) {
          const cloudResponse = await dispatch(actions.getCloudDocument(docId));
          if (isCancelled()) return;
          if (cloudResponse.type === actions.getCloudDocument.fulfilled.type) {
            const { cloudDocument: _cloud, ...cloudEditorDocument } =
              cloudResponse.payload as ReturnType<
                typeof actions.getCloudDocument.fulfilled
              >["payload"];
            if (editorDocument.head !== cloudEditorDocument.head) {
              dispatch(actions.setDirty(true));
            } else {
              lastSavedCloud.current = JSON.stringify(editorDocument.data);
            }
          } else {
            dispatch(actions.setDirty(true));
          }
        }
      } else {
        const cloudResponse = await dispatch(actions.getCloudDocument(docId));
        if (isCancelled()) return;
        if (cloudResponse.type === actions.getCloudDocument.fulfilled.type) {
          const { cloudDocument: _cloud, ...editorDocument } = cloudResponse
            .payload as ReturnType<
              typeof actions.getCloudDocument.fulfilled
            >["payload"];
          lastSavedCloud.current = JSON.stringify(editorDocument.data);
          await dispatch(actions.createLocalDocument(editorDocument));
          if (!isCancelled()) setIsLoading(false);
          const editorDocumentRevision = {
            id: editorDocument.head,
            documentId: editorDocument.id,
            createdAt: editorDocument.updatedAt,
            data: editorDocument.data,
          };
          dispatch(actions.createLocalRevision(editorDocumentRevision));
        } else if (
          cloudResponse.type === actions.getCloudDocument.rejected.type
        ) {
          if (docId === "notes" && user) {
            try {
              const now = new Date().toISOString();
              const documentId = uuidv4();
              const revisionId = uuidv4();

              const newDocument: EditorDocument = {
                id: documentId,
                name: "My Notes",
                description: "Your personal notes document",
                handle: "notes",
                createdAt: now,
                updatedAt: now,
                head: revisionId,
                type: "DOCUMENT",
                data: WELCOME_NOTES_EDITOR_STATE,
              };

              await dispatch(actions.createLocalDocument(newDocument));

              const revision = {
                id: revisionId,
                documentId: documentId,
                createdAt: now,
                data: newDocument.data,
              };

              await dispatch(actions.createLocalRevision(revision));

              const cloudDocumentPayload: DocumentCreateInput = {
                ...newDocument,
                published: false,
                private: true,
                collab: false,
              };

              await dispatch(actions.createCloudDocument(cloudDocumentPayload));
              await dispatch(actions.createCloudRevision(revision));

              if (!isCancelled()) setIsLoading(false);
            } catch (err) {
              errorAnnounce("Failed to create notes document", err);
              if (!isCancelled()) {
                setError({
                  title: "Failed to Create Notes",
                  subtitle: "Please try again",
                });
              }
            }
          } else {
            if (!isCancelled()) {
              setError(
                cloudResponse.payload as { title: string; subtitle?: string },
              );
            }
          }
        }
      }
    };

    if (id) {
      await loadDocument(id);
    } else if (!isCancelled()) {
      setError({ title: "Document Not Found" });
    }

    return () => {
      dispatch(actions.setDiff({ open: false }));
      dispatch(actions.setDirty(false));
    };
  }, [dispatch, user]);

  return { isLoading, error };
}
