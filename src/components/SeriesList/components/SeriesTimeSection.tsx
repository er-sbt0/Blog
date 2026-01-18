import React from "react";
import { Box, Typography } from "@mui/material";
import { User } from "@/types";
import { SeriesTimeGroup } from "../utils/seriesTimeGrouping";
import SeriesGridSection from "./SeriesGridSection";

interface SeriesTimeSectionProps {
  timeGroup: SeriesTimeGroup;
  user?: User;
  isLatest?: boolean;
}

// Inline TimeHeader component for series
const SeriesTimeHeader: React.FC<{
  timeLabel: string;
  seriesCount: number;
  timeKey: string;
  granularity: SeriesTimeGroup["granularity"];
  isLatest?: boolean;
}> = ({ timeLabel, seriesCount, timeKey, granularity, isLatest = false }) => {
  return (
    <Box
      id={`series-time-header-${timeKey}`}
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        sx={{
          fontSize: "1.25rem",
        }}
      >
        🗓️
      </Box>

      <Typography
        variant="h5"
        component="h2"
        sx={{
          fontWeight: 600,
          color: "text.primary",
          fontSize: { xs: "1.25rem", md: "1.5rem" },
        }}
      >
        {timeLabel}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          fontSize: "0.875rem",
        }}
      >
        ({seriesCount} {seriesCount === 1 ? "series" : "series"})
      </Typography>
    </Box>
  );
};

/**
 * Generic section component for displaying series grouped by any time period
 * Similar to TimeSection for posts but adapted for series
 */
const SeriesTimeSection: React.FC<SeriesTimeSectionProps> = ({
  timeGroup,
  user,
  isLatest = false,
}) => {
  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`series-time-header-${timeGroup.timeKey}`}
      sx={{
        mb: { xs: 4, md: 6 },
      }}
    >
      <SeriesTimeHeader
        timeLabel={timeGroup.timeLabel}
        seriesCount={timeGroup.count}
        timeKey={timeGroup.timeKey}
        granularity={timeGroup.granularity}
        isLatest={isLatest}
      />
      <Box
        id={`series-time-${timeGroup.timeKey}`}
        aria-label={`${timeGroup.count} series from ${timeGroup.timeLabel}`}
      >
        <SeriesGridSection series={timeGroup.series} user={user} />
      </Box>
    </Box>
  );
};

export default SeriesTimeSection;
