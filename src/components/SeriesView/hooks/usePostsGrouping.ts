import { useMemo } from "react";
import { Document } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import { getGroupingFunction } from "@/components/PostsList/utils/timeGrouping";

export interface PendingTimeChange {
  originalDate: Date;
  newDate: Date;
}

interface UsePostsGroupingProps {
  posts: Document[];
  granularity?: PartitionGranularity;
  /** Pending time changes to apply for live preview */
  pendingTimeChanges?: Map<string, PendingTimeChange>;
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
  pendingTimeChanges,
}: UsePostsGroupingProps): UsePostsGroupingReturn => {
  const { timeGroups, totalCount } = useMemo(() => {
    // Convert Document[] to UserDocument[] format for grouping
    // Apply pending time changes if available
    const userDocuments = posts.map((post) => {
      const pendingChange = pendingTimeChanges?.get(post.id);
      if (pendingChange) {
        // Create a modified post with the pending date
        return {
          id: post.id,
          cloud: {
            ...post,
            createdAt: pendingChange.newDate,
          },
          local: undefined,
        };
      }
      return {
        id: post.id,
        cloud: post,
        local: undefined,
      };
    });

    // Get the appropriate grouping function for the granularity
    const groupingFunction = getGroupingFunction(granularity);
    const timeGroups = groupingFunction(userDocuments);

    return {
      timeGroups,
      totalCount: posts.length,
    };
  }, [posts, granularity, pendingTimeChanges]);

  return {
    timeGroups,
    totalCount,
    granularity,
  };
};
