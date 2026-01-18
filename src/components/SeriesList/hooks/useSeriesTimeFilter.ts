import { useMemo } from "react";
import { Series } from "@/types";
import { getSeriesCreatedAt } from "../utils/seriesHelpers";

export type SeriesTimeFilterValue =
  | "all"
  | "thisYear"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "last6Months";

interface UseSeriesTimeFilterProps {
  series: Series[];
  timeFilter: SeriesTimeFilterValue;
}

interface UseSeriesTimeFilterReturn {
  filteredSeries: Series[];
  filterStats: {
    total: number;
    filtered: number;
    label: string;
  };
}

/**
 * Custom hook for filtering series by time periods
 * Supports various predefined time ranges
 */
export const useSeriesTimeFilter = ({
  series,
  timeFilter,
}: UseSeriesTimeFilterProps): UseSeriesTimeFilterReturn => {
  const filteredSeries = useMemo(() => {
    if (timeFilter === "all") {
      return series;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Calculate date ranges
    const getDateRange = () => {
      switch (timeFilter) {
        case "thisYear":
          return {
            start: new Date(currentYear, 0, 1),
            end: now,
          };
        case "thisMonth":
          return {
            start: new Date(currentYear, currentMonth, 1),
            end: now,
          };
        case "lastMonth":
          return {
            start: new Date(currentYear, currentMonth - 1, 1),
            end: new Date(currentYear, currentMonth, 0),
          };
        case "last3Months":
          return {
            start: new Date(currentYear, currentMonth - 3, 1),
            end: now,
          };
        case "last6Months":
          return {
            start: new Date(currentYear, currentMonth - 6, 1),
            end: now,
          };
        default:
          return null;
      }
    };

    const dateRange = getDateRange();
    if (!dateRange) return series;

    return series.filter((seriesItem) => {
      const createdAt = getSeriesCreatedAt(seriesItem);
      if (!createdAt) return false;

      return createdAt >= dateRange.start && createdAt <= dateRange.end;
    });
  }, [series, timeFilter]);

  const filterStats = useMemo(() => {
    const filterLabels: Record<SeriesTimeFilterValue, string> = {
      all: "All Time",
      thisYear: "This Year",
      thisMonth: "This Month",
      lastMonth: "Last Month",
      last3Months: "Last 3 Months",
      last6Months: "Last 6 Months",
    };

    return {
      total: series.length,
      filtered: filteredSeries.length,
      label: filterLabels[timeFilter],
    };
  }, [series.length, filteredSeries.length, timeFilter]);

  return {
    filteredSeries,
    filterStats,
  };
};
