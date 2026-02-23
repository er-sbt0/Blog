import React, { useCallback, useMemo, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Grid2";
import { UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCardNew";
import SeriesCard from "@/components/SeriesCard/SeriesCardUnified";
import { buildSeriesMap, groupPostsBySeries } from "../utils/seriesGrouping";

interface PostsGridProps {
  posts: UserDocument[];
}

/**
 * Simplified responsive grid component for displaying posts
 * Posts are grouped by series with collapsible containers
 * Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns
 */
const PostsGrid: React.FC<PostsGridProps> = ({ posts }) => {
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

  return (
    <Grid
      container
      spacing={3}
      sx={{ mb: 4 }}
    >
      {groupedPosts.map((group) => {
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
