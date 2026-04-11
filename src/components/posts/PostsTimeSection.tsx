"use client";
import React, { useMemo } from "react";
import { Box } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { TimeGroup } from "@/types/partitioning";
import { User, UserDocument } from "@/types";
import DocumentCard from "@/components/DocumentCard";
import { PostsCompactListView } from "./components/PostsCompactListView";
import SeriesGroupCard from "./components/SeriesGroupCard";
import { PendingTimeChange } from "@/types/posts";
import type { ViewType } from "@/components/shared/ViewToggle";
import { TimeGroupHeader } from "@/components/shared/TimeGroupHeader";
import {
  buildSeriesMap,
  groupPostsBySeries,
  SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import { useSelector } from "@/store";
import { useExpandedState } from "@/hooks/useExpandedState";

interface PostsTimeSectionProps {
  timeGroup: TimeGroup;
  isLatest?: boolean;
  viewType?: ViewType;
  user?: User;
  /**
   * When true, groups posts by series and renders SeriesGroupCard for series
   * groups (used by the all-posts /posts view).
   */
  showSeriesCards?: boolean;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Renders a time-bucket section for the posts view.
 *
 * - All-posts mode (`showSeriesCards=true`): groups posts by series, renders
 *   SeriesGroupCard for series groups and DocumentCard for standalone posts.
 * - Series mode (default): flat grid or compact list of DocumentCards.
 */
const PostsTimeSection: React.FC<PostsTimeSectionProps> = ({
  timeGroup,
  isLatest = false,
  viewType = "grid",
  user,
  showSeriesCards = false,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const seriesList = useSelector((state) => state.series);
  const { expandedSeries, toggleSeries } = useExpandedState(
    "postsGridExpandedState",
  );

  // Series grouping for all-posts mode.
  const groupedItems: SeriesGroupItem[] = useMemo(() => {
    if (!showSeriesCards) return [];
    const seriesMap = buildSeriesMap(seriesList || []);
    const baseGroups = groupPostsBySeries(
      timeGroup.posts as UserDocument[],
      seriesMap,
    );

    if (!timeGroup.emptySeries?.length) return baseGroups;

    // Merge in zero-post series that belong to this time bucket.
    const existingIds = new Set(
      baseGroups
        .filter((g) => g.type === "series" && g.series)
        .map((g) => g.series!.id),
    );
    const emptyGroups: SeriesGroupItem[] = timeGroup.emptySeries
      .filter((s) => !existingIds.has(s.id))
      .map((s) => ({
        type: "series" as const,
        series: s,
        posts: [],
        sortKey: s.createdAt ? new Date(s.createdAt).getTime() : 0,
      }));

    return emptyGroups.length
      ? [...baseGroups, ...emptyGroups].sort((a, b) => b.sortKey - a.sortKey)
      : baseGroups;
  }, [showSeriesCards, timeGroup.posts, timeGroup.emptySeries, seriesList]);

  const renderContent = () => {
    if (showSeriesCards) {
      if (viewType === "compact") {
        return <PostsCompactListView groups={groupedItems} user={user} />;
      }
      return (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {groupedItems.map((group) => {
            if (group.type === "series" && group.series) {
              const isCollapsed = !expandedSeries.has(group.series.id);
              return (
                <Grid
                  key={`series-${group.series.id}`}
                  size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
                >
                  <SeriesGroupCard
                    series={group.series}
                    posts={group.posts}
                    user={user}
                    collapsible
                    defaultExpanded={!isCollapsed}
                    onExpand={() => toggleSeries(group.series!.id)}
                    onCollapse={() => toggleSeries(group.series!.id)}
                  />
                </Grid>
              );
            }
            const document = group.posts[0];
            return (
              <Grid key={document.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <DocumentCard userDocument={document} user={user} />
              </Grid>
            );
          })}
        </Grid>
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
