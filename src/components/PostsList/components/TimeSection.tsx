import React from "react";
import { Box } from "@mui/material";
import { TimeGroup } from "@/types/partitioning";
import PostsGrid from "./PostsGrid";
import TimeHeader from "./TimeHeader";
import { ViewType } from "@/components/SeriesView/components/ViewToggle";

interface TimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
  viewType?: ViewType;
  showPosts?: boolean;
  showSeries?: boolean;
}

/**
 * Generic section component for displaying posts grouped by any time period
 * Replaces MonthSection with flexible time period support (without boxing)
 */
const TimeSection: React.FC<TimeSectionProps> = (
  { timeGroup, isLatest = false, viewType, showPosts, showSeries },
) => {
  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`time-header-${timeGroup.timeKey}`}
      sx={{
        mb: { xs: 4, md: 6 },
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
        <PostsGrid
          posts={timeGroup.posts}
          emptySeries={timeGroup.emptySeries}
          viewType={viewType}
          showPosts={showPosts}
          showSeries={showSeries}
        />
      </Box>
    </Box>
  );
};

export default TimeSection;
