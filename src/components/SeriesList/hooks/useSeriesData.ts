import { PartitionGranularity } from "@/types/partitioning";
import { useMemo, useState } from "react";
import { Series } from "@/types";

// Import custom hooks
import { useSeriesSearch } from "./useSeriesSearch";
import {
  SeriesTimeFilterValue,
  useSeriesTimeFilter,
} from "./useSeriesTimeFilter";
import { useSeriesGrouping } from "./useSeriesGrouping";

interface UseSeriesDataProps {
  series: Series[];
}

interface UseSeriesDataReturn {
  timeGroups: ReturnType<typeof useSeriesGrouping>["timeGroups"];
  totalCount: number;
  filteredCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  timeFilter: SeriesTimeFilterValue;
  setTimeFilter: (filter: SeriesTimeFilterValue) => void;
  granularity: PartitionGranularity;
  setGranularity: (granularity: PartitionGranularity) => void;
  hasActiveFilters: boolean;
  searchResults: ReturnType<typeof useSeriesSearch>;
}

/**
 * Custom hook to organize series data with flexible partitioning
 * Provides search, filtering, and time-based grouping capabilities
 */
export const useSeriesData = (
  { series }: UseSeriesDataProps,
): UseSeriesDataReturn => {
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<SeriesTimeFilterValue>("all");
  const [granularity, setGranularity] = useState<PartitionGranularity>(
    "quarter",
  );

  // Apply search
  const searchResults = useSeriesSearch({
    series,
    searchQuery,
  });

  // Apply time filter
  const { filteredSeries: timeFilteredSeries } = useSeriesTimeFilter({
    series: searchResults.filteredSeries,
    timeFilter,
  });

  // Apply time grouping
  const { timeGroups, totalCount } = useSeriesGrouping({
    series: timeFilteredSeries,
    granularity,
  });

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return searchQuery.trim().length > 0 || timeFilter !== "all";
  }, [searchQuery, timeFilter]);

  return {
    timeGroups,
    totalCount: series.length,
    filteredCount: timeFilteredSeries.length,
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    granularity,
    setGranularity,
    hasActiveFilters,
    searchResults,
  };
};
