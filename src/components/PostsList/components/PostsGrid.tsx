import React, { useCallback, useMemo, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Grid2";
import { Series, UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCardNew";
import SeriesCard from "@/components/SeriesCard/SeriesCardUnified";
import {
  buildSeriesMap,
  flattenGroupedPosts,
  groupPostsBySeries,
} from "../utils/seriesGrouping";
import { ViewType } from "@/components/SeriesView/components/ViewToggle";
import { PostsCompactListView } from "@/components/SeriesView/components/PostsCompactListView";
import { PostsDetailedListView } from "@/components/SeriesView/components/PostsDetailedListView";

interface PostsGridProps {
  posts?: UserDocument[];
  series?: Series[];
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
  series,
  viewType = "grid",
  showPosts = true,
  showSeries = true,
}) => {
  const user = useSelector((state) => state.user);
  const seriesList = useSelector((state) => state.series);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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

  // Filter groups by showPosts/showSeries flags
  const filteredGroupedPosts = useMemo(
    () =>
      groupedPosts.filter((g) => g.type === "series" ? showSeries : showPosts),
    [groupedPosts, showPosts, showSeries],
  );

  // Flat list of posts for compact/detailed modes
  const flatPosts = useMemo(
    () => flattenGroupedPosts(filteredGroupedPosts),
    [filteredGroupedPosts],
  );

  // Track expanded series (series NOT in this set are collapsed)
  // This way new series default to collapsed automatically
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => {
    // Try to load saved state from localStorage
    const savedState = typeof window !== "undefined"
      ? localStorage.getItem("seriesExpandedState")
      : null;

    if (savedState) {
      try {
        const parsed: string[] = JSON.parse(savedState);
        return new Set<string>(parsed);
      } catch (e) {
        console.error("Failed to parse series expanded state:", e);
      }
    }

    // Default: no series are expanded (all start collapsed)
    return new Set<string>();
  });

  const toggleSeriesCollapsed = useCallback((seriesId: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }

      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("seriesExpandedState", JSON.stringify([...next]));
      }

      return next;
    });
  }, []);

  // No useEffect needed! New series automatically default to collapsed
  // since they're not in the expandedSeries set

  // Compact list mode
  if (viewType === "compact") {
    return <PostsCompactListView posts={flatPosts} user={user || undefined} />;
  }

  // Detailed list mode
  if (viewType === "detailed") {
    return <PostsDetailedListView posts={flatPosts} user={user || undefined} />;
  }

  // Series catalog mode: render detailed series cards
  if (series) {
    return (
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {series.map((seriesItem) => (
          <Grid key={seriesItem.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <SeriesCard
              variant="detailed"
              series={seriesItem}
              user={user}
              showMetadata={true}
              showActions={true}
            />
          </Grid>
        ))}
      </Grid>
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
              <SeriesCard
                variant="compact"
                series={group.series}
                posts={group.posts}
                user={user}
                collapsible={true}
                defaultExpanded={!isCollapsed}
                onExpand={() => toggleSeriesCollapsed(group.series!.id)}
                onCollapse={() => toggleSeriesCollapsed(group.series!.id)}
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
