"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface UseDocumentNavigationProps {
  // No props needed for simplified blog structure
}

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
