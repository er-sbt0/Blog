import React from "react";
import { Box, Typography } from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";

interface TimeHeaderProps {
  timeLabel: string;
  postCount: number;
  timeKey: string;
  granularity: PartitionGranularity;
  isLatest?: boolean;
}

/**
 * Generic header component for time-based sections
 * Shows time period label and post count
 */
const TimeHeader: React.FC<TimeHeaderProps> = ({
  timeLabel,
  postCount,
  timeKey,
  granularity,
  isLatest = false,
}) => {
  return (
    <Box
      id={`time-header-${timeKey}`}
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Typography
        variant="h5"
        component="h2"
        sx={{
          fontWeight: 600,
          color: isLatest ? "primary.main" : "text.primary",
          fontSize: { xs: "1.25rem", md: "1.5rem" },
        }}
      >
        {timeLabel}
      </Typography>
    </Box>
  );
};

export default TimeHeader;
