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
      let editorDocument: EditorDocument | undefined;
      try {
        editorDocument = await dispatch(
          actions.getLocalDocument(docId),
        ).unwrap();
      } catch {
        // not found locally — will try cloud
      }

      if (editorDocument) {
        if (!isCancelled()) setIsLoading(false);

        if (user) {
          try {
            const cloudPayload = await dispatch(
              actions.getCloudDocument(docId),
            ).unwrap();
            if (isCancelled()) return;
            const { cloudDocument: _cloud, ...cloudEditorDocument } =
              cloudPayload as ReturnType<
                typeof actions.getCloudDocument.fulfilled
              >["payload"];
            if (editorDocument.head !== cloudEditorDocument.head) {
              dispatch(actions.setDirty(true));
            } else {
              lastSavedCloud.current = JSON.stringify(editorDocument.data);
            }
          } catch {
            if (isCancelled()) return;
            dispatch(actions.setDirty(true));
          }
        }
      } else {
        try {
          const cloudPayload = await dispatch(
            actions.getCloudDocument(docId),
          ).unwrap() as ReturnType<
            typeof actions.getCloudDocument.fulfilled
          >["payload"];
          if (isCancelled()) return;
          const { cloudDocument: _cloud, ...cloudEditorDoc } = cloudPayload;
          lastSavedCloud.current = JSON.stringify(cloudEditorDoc.data);
          await dispatch(actions.createLocalDocument(cloudEditorDoc));
          if (!isCancelled()) setIsLoading(false);
          const editorDocumentRevision = {
            id: cloudEditorDoc.head,
            documentId: cloudEditorDoc.id,
            createdAt: cloudEditorDoc.updatedAt,
            data: cloudEditorDoc.data,
          };
          dispatch(actions.createLocalRevision(editorDocumentRevision));
        } catch (err) {
          if (isCancelled()) return;
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
            } catch (createErr) {
              errorAnnounce("Failed to create notes document", createErr);
              if (!isCancelled()) {
                setError({
                  title: "Failed to Create Notes",
                  subtitle: "Please try again",
                });
              }
            }
          } else {
            if (!isCancelled()) {
              setError(err as { title: string; subtitle?: string });
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
