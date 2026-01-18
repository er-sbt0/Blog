import { Series, UserDocument } from "@/types";

/**
 * Represents either a series group (with posts) or a standalone post
 */
export interface SeriesGroupItem {
  type: "series" | "standalone";
  /** For series: the series object. For standalone: undefined */
  series?: Series;
  /** For series: posts in the series. For standalone: single post array */
  posts: UserDocument[];
  /** Sort key timestamp for ordering groups/posts together */
  sortKey: number;
}

/**
 * Get the series ID from a UserDocument
 */
export const getPostSeriesId = (doc: UserDocument): string | null => {
  return doc.cloud?.seriesId || doc.local?.seriesId || null;
};

/**
 * Get the series order from a UserDocument
 */
export const getPostSeriesOrder = (doc: UserDocument): number | null => {
  return doc.cloud?.seriesOrder ?? doc.local?.seriesOrder ?? null;
};

/**
 * Get the creation date timestamp from a UserDocument
 */
const getPostCreatedAtTime = (doc: UserDocument): number => {
  const createdAt = doc.cloud?.createdAt || doc.local?.createdAt;
  return createdAt ? new Date(createdAt).getTime() : 0;
};

/**
 * Get the creation date timestamp from a Series
 */
const getSeriesCreatedAtTime = (series: Series): number => {
  return series.createdAt ? new Date(series.createdAt).getTime() : 0;
};

/**
 * Group posts by series and return a mixed list of series groups and standalone posts,
 * sorted by their respective creation times (newest first).
 *
 * - Posts belonging to a series are grouped together
 * - Series groups are sorted by series.createdAt
 * - Standalone posts (no series) are sorted by post.createdAt
 * - The final list interleaves series groups and standalone posts by their sort keys
 *
 * @param posts - Array of UserDocument posts
 * @param seriesMap - Map of series ID to Series object for metadata lookup
 * @returns Array of SeriesGroupItem sorted by creation time (newest first)
 */
export const groupPostsBySeries = (
  posts: UserDocument[],
  seriesMap: Map<string, Series>,
): SeriesGroupItem[] => {
  // Group posts by series ID
  const seriesGroups = new Map<string, UserDocument[]>();
  const standalonePosts: UserDocument[] = [];

  posts.forEach((post) => {
    const seriesId = getPostSeriesId(post);

    if (seriesId && seriesMap.has(seriesId)) {
      if (!seriesGroups.has(seriesId)) {
        seriesGroups.set(seriesId, []);
      }
      seriesGroups.get(seriesId)!.push(post);
    } else {
      standalonePosts.push(post);
    }
  });

  // Build the result array
  const result: SeriesGroupItem[] = [];

  // Add series groups
  seriesGroups.forEach((groupPosts, seriesId) => {
    const series = seriesMap.get(seriesId)!;

    // Sort posts within series by creation time (newest first)
    const sortedPosts = [...groupPosts].sort((a, b) => {
      const timeA = getPostCreatedAtTime(a);
      const timeB = getPostCreatedAtTime(b);
      return timeB - timeA; // Newest first
    });

    result.push({
      type: "series",
      series,
      posts: sortedPosts,
      sortKey: getSeriesCreatedAtTime(series),
    });
  });

  // Add standalone posts
  standalonePosts.forEach((post) => {
    result.push({
      type: "standalone",
      posts: [post],
      sortKey: getPostCreatedAtTime(post),
    });
  });

  // Sort all items by sortKey (newest first)
  result.sort((a, b) => b.sortKey - a.sortKey);

  return result;
};

/**
 * Build a Map of series ID to Series object from an array of Series
 */
export const buildSeriesMap = (seriesList: Series[]): Map<string, Series> => {
  const map = new Map<string, Series>();
  seriesList.forEach((series) => {
    map.set(series.id, series);
  });
  return map;
};

/**
 * Flatten grouped items back to a sorted array of posts
 * Useful when you need a flat list but with series posts grouped together
 */
export const flattenGroupedPosts = (
  groups: SeriesGroupItem[],
): UserDocument[] => {
  return groups.flatMap((group) => group.posts);
};

/**
 * Deduplicate series across time partitions by consolidating all posts
 * of a series into the first partition where the series appears.
 *
 * This solves the problem where a series with posts spanning multiple time periods
 * would appear in each period with only the posts from that period, creating
 * multiple fragmented series cards instead of one unified card.
 *
 * Example scenario:
 * - Series "Web Dev Basics" has 4 posts:
 *   - Post 1 (Jan 2025, Q1)
 *   - Post 2 (Feb 2025, Q1)
 *   - Post 3 (May 2025, Q2)
 *   - Post 4 (Aug 2025, Q3)
 *
 * Without deduplication (current behavior):
 * - Q1 2025: Series card with Posts 1, 2
 * - Q2 2025: Series card with Post 3
 * - Q3 2025: Series card with Post 4
 *
 * With deduplication (desired behavior):
 * - Q1 2025: Series card with ALL Posts 1, 2, 3, 4
 * - Q2 2025: (no series card)
 * - Q3 2025: (no series card)
 *
 * This ensures that:
 * 1. Each series appears only once across all partitions
 * 2. The series card contains ALL posts from that series (not just from that time period)
 * 3. Individual posts from the series don't appear in later partitions
 * 4. Standalone posts (not in a series) continue to appear in their respective partitions
 *
 * @param timeGroups - Array of time groups with posts (sorted by time, newest first)
 * @param allPosts - All available posts to get complete series data
 * @returns Modified time groups with deduplicated series
 */
export const deduplicateSeriesAcrossPartitions = <
  T extends { posts: UserDocument[] },
>(
  timeGroups: T[],
  allPosts: UserDocument[],
): T[] => {
  // Track which series IDs we've already placed in a partition
  const placedSeries = new Set<string>();

  // Build a map of seriesId -> all posts in that series (from allPosts)
  const seriesAllPostsMap = new Map<string, UserDocument[]>();
  allPosts.forEach((post) => {
    const seriesId = getPostSeriesId(post);
    if (seriesId) {
      if (!seriesAllPostsMap.has(seriesId)) {
        seriesAllPostsMap.set(seriesId, []);
      }
      seriesAllPostsMap.get(seriesId)!.push(post);
    }
  });

  // Sort posts within each series by seriesOrder and deduplicate by ID
  seriesAllPostsMap.forEach((posts, seriesId) => {
    // Remove duplicates by post ID
    const uniquePosts = Array.from(
      new Map(posts.map((post) => [post.id, post])).values(),
    );

    // Sort by series order
    uniquePosts.sort((a, b) => {
      const orderA = getPostSeriesOrder(a) ?? Infinity;
      const orderB = getPostSeriesOrder(b) ?? Infinity;
      return orderA - orderB;
    });

    seriesAllPostsMap.set(seriesId, uniquePosts);
  });

  // Process each time group
  return timeGroups.map((group) => {
    const newPosts: UserDocument[] = [];
    const addedPostIds = new Set<string>(); // Track added post IDs to avoid duplicates

    // For each post in this partition
    group.posts.forEach((post) => {
      const seriesId = getPostSeriesId(post);

      if (!seriesId) {
        // Standalone post - include if not already added
        if (!addedPostIds.has(post.id)) {
          newPosts.push(post);
          addedPostIds.add(post.id);
        }
      } else if (!placedSeries.has(seriesId)) {
        // First occurrence of this series - include ALL posts from this series
        const allSeriesPosts = seriesAllPostsMap.get(seriesId) || [];
        allSeriesPosts.forEach((seriesPost) => {
          if (!addedPostIds.has(seriesPost.id)) {
            newPosts.push(seriesPost);
            addedPostIds.add(seriesPost.id);
          }
        });
        placedSeries.add(seriesId);
      }
      // If series was already placed, skip this post
    });

    return {
      ...group,
      posts: newPosts,
      count: newPosts.length,
    };
  });
};
