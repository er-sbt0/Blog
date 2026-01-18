import React from "react";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { Series, User } from "@/types";
import SeriesCard from "@/components/SeriesCard/SeriesCardUnified";

interface SeriesGridSectionProps {
  series: Series[];
  user?: User;
}

/**
 * Grid component for displaying series cards
 * Used within TimeSection to show series in a responsive grid
 */
const SeriesGridSection: React.FC<SeriesGridSectionProps> = (
  { series, user },
) => {
  return (
    <Grid
      container
      spacing={3}
      sx={{ mb: 4 }}
    >
      {series.map((seriesItem) => (
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
  );
};

export default SeriesGridSection;
