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

    // Sort posts within series by seriesOrder (ascending)
    const sortedPosts = [...groupPosts].sort((a, b) => {
      const orderA = getPostSeriesOrder(a) ?? Infinity;
      const orderB = getPostSeriesOrder(b) ?? Infinity;
      return orderA - orderB;
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
