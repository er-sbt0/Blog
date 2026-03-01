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

const TimeHeader: React.FC<TimeHeaderProps> = ({
  timeLabel,
  timeKey,
  isLatest = false,
}) => {
  return (
    <Box
      id={`time-header-${timeKey}`}
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Typography
        component="h2"
        sx={{
          fontSize: "0.9rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: isLatest ? "primary.main" : "text.disabled",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {timeLabel}
      </Typography>
      <Box
        sx={{
          flex: 1,
          height: "1px",
          bgcolor: "divider",
        }}
      />
    </Box>
  );
};

export default TimeHeader;
