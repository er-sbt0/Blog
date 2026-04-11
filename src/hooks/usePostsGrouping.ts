import { useMemo } from "react";
import { UserDocument } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { getGroupingFunction } from "@/utils/posts/timeGrouping";
import {
  buildSeriesMap,
  deduplicateSeriesAcrossPartitions,
  ensureSeriesPartitions,
} from "@/utils/posts/seriesGrouping";
import { useSelector } from "@/store";
import type { PendingTimeChange } from "@/types/posts";

interface UsePostsGroupingProps {
  posts: UserDocument[];
  /** Provide to enable series deduplication across partitions (all-posts mode). */
  allPosts?: UserDocument[];
  granularity?: PartitionGranularity;
  /** Apply pending date changes for live re-grouping (series time-edit mode). */
  pendingTimeChanges?: Map<string, PendingTimeChange>;
}

interface UsePostsGroupingReturn {
  timeGroups: TimeGroup[];
  totalCount: number;
  granularity: PartitionGranularity;
}

/**
 * Unified hook for time-based grouping of posts.
 *
 * - All-posts mode: pass `allPosts` to enable series deduplication.
 * - Series time-edit mode: pass `pendingTimeChanges` so the UI re-groups
 *   posts immediately when their dates are adjusted.
 */
export const usePostsGrouping = ({
  posts,
  allPosts,
  granularity = "quarter",
  pendingTimeChanges,
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  const seriesList = useSelector((state) => state.series);

  const { timeGroups, totalCount } = useMemo(() => {
    const groupingFunction = getGroupingFunction(granularity);

    // Apply pending date overrides so grouping reflects live edits.
    const postsForGrouping = pendingTimeChanges && pendingTimeChanges.size > 0
      ? posts.map((post) => {
        const pending = pendingTimeChanges.get(post.id);
        if (pending && post.cloud) {
          return {
            ...post,
            cloud: { ...post.cloud, createdAt: pending.newDate },
          };
        }
        return post;
      })
      : posts;

    let timeGroups: TimeGroup[] = groupingFunction(postsForGrouping);

    // All-posts mode: ensure partition buckets exist for every series and
    // deduplicate series entries that span multiple time windows.
    if (allPosts) {
      const seriesMap = buildSeriesMap(seriesList || []);
      timeGroups = ensureSeriesPartitions(timeGroups, seriesMap, granularity);
      timeGroups = deduplicateSeriesAcrossPartitions(
        timeGroups,
        allPosts,
        seriesMap,
      );
    }

    // Remove empty buckets (but keep buckets that carry zero-post series).
    timeGroups = timeGroups.filter(
      (g) => g.posts.length > 0 || (g.emptySeries && g.emptySeries.length > 0),
    );

    return { timeGroups, totalCount: posts.length };
  }, [posts, allPosts, granularity, pendingTimeChanges, seriesList]);

  return { timeGroups, totalCount, granularity };
};
