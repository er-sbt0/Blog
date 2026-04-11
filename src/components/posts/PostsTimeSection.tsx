import React from "react";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { TimeGroup } from "@/types/partitioning";
import { User, UserDocument } from "@/types";
import DocumentCard from "@/components/DocumentCard";
import { PostsCompactListView } from "./components/PostsCompactListView";
import { PendingTimeChange } from "@/types/posts";
import type { ViewType } from "@/components/shared/ViewToggle";
import { TimeGroupHeader } from "@/components/shared/TimeGroupHeader";

interface PostsTimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
  viewType?: ViewType;
  // Posts are rendered as a flat list (series-style).
  user?: User;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Renders a time-bucket section for the posts view.
 * Posts are displayed as a flat grid or compact list — no nested series grouping.
 */
const PostsTimeSection: React.FC<PostsTimeSectionProps> = ({
  timeGroup,
  isLatest = false,
  viewType = "grid",
  user,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const renderContent = () => {
    // Flat rendering, no nested series grouping.
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
