"use client";
import React, { useMemo } from "react";
import Grid from "@mui/material/Grid2";
import { Series, UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCard";
import SeriesGroupCard from "./SeriesGroupCard";
import {
  buildSeriesMap,
  groupPostsBySeries,
  SeriesGroupItem,
} from "@/utils/posts/seriesGrouping";
import { ViewType } from "@/components/shared/ViewToggle";
import { PostsCompactListView } from "@/components/SeriesView/components/PostsCompactListView";
import { useExpandedState } from "@/hooks/useExpandedState";

interface PostsGridProps {
  posts?: UserDocument[];
  /** Zero-post series to show in this partition (injected by TimeSection) */
  emptySeries?: Series[];
  viewType?: ViewType;
  showPosts?: boolean;
  showSeries?: boolean;
}

/**
 * Simplified responsive grid component for displaying posts
 * Posts are grouped by series with collapsible containers
 * Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns
 */
const PostsGrid: React.FC<PostsGridProps> = ({
  posts = [],
  emptySeries,
  viewType = "grid",
  showPosts = true,
  showSeries = true,
}) => {
  const user = useSelector((state) => state.user);
  const seriesList = useSelector((state) => state.series);
  // Build series map for grouping
  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  // Group posts by series
  const groupedPosts = useMemo(
    () => groupPostsBySeries(posts, seriesMap),
    [posts, seriesMap],
  );

  // Filter groups by showPosts/showSeries flags, then merge in any zero-post series
  const filteredGroupedPosts = useMemo(() => {
    const baseGroups = groupedPosts.filter((g) =>
      g.type === "series" ? showSeries : showPosts
    );

    if (!emptySeries?.length || !showSeries) return baseGroups;

    // Avoid duplicating a series already present with posts
    const existingSeriesIds = new Set<string>(
      baseGroups
        .filter((g) => g.type === "series" && g.series)
        .map((g) => g.series!.id),
    );

    const emptyGroups: SeriesGroupItem[] = emptySeries
      .filter((s) => !existingSeriesIds.has(s.id))
      .map((s) => ({
        type: "series" as const,
        series: s,
        posts: [],
        sortKey: s.createdAt ? new Date(s.createdAt).getTime() : 0,
      }));

    if (!emptyGroups.length) return baseGroups;

    // Interleave by sortKey (newest first)
    return [...baseGroups, ...emptyGroups].sort((a, b) =>
      b.sortKey - a.sortKey
    );
  }, [groupedPosts, showPosts, showSeries, emptySeries]);

  const { expandedSeries, toggleSeries: toggleSeriesCollapsed } =
    useExpandedState("postsGridExpandedState");

  // Stable toggle handlers per series ID, so memoized SeriesCard children don't re-render
  const seriesToggleHandlers = useMemo(() => {
    const map = new Map<string, () => void>();
    filteredGroupedPosts.forEach((group) => {
      if (group.type === "series" && group.series) {
        const id = group.series.id;
        map.set(id, () => toggleSeriesCollapsed(id));
      }
    });
    return map;
  }, [filteredGroupedPosts, toggleSeriesCollapsed]);

  // Compact list mode
  if (viewType === "compact") {
    return (
      <PostsCompactListView
        groups={filteredGroupedPosts}
        user={user || undefined}
      />
    );
  }

  return (
    <Grid
      container
      spacing={3}
      sx={{ mb: 4 }}
    >
      {filteredGroupedPosts.map((group) => {
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
                collapsible={true}
                defaultExpanded={!isCollapsed}
                onExpand={seriesToggleHandlers.get(group.series.id)}
                onCollapse={seriesToggleHandlers.get(group.series.id)}
              />
            </Grid>
          );
        } else {
          // Standalone post
          const document = group.posts[0];

          return (
            <Grid
              key={document.id}
              size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
            >
              <DocumentCard
                userDocument={document}
                user={user}
                sx={{
                  height: "100%",
                  transition: "all 0.3s ease",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 4,
                  },
                }}
              />
            </Grid>
          );
        }
      })}
    </Grid>
  );
};

export default PostsGrid;
