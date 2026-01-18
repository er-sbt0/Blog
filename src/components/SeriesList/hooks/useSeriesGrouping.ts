import { useMemo } from "react";
import { Series } from "@/types";
import { PartitionGranularity } from "@/types/partitioning";
import {
  getSeriesGroupingFunction,
  SeriesTimeGroup,
} from "../utils/seriesTimeGrouping";

interface UseSeriesGroupingProps {
  series: Series[];
  granularity?: PartitionGranularity;
}

interface UseSeriesGroupingReturn {
  timeGroups: SeriesTimeGroup[];
  totalCount: number;
  granularity: PartitionGranularity;
}

/**
 * Custom hook for flexible time-based grouping logic for series
 * Transforms flat series array into time-grouped structure based on granularity
 */
export const useSeriesGrouping = ({
  series,
  granularity = "quarter",
}: UseSeriesGroupingProps): UseSeriesGroupingReturn => {
  const { timeGroups, totalCount } = useMemo(() => {
    // Get the appropriate grouping function for the granularity
    const groupingFunction = getSeriesGroupingFunction(granularity);
    const timeGroups = groupingFunction(series);

    return {
      timeGroups,
      totalCount: series.length,
    };
  }, [series, granularity]);

  return {
    timeGroups,
    totalCount,
    granularity,
  };
};
