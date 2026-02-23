import { useMemo } from "react";
import { UserDocument } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { groupPostsByMonth } from "../utils/monthGrouping";
import { getGroupingFunction } from "../utils/timeGrouping";
import { deduplicateSeriesAcrossPartitions, buildSeriesMap } from "../utils/seriesGrouping";
import type { MonthGroup } from "../components/MonthSection";
import { useSelector } from "@/store";

interface UsePostsGroupingProps {
  posts: UserDocument[];
  allPosts?: UserDocument[]; // All posts for series deduplication
  granularity?: PartitionGranularity;
}

interface UsePostsGroupingReturn {
  monthGroups: MonthGroup[]; // Backward compatibility
  timeGroups: TimeGroup[]; // New flexible groups
  totalCount: number;
  granularity: PartitionGranularity;
}

/**
 * Custom hook for flexible time-based grouping logic
 * Transforms flat posts array into time-grouped structure based on granularity
 * Maintains backward compatibility with month-based grouping
 */
export const usePostsGrouping = ({
  posts,
  allPosts,
  granularity = "month",
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  // Get series from Redux store
  const seriesList = useSelector((state) => state.series);

  const { monthGroups, timeGroups, totalCount } = useMemo(() => {
    // Always provide month groups for backward compatibility
    const monthGroups = groupPostsByMonth(posts);

    // Provide flexible time groups based on granularity
    const groupingFunction = getGroupingFunction(granularity);
    let timeGroups = groupingFunction(posts);

    // Deduplicate series across partitions if allPosts is provided
    if (allPosts) {
      const seriesMap = buildSeriesMap(seriesList || []);

      // First, ensure partitions exist for all series creation dates
      const { ensureSeriesPartitions } = require("../utils/seriesGrouping");
      timeGroups = ensureSeriesPartitions(timeGroups, seriesMap, granularity);

      // Then deduplicate series across partitions
      timeGroups = deduplicateSeriesAcrossPartitions(timeGroups, allPosts, seriesMap);
    }

    // Filter out time groups with zero posts/series
    timeGroups = timeGroups.filter((group) => group.posts.length > 0);

    const totalCount = posts.length;

    return { monthGroups, timeGroups, totalCount };
  }, [posts, allPosts, granularity, seriesList]);

  return {
    monthGroups,
    timeGroups,
    totalCount,
    granularity,
  };
};
