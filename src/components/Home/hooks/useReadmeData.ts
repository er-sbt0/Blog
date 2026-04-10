"use client";
import { useState } from "react";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { UserDocument } from "@/types";
import { apiClient } from "@/api";

export interface ReadmeData {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export function useReadmeData(documents: UserDocument[]) {
  const errorAnnounce = useErrorAnnounce();
  const [readme, setReadme] = useState<ReadmeData | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(true);

  // Find README from documents prop OR fetch it separately
  useAsyncEffect(async (isCancelled) => {
    const readmeDoc = documents.find((doc) => {
      const data = doc.cloud || doc.local;
      const name = data?.name || "";
      return name.toLowerCase() === "readme";
    });

    if (readmeDoc) {
      const data = readmeDoc.cloud || readmeDoc.local;
      if (data && !isCancelled()) {
        setReadme({
          id: readmeDoc.id,
          name: data.name,
          description: data.description || undefined,
          updatedAt: String(data.updatedAt),
        });
        return;
      }
    }

    // README not in documents - try to fetch it from API
    try {
      const data = await apiClient.documents.list();
      if (isCancelled()) return;

      const readmeFromApi = data?.find((doc) =>
        doc.name?.toLowerCase() === "readme"
      );

      if (readmeFromApi) {
        setReadme({
          id: readmeFromApi.id,
          name: readmeFromApi.name,
          description: readmeFromApi.description || undefined,
          updatedAt: String(readmeFromApi.updatedAt),
        });
      } else {
        setReadme(null);
      }
    } catch (err) {
      errorAnnounce("Failed to fetch documents for README:", err);
      if (!isCancelled()) setReadme(null);
    }
  }, [documents]);

  // Fetch HTML content when readme is found
  useAsyncEffect(async (isCancelled) => {
    if (readme === null) {
      // Explicitly null means we checked and there's no README
      setHtml(null);
      setLoadingHtml(false);
      return;
    }

    if (!readme) {
      // undefined means we're still loading
      return;
    }

    setLoadingHtml(true);
    try {
      const docResult = await apiClient.documents.get(readme.id);

      if (!docResult?.data?.root) {
        throw new Error("Invalid document data");
      }

      if (isCancelled()) return;

      const generatedHtml = await apiClient.embed.render(docResult.data);
      setHtml(generatedHtml);
    } catch (err) {
      errorAnnounce("Failed to fetch README HTML:", err);
      if (!isCancelled()) setHtml(null);
    } finally {
      if (!isCancelled()) setLoadingHtml(false);
    }
  }, [readme]);

  return { readme, html, loadingHtml };
}
