"use client";
import * as React from "react";
import { useMemo, useState } from "react";
import { Series, User } from "@/types";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import SeriesCard from "../SeriesCard/SeriesCardUnified";
import SeriesHeader from "./SeriesHeader";
import SkeletonCard from "@/components/DocumentCardNew/components/LoadingCard";

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
 * Series list component for displaying a list of series
 * Improved UI aligned with PostsList design
 */
const SeriesList: React.FC<SeriesListProps> = ({
  series,
  user,
  title = "Series",
  emptyMessage = "No series found",
  loading = false,
  showHeader = true,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter series based on search query
  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return series;
    const query = searchQuery.toLowerCase();
    return series.filter((s) =>
      s.title?.toLowerCase().includes(query) ||
      s.description?.toLowerCase().includes(query)
    );
  }, [series, searchQuery]);

  const displayedSeries = filteredSeries;
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
          totalCount={hasActiveSearch ? filteredSeries.length : series.length}
          loading={loading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      )}

      {/* Series Grid */}
      {loading
        ? (
          <section aria-label="Loading series" aria-live="polite">
            <SeriesLoadingState />
          </section>
        )
        : displayedSeries.length === 0
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
          <Grid container spacing={3}>
            {displayedSeries.map((seriesItem) => (
              <Grid
                key={seriesItem.id}
                size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
              >
                <SeriesCard
                  variant="detailed"
                  series={seriesItem}
                  user={user}
                  showMetadata={true}
                  showActions={true}
                />
              </Grid>
            ))}
          </Grid>
        )}
    </Box>
  );
};

export default SeriesList;
