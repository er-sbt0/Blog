import { Series } from "@/types";
import { PartitionGranularity, TimeGroup } from "@/types/partitioning";
import {
  formatTimeHeader,
  getTimeKey,
} from "@/components/PostsList/utils/dateHelpers";
import { getSeriesCreatedAt, sortSeriesByDate } from "./seriesHelpers";

/**
 * Extended TimeGroup to support series data
 */
export interface SeriesTimeGroup extends Omit<TimeGroup, "posts"> {
  series: Series[];
}

/**
 * Group series by time period based on granularity
 * @param series - Array of Series
 * @param granularity - Time period granularity (day, week, month, quarter, halfyear, year)
 * @returns Array of SeriesTimeGroup objects sorted by most recent periods first
 */
export const groupSeriesByTime = (
  series: Series[],
  granularity: PartitionGranularity = "quarter",
): SeriesTimeGroup[] => {
  const groups = new Map<string, Series[]>();

  series.forEach((seriesItem) => {
    const createdAt = getSeriesCreatedAt(seriesItem);
    if (!createdAt) return; // Skip series without creation date

    const timeKey = getTimeKey(createdAt, granularity);

    if (!groups.has(timeKey)) {
      groups.set(timeKey, []);
    }
    groups.get(timeKey)!.push(seriesItem);
  });

  return Array.from(groups.entries())
    .map(([timeKey, seriesArray]) => ({
      timeKey,
      timeLabel: formatTimeHeader(timeKey, granularity),
      series: sortSeriesByDate(seriesArray), // Sort series within each group by date desc
      posts: [], // Keep for compatibility with TimeGroup interface
      count: seriesArray.length,
      granularity,
    }))
    .sort((a, b) => b.timeKey.localeCompare(a.timeKey)); // Most recent periods first
};

/**
 * Group series by day based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent days first
 */
export const groupSeriesByDay = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "day");
};

/**
 * Group series by week based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent weeks first
 */
export const groupSeriesByWeek = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "week");
};

/**
 * Group series by month/year based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent months first
 */
export const groupSeriesByMonth = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "month");
};

/**
 * Group series by quarter based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent quarters first
 */
export const groupSeriesByQuarter = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "quarter");
};

/**
 * Group series by half-year based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent half-years first
 */
export const groupSeriesByHalfYear = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "halfyear");
};

/**
 * Group series by year based on createdAt field
 * @param series - Array of Series
 * @returns Array of SeriesTimeGroup objects sorted by most recent years first
 */
export const groupSeriesByYear = (series: Series[]): SeriesTimeGroup[] => {
  return groupSeriesByTime(series, "year");
};

/**
 * Get the appropriate grouping function based on granularity
 * @param granularity - Time period granularity
 * @returns Grouping function
 */
export const getSeriesGroupingFunction = (
  granularity: PartitionGranularity,
): (series: Series[]) => SeriesTimeGroup[] => {
  switch (granularity) {
    case "day":
      return groupSeriesByDay;
    case "week":
      return groupSeriesByWeek;
    case "month":
      return groupSeriesByMonth;
    case "quarter":
      return groupSeriesByQuarter;
    case "halfyear":
      return groupSeriesByHalfYear;
    case "year":
      return groupSeriesByYear;
    default:
      return groupSeriesByQuarter; // Default to quarter
  }
};
