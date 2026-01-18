import React from "react";
import { Box, Typography } from "@mui/material";
import { TimeGroup } from "@/types/partitioning";
import PostsGrid from "./PostsGrid";

interface TimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
}

// Inline TimeHeader component for simplicity
const TimeHeader: React.FC<{
  timeLabel: string;
  postCount: number;
  timeKey: string;
  granularity: TimeGroup["granularity"];
  isLatest?: boolean;
}> = ({ timeLabel, postCount, timeKey, granularity, isLatest = false }) => {
  return (
    <Box
      id={`time-header-${timeKey}`}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: { xs: "flex-start", md: "flex-start" },
        justifyContent: "center",
        pl: { xs: 0, md: 0 },
        pr: { xs: 0, md: 5 },
        height: "100%",
        minHeight: { md: "200px" },
      }}
    >
      <Typography
        variant="h5"
        component="h2"
        sx={{
          fontWeight: 700,
          color: "text.primary",
          fontSize: { xs: "1.25rem", md: "1.5rem" },
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          textAlign: "left",
          cursor: "pointer",
          transition: "color 0.2s ease",
          "&:hover": {
            color: "primary.main",
          },
        }}
      >
        {timeLabel}
      </Typography>
    </Box>
  );
};

/**
 * Generic section component for displaying posts grouped by any time period
 * Uses CSS Grid for horizontal layout (header on left, posts on right)
 * Mobile: stacks vertically, Desktop: side-by-side
 */
const TimeSection: React.FC<TimeSectionProps> = (
  { timeGroup, isLatest = false },
) => {
  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`time-header-${timeGroup.timeKey}`}
      sx={{
        mb: { xs: 4, md: 6 },
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr", // Mobile: single column (stacked)
          md: "160px 1fr", // Desktop: date column | posts column
        },
        gap: { xs: 3, md: 4 },
        alignItems: "stretch",
      }}
    >
      <TimeHeader
        timeLabel={timeGroup.timeLabel}
        postCount={timeGroup.count}
        timeKey={timeGroup.timeKey}
        granularity={timeGroup.granularity}
        isLatest={isLatest}
      />
      <Box
        id={`time-posts-${timeGroup.timeKey}`}
        aria-label={`${timeGroup.count} posts from ${timeGroup.timeLabel}`}
      >
        <PostsGrid posts={timeGroup.posts} />
      </Box>
    </Box>
  );
};

export default TimeSection;
