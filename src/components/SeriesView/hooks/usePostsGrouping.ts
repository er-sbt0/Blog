import { useMemo } from "react";
import { Document } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { getGroupingFunction } from "@/components/PostsList/utils/timeGrouping";

interface UsePostsGroupingProps {
  posts: Document[];
  granularity?: PartitionGranularity;
}

interface UsePostsGroupingReturn {
  timeGroups: TimeGroup[];
  totalCount: number;
  granularity: PartitionGranularity;
}

/**
 * Custom hook for time-based grouping of posts within a series
 * Transforms flat posts array into time-grouped structure based on granularity
 */
export const usePostsGrouping = ({
  posts,
  granularity = "quarter",
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  const { timeGroups, totalCount } = useMemo(() => {
    // Convert Document[] to UserDocument[] format for grouping
    const userDocuments = posts.map((post) => ({
      id: post.id,
      cloud: post,
      local: undefined,
    }));

    // Get the appropriate grouping function for the granularity
    const groupingFunction = getGroupingFunction(granularity);
    const timeGroups = groupingFunction(userDocuments);

    return {
      timeGroups,
      totalCount: posts.length,
    };
  }, [posts, granularity]);

  return {
    timeGroups,
    totalCount,
    granularity,
  };
};
