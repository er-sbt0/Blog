"use client";
import * as React from "react";
import { useState } from "react";
import { Series, User } from "@/types";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import SeriesHeader from "./SeriesHeader";
import SkeletonCard from "@/components/DocumentCardNew/components/LoadingCard";
import CreateSeriesDrawer from "@/components/CreateSeriesDrawer";
import { useSeriesData } from "./hooks/useSeriesData";
import SeriesTimeSection from "./components/SeriesTimeSection";

interface SeriesListProps {
  series: Series[];
  user?: User;
  title?: string;
  emptyMessage?: string;
  loading?: boolean;
  showHeader?: boolean;
}

/**
 * Loading state component for series list
 */
const SeriesLoadingState: React.FC = () => {
  return (
    <Grid container spacing={3}>
      {Array.from({ length: 8 }).map((_, index) => (
        <Grid key={`loading-${index}`} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <SkeletonCard />
        </Grid>
      ))}
    </Grid>
  );
};

/**
 * Series list component for displaying series with time-based partitioning
 * Supports flexible time grouping (day, week, month, quarter, halfyear, year)
 * Features: Search, partitioning control, responsive design, accessibility
 */
const SeriesList: React.FC<SeriesListProps> = ({
  series,
  user,
  title = "Series",
  emptyMessage = "No series found",
  loading = false,
  showHeader = true,
}) => {
  // State for Create Series Drawer
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);

  // Use custom hook to get series data with search, filtering, and partitioning
  const {
    timeGroups,
    totalCount,
    filteredCount,
    searchQuery,
    setSearchQuery,
    granularity,
    setGranularity,
    hasActiveFilters,
  } = useSeriesData({ series });

  // Use timeGroups for display to support flexible partitioning
  const displayGroups = timeGroups;
  const hasActiveSearch = searchQuery.trim().length > 0;

  return (
    <Box
      component="main"
      sx={{
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3, lg: 4 },
        minHeight: "50vh",
        maxWidth: "100%",
        width: "100%",
      }}
      role="main"
      aria-label="Series collection"
    >
      {/* Header with search and new button */}
      {showHeader && (
        <SeriesHeader
          totalCount={filteredCount}
          loading={loading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          granularity={granularity}
          onGranularityChange={setGranularity}
          onNewSeries={() => setCreateSeriesDrawerOpen(true)}
        />
      )}

      {/* Series Grid with Time Partitioning */}
      {loading
        ? (
          <section aria-label="Loading series" aria-live="polite">
            <SeriesLoadingState />
          </section>
        )
        : displayGroups.length === 0 || filteredCount === 0
        ? (
          <section
            role="region"
            aria-label={hasActiveSearch
              ? "No series match search"
              : "No series"}
            aria-live="polite"
          >
            <Box
              sx={{
                textAlign: "center",
                py: { xs: 6, md: 10 },
                px: { xs: 2, md: 4 },
                color: "text.secondary",
              }}
            >
              <Box
                sx={{
                  mb: 3,
                  fontSize: { xs: 40, md: 56 },
                  filter: "grayscale(0.3)",
                }}
              >
                {hasActiveSearch ? "🔍" : "📚"}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "1.125rem", md: "1.375rem" },
                  mb: 1,
                  fontWeight: 600,
                  color: "text.primary",
                }}
              >
                {hasActiveSearch
                  ? `No series found for "${searchQuery}"`
                  : emptyMessage}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "0.875rem", md: "1rem" },
                  color: "text.secondary",
                  maxWidth: 400,
                  mx: "auto",
                }}
              >
                {hasActiveSearch
                  ? "Try adjusting your search term"
                  : "Create your first series to organize your posts"}
              </Box>
            </Box>
          </section>
        )
        : (
          <section
            role="region"
            aria-label={`${filteredCount} series organized by ${granularity}`}
            aria-live="polite"
          >
            <Box>
              {displayGroups.map((timeGroup, index) => (
                <Box key={timeGroup.timeKey}>
                  <SeriesTimeSection
                    timeGroup={timeGroup}
                    user={user}
                    isLatest={index === 0} // First period is the latest
                  />
                </Box>
              ))}
            </Box>
          </section>
        )}

      {/* Create Series Drawer */}
      <CreateSeriesDrawer
        open={createSeriesDrawerOpen}
        onClose={() => setCreateSeriesDrawerOpen(false)}
      />
    </Box>
  );
};

export default SeriesList;
