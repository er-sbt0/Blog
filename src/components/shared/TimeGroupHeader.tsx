import React from "react";
import { Box, Typography } from "@mui/material";

interface TimeGroupHeaderProps {
  timeLabel: string;
  timeKey: string;
  isLatest?: boolean;
}

/**
 * Section-divider row used inside time-grouped post lists.
 * Renders an all-caps label followed by a full-width horizontal rule.
 */
export const TimeGroupHeader: React.FC<TimeGroupHeaderProps> = ({
  timeLabel,
  timeKey,
  isLatest = false,
}) => (
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
    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
  </Box>
);
