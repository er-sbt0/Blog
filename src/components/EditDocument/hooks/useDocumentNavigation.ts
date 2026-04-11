"use client";
import { useCallback, useEffect } from "react";
import { actions, useDispatch, useSelector } from "@/store";
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
  const isDirty = useSelector((state) => state.ui.isDirty);

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
      const head = uuidv4();
      await dispatch(
        actions.updateLocalDocument({
          id: document.id,
          partial: { data, updatedAt: now, head, parentId: document.parentId },
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
    const handle = document.handle || document.id;
    router.push(`/view/${handle}`);
  }, [document, editorRef, dispatch, router]);

  const handleDiscard = useCallback(() => {
    if (document) {
      const handle = document.handle || document.id;
      router.push(`/view/${handle}`);
    }
  }, [document, router]);

  return { handleSaveAndNavigate, handleDiscard };
}
