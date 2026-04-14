import { UserDocument } from "@/types";
import { generateHtml } from "@/editor/utils/generateHtml";
import documentDB from "@/indexeddb";
import thumbnailCache from "./thumbnailCache";

/** Injectable thumbnail fetcher — defaults to the real API client. */
type ThumbnailFetcher = (documentId: string) => Promise<string | null>;

let _defaultFetcher: ThumbnailFetcher | null = null;
async function defaultFetcher(documentId: string): Promise<string | null> {
  if (!_defaultFetcher) {
    // Lazy-import so the API client is never bundled into non-browser contexts.
    const { apiClient } = await import("@/api");
    _defaultFetcher = async (id) =>
      (await apiClient.thumbnails.get(id)) ?? null;
  }
  const fetcher = _defaultFetcher;
  return fetcher(documentId);
}

/**
 * Enhanced thumbnail loading with improved fallback strategies
 *
 * This function implements a robust thumbnail loading strategy with:
 * - Advanced caching using the new ThumbnailCache
 * - Multiple fallback sources
 * - Error handling and retry logic
 * - Performance optimizations
 */
export const loadThumbnailWithFallbacks = async (
  userDocument?: UserDocument,
  fetchThumbnail: ThumbnailFetcher = defaultFetcher,
): Promise<string | null> => {
  if (!userDocument) return null;

  const document = userDocument.local || userDocument.cloud;
  if (!document?.id || !document?.head) return null;

  const cacheKey = document.head;
  const documentId = document.id;

  try {
    // 1. Check advanced cache first
    const cachedThumbnail = thumbnailCache.get(cacheKey);
    if (cachedThumbnail) {
      return cachedThumbnail;
    }

    // 2. Try local/IndexedDB document (fastest)
    const localThumbnail = await loadFromLocalDocument(documentId);
    if (localThumbnail) {
      thumbnailCache.set(cacheKey, localThumbnail);
      return localThumbnail;
    }

    // 3. Fallback to API (slowest)
    const apiThumbnail = await loadFromAPI(documentId, fetchThumbnail);
    if (apiThumbnail) {
      thumbnailCache.set(cacheKey, apiThumbnail);
      return apiThumbnail;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to load thumbnail for document ${documentId}:`, error);
    return null;
  }
};

/**
 * Load thumbnail from a document stored in IndexedDB
 */
const loadFromLocalDocument = async (
  documentId: string,
): Promise<string | null> => {
  try {
    const document = await documentDB.getByID(documentId);
    if (!document?.data) return null;

    const data = document.data;
    const thumbnail = await generateHtml({
      ...data,
      root: { ...data.root, children: data.root.children.slice(0, 3) },
    });

    return thumbnail;
  } catch (error) {
    console.warn("Failed to load from local document:", error);
    return null;
  }
};

/**
 * Load thumbnail from API with retry logic
 */
const loadFromAPI = async (
  documentId: string,
  fetchThumbnail: ThumbnailFetcher,
  retries = 2,
): Promise<string | null> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchThumbnail(documentId);
      if (data) {
        return data;
      }

      // If not successful and we have retries left, wait before retry
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    } catch (error) {
      console.warn(`API attempt ${attempt + 1} failed:`, error);

      // If it's the last attempt, don't retry
      if (attempt === retries) {
        throw error;
      }
    }
  }

  return null;
};
