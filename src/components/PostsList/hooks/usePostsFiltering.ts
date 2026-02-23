"use client";
import { useSelector } from "@/store";
import { useMemo } from "react";
import { UserDocument } from "@/types";

/**
 * Hook to filter documents for all posts (regardless of published status)
 * Uses series.posts as source of truth for series posts, and documents for standalone posts
 */
export const usePostsFiltering = () => {
  const documents = useSelector((state) => state.documents);
  const series = useSelector((state) => state.series);

  const filteredPosts = useMemo(() => {
    // Collect all post IDs from series
    const seriesPostIds = new Set<string>();
    const seriesPosts: UserDocument[] = [];

    series.forEach((s) => {
      s.posts?.forEach((post) => {
        seriesPostIds.add(post.id);
        seriesPosts.push({
          id: post.id,
          cloud: post as any, // Series posts are CloudDocument format
        });
      });
    });

    // Get standalone posts (not in any series)
    const standalonePosts = documents.filter((doc) => {
      const docData = doc.cloud || doc.local;
      return docData?.type === "DOCUMENT" && !seriesPostIds.has(doc.id);
    });

    // Combine series posts and standalone posts
    return [...seriesPosts, ...standalonePosts];
  }, [documents, series]);

  return {
    allPosts: filteredPosts,
    totalCount: filteredPosts.length,
  };
};
