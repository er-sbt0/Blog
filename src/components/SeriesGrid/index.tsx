"use client";
import * as React from "react";
import { memo, useState } from "react";
import Grid from "@mui/material/Grid2";
import { Box, Typography } from "@mui/material";
import { Series, User } from "@/types";
import SeriesCard from "../SeriesCard/SeriesCardUnified";
import CreatePostDrawer from "../CreatePostDrawer";

interface SeriesGridProps {
  /** List of series to display */
  series: Series[];
  /** Current user */
  user?: User;
  /** Grid configuration */
  gridConfig?: {
    columns?: {
      xs?: number;
      sm?: number;
      md?: number;
      lg?: number;
      xl?: number;
    };
    spacing?: number;
  };
  /** Card configuration */
  cardConfig?: {
    minHeight?: string;
    showAuthor?: boolean;
    maxStatusChips?: number;
    showSortOrder?: boolean;
    showPermissionChips?: boolean;
  };
  /** Empty state configuration */
  emptyState?: {
    title?: string;
    subtitle?: string;
  };
}

/**
 * Series grid component for displaying series in a responsive grid layout
 */
const SeriesGrid: React.FC<SeriesGridProps> = memo(({
  series,
  user,
  gridConfig = {},
  cardConfig = {},
  emptyState = {},
}) => {
  // State for drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedSeriesTitle, setSelectedSeriesTitle] = useState<string | null>(null);

  // Default grid configuration
  const defaultGridConfig = {
    columns: {
      xs: 1,
      sm: 2,
      md: 3,
      lg: 4,
      xl: 4,
    },
    spacing: 2,
  };

  const finalGridConfig = { ...defaultGridConfig, ...gridConfig };

  // Default empty state
  const defaultEmptyState = {
    title: "No series found",
    subtitle: "There are no series to display at the moment.",
  };

  const finalEmptyState = { ...defaultEmptyState, ...emptyState };

  // Handler to open drawer for creating a post
  const handleCreatePost = (seriesId: string, seriesTitle: string) => {
    if (!seriesId || seriesId.trim() === "") {
      console.error("Invalid seriesId:", seriesId);
      return;
    }
    setSelectedSeriesId(seriesId);
    setSelectedSeriesTitle(seriesTitle);
    setDrawerOpen(true);
  };

  // Handler to close drawer
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedSeriesId(null);
    setSelectedSeriesTitle(null);
  };

  // If no series, show empty state
  if (series.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "200px",
          textAlign: "center",
          py: 4,
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {finalEmptyState.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {finalEmptyState.subtitle}
        </Typography>
      </Box>
    );
  }

  return (
    <>
    <Grid
      container
      spacing={finalGridConfig.spacing}
      sx={{
        width: "100%",
        margin: 0,
      }}
    >
      {series.map((seriesItem) => (
        <Grid
          key={seriesItem.id}
          size={finalGridConfig.columns}
          sx={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SeriesCard
            variant="detailed"
            series={seriesItem}
            user={user}
            showMetadata={true}
            showActions={true}
            onCreatePost={() => handleCreatePost(seriesItem.id, seriesItem.title)}
          />
        </Grid>
      ))}
    </Grid>

    {/* Drawer for creating new post */}
    {selectedSeriesId && (
      <CreatePostDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        seriesId={selectedSeriesId}
        seriesTitle={selectedSeriesTitle || undefined}
      />
    )}
  </>
  );
});

// Set display name for debugging
SeriesGrid.displayName = "SeriesGrid";

export default SeriesGrid;
