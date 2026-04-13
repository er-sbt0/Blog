"use client";
import { useMemo } from "react";
import { UserDocument } from "@/types";

interface UseDocumentFilteringProps {
  documents: UserDocument[];
}

/**
 * Custom hook to filter posts for blog structure
 */
export const useDocumentFiltering = ({
  documents,
}: UseDocumentFilteringProps) => {
  const regularDocuments = useMemo(
    () =>
      documents.filter((doc) => {
        const docData = doc.local || doc.cloud;
        return docData?.type === "DOCUMENT";
      }),
    [documents],
  );

  return { regularDocuments };
};
