"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

type UseDocumentNavigationProps = Record<string, never>;

/**
 * Custom hook for blog post navigation actions
 * Simplified for blog structure without directories or domains
 */
export const useDocumentNavigation = (
  {}: UseDocumentNavigationProps = {},
) => {
  const router = useRouter();

  const createDocument = useCallback(() => {
    router.push("/new");
  }, [router]);

  return { createDocument };
};
