import React from "react";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { TimeGroup } from "@/types/partitioning";
import { User, UserDocument } from "@/types";
import DocumentCard from "@/components/DocumentCard";
import PostsGrid from "@/components/PostsList/components/PostsGrid";
import {
  PendingTimeChange,
  PostsCompactListView,
} from "@/components/SeriesView/components/PostsCompactListView";
import type { ViewType } from "@/components/shared/ViewToggle";
import { TimeGroupHeader } from "@/components/shared/TimeGroupHeader";

interface PostsTimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
  viewType?: ViewType;
  // ── All-posts mode ────────────────────────────────────────────────────────
  // When either prop is defined we know we're in all-posts mode and delegate
  // to <PostsGrid> which handles series grouping within the time bucket.
  showPosts?: boolean;
  showSeries?: boolean;
  // ── Series mode ───────────────────────────────────────────────────────────
  // Posts are already scoped to one series; render them as a flat list.
  user?: User;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Unified time-section component used by both all-posts and series views.
 */
const PostsTimeSection: React.FC<PostsTimeSectionProps> = ({
  timeGroup,
  isLatest = false,
  viewType = "grid",
  showPosts,
  showSeries,
  user,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const isAllPostsMode = showPosts !== undefined || showSeries !== undefined;

  const renderContent = () => {
    if (isAllPostsMode) {
      return (
        <PostsGrid
          posts={timeGroup.posts}
          emptySeries={timeGroup.emptySeries}
          viewType={viewType}
          showPosts={showPosts}
          showSeries={showSeries}
        />
      );
    }

    // Series-mode: flat rendering, no nested series grouping.
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
      case "grid":
      default:
        return (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {timeGroup.posts.map((userDoc) => (
              <Grid key={userDoc.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <DocumentCard
                  userDocument={userDoc as UserDocument}
                  user={user}
                />
              </Grid>
            ))}
          </Grid>
        );
    }
  };

  return (
    <Box
      component="section"
      role="region"
      aria-labelledby={`time-header-${timeGroup.timeKey}`}
      sx={{ mb: { xs: 4, md: 6 } }}
    >
      <TimeGroupHeader
        timeLabel={timeGroup.timeLabel}
        timeKey={timeGroup.timeKey}
        isLatest={isLatest}
      />
      <Box
        aria-label={`${timeGroup.count} posts from ${timeGroup.timeLabel}`}
      >
        {renderContent()}
      </Box>
    </Box>
  );
};

export default PostsTimeSection;
