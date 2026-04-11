"use client";
import { useCallback, useEffect } from "react";
import { useSelector } from "@/store";
import { useRouter } from "next/navigation";
import type { EditorDocument } from "@/types";

export function useDocumentNavigation(
  document: EditorDocument | undefined,
) {
  const router = useRouter();
  const isDirty = useSelector((state) => state.ui.isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSaveAndNavigate = useCallback(() => {
    if (document) {
      const handle = document.handle || document.id;
      router.push(`/view/${handle}`);
    }
  }, [document, router]);

  const handleDiscard = useCallback(() => {
    if (document) {
      const handle = document.handle || document.id;
      router.push(`/view/${handle}`);
    }
  }, [document, router]);

  return { handleSaveAndNavigate, handleDiscard };
}
