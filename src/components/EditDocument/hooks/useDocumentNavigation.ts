"use client";
import { useCallback, useEffect } from "react";
import { actions, documentsSelectors, selectIsDirty, useDispatch, useSelector } from "@/store";
import { useRouter } from "next/navigation";
import type { EditorDocument } from "@/types";
import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";
import { v4 as uuidv4 } from "uuid";

export function useDocumentNavigation(
  document: EditorDocument | undefined,
  editorRef: RefObject<LexicalEditor | null>,
) {
  const router = useRouter();
  const dispatch = useDispatch();
  const isDirty = useSelector(selectIsDirty);
  const localRevisions = useSelector((state) => {
    if (!document) return [];
    const doc = documentsSelectors.selectById(state, document.id);
    return doc?.local?.revisions ?? [];
  });

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSaveAndNavigate = useCallback(async () => {
    if (!document) return;
    const editorState = editorRef.current?.getEditorState();
    if (editorState) {
      const data = editorState.toJSON();
      const now = new Date().toISOString();

      // Check if the current head already points to a local revision.
      // If so, update the existing revision in-place instead of creating a new one.
      const isHeadLocalRevision = localRevisions.some(
        (r) => r.id === document.head,
      );

      if (isHeadLocalRevision) {
        // Update existing local revision and document data in-place
        await dispatch(
          actions.updateLocalDocument({
            id: document.id,
            partial: {
              data,
              updatedAt: now,
              head: document.head,
              parentId: document.parentId,
            },
          }),
        );
        await dispatch(
          actions.updateLocalRevision({
            id: document.head,
            documentId: document.id,
            createdAt: now,
            data,
          }),
        );
      } else {
        // Create a new local revision with a fresh head
        const head = uuidv4();
        await dispatch(
          actions.updateLocalDocument({
            id: document.id,
            partial: {
              data,
              updatedAt: now,
              head,
              parentId: document.parentId,
            },
          }),
        );
        await dispatch(
          actions.createLocalRevision({
            id: head,
            documentId: document.id,
            createdAt: now,
            data,
          }),
        );
      }
    }
    const handle = document.handle || document.id;
    router.push(`/view/${handle}`);
  }, [document, editorRef, dispatch, router, localRevisions]);

  const handleDiscard = useCallback(() => {
    if (document) {
      const handle = document.handle || document.id;
      router.push(`/view/${handle}`);
    }
  }, [document, router]);

  return { handleSaveAndNavigate, handleDiscard };
}
