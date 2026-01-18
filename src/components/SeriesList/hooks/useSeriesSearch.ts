import { useMemo } from "react";
import { Series } from "@/types";

interface UseSeriesSearchProps {
  series: Series[];
  searchQuery: string;
}

interface UseSeriesSearchReturn {
  filteredSeries: Series[];
  searchResultsCount: number;
  hasResults: boolean;
}

/**
 * Custom hook for searching series
 * Searches in title and description fields
 */
export const useSeriesSearch = ({
  series,
  searchQuery,
}: UseSeriesSearchProps): UseSeriesSearchReturn => {
  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return series;

    const query = searchQuery.toLowerCase().trim();

    return series.filter((seriesItem) => {
      // Search in title
      if (seriesItem.title?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in description
      if (seriesItem.description?.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  }, [series, searchQuery]);

  return {
    filteredSeries,
    searchResultsCount: filteredSeries.length,
    hasResults: filteredSeries.length > 0,
  };
};
