"use client";
import { useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";

/**
 * Hook to filter documents for all posts (regardless of published status)
 * Uses series.posts as source of truth for series posts, and documents for standalone posts.
 * Delegates to the memoized `selectAllPosts` Reselect selector so derivation is shared
 * across component instances and only recomputes when `documents` or `series` change.
 */
export const usePostsFiltering = () => {
  const allPosts = useSelector(selectAllPosts);

  return {
    allPosts,
    totalCount: allPosts.length,
  };
};
