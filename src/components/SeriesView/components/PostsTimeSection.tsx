import React from "react";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { TimeGroup } from "@/types/partitioning";
import { User, UserDocument } from "@/types";
import DocumentCard from "@/components/DocumentCardNew";
import {
  PendingTimeChange,
  PostsCompactListView,
} from "./PostsCompactListView";
import { PostsDetailedListView } from "./PostsDetailedListView";

export type ViewType = "grid" | "compact" | "detailed";

interface PostsTimeSectionProps {
  timeGroup: TimeGroup;
  user?: User;
  isLatest?: boolean;
  viewType?: ViewType;
  // Global time editing props
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

// Inline TimeHeader component for posts
const PostsTimeHeader: React.FC<{
  timeLabel: string;
  postCount: number;
  timeKey: string;
  granularity: TimeGroup["granularity"];
  isLatest?: boolean;
}> = ({ timeLabel, postCount, timeKey, granularity, isLatest = false }) => {
  return (
    <Box
      id={`posts-time-header-${timeKey}`}
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
        ({postCount} {postCount === 1 ? "post" : "posts"})
      </Typography>
    </Box>
  );
};

/**
 * Section component for displaying posts grouped by time period within a series
 */
const PostsTimeSection: React.FC<PostsTimeSectionProps> = ({
  timeGroup,
  user,
  isLatest = false,
  viewType = "grid",
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const renderPostsView = () => {
    switch (viewType) {
      case "compact":
        return (
          <PostsCompactListView
            posts={timeGroup.posts as UserDocument[]}
            user={user}
            isTimeEditMode={isTimeEditMode}
            pendingChanges={pendingChanges}
            onTimeAdjust={onTimeAdjust}
            onTimeReset={onTimeReset}
          />
        );
      case "detailed":
        return (
          <PostsDetailedListView
            posts={timeGroup.posts as UserDocument[]}
            user={user}
          />
        );
      case "grid":
      default:
        return (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {timeGroup.posts.map((userDoc, index) => {
              return (
                <Grid
                  key={userDoc.id}
                  size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
                  sx={{
                    animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
                  }}
                >
                  <DocumentCard
                    userDocument={userDoc as UserDocument}
                    user={user}
                  />
                </Grid>
              );
            })}
          </Grid>
        );
    }
  };

  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`posts-time-header-${timeGroup.timeKey}`}
      sx={{
        mb: { xs: 4, md: 6 },
      }}
    >
      <PostsTimeHeader
        timeLabel={timeGroup.timeLabel}
        postCount={timeGroup.count}
        timeKey={timeGroup.timeKey}
        granularity={timeGroup.granularity}
        isLatest={isLatest}
      />
      <Box
        id={`posts-time-${timeGroup.timeKey}`}
        aria-label={`${timeGroup.count} posts from ${timeGroup.timeLabel}`}
      >
        {renderPostsView()}
      </Box>
    </Box>
  );
};

export default PostsTimeSection;
