"use client";
import { useCallback, useEffect, useState } from "react";
import { UserDocument } from "@/types";

interface UseDocumentsResult {
  documents: UserDocument[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing documents with server-side initial data and client-side refresh.
 *
 * @param initialDocuments - Server-rendered documents for instant first paint
 * @returns documents state, loading state, and refresh function
 */
export function useDocuments(
  initialDocuments: UserDocument[],
): UseDocumentsResult {
  const [documents, setDocuments] = useState<UserDocument[]>(initialDocuments);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents", {
        cache: "no-store",
      });
      const data = await response.json();

      if (data.data) {
        // API returns Document[] - convert to UserDocument[] format
        const userDocuments: UserDocument[] = data.data.map((doc: any) => ({
          id: doc.id,
          cloud: doc,
        }));
        setDocuments(userDocuments);
      }
    } catch (error) {
      console.error("Failed to refresh documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Refresh when window gains focus (user returns to tab)
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return {
    documents,
    loading,
    refresh,
  };
}
