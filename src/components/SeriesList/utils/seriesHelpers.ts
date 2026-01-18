import { Series } from "@/types";

/**
 * Get the creation date from a Series
 */
export const getSeriesCreatedAt = (series: Series): Date | null => {
  return series.createdAt ? new Date(series.createdAt) : null;
};

/**
 * Sort series by creation date in descending order (most recent first)
 */
export const sortSeriesByDate = (series: Series[]): Series[] => {
  return [...series].sort((a, b) => {
    const dateA = getSeriesCreatedAt(a);
    const dateB = getSeriesCreatedAt(b);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    return dateB.getTime() - dateA.getTime();
  });
};
