import React, { useCallback, useMemo, useState } from "react";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCardNew";
import SeriesGroupCard from "./SeriesGroupCard";
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

  // Track collapsed state for each series (default: collapsed)
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(() => {
    // Initialize with all series IDs to start collapsed
    return new Set(
      groupedPosts
        .filter((group) => group.type === "series" && group.series)
        .map((group) => group.series!.id)
    );
  });

  const toggleSeriesCollapsed = useCallback((seriesId: string) => {
    setCollapsedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }, []);

  // Track animation index across all posts
  let animationIndex = 0;

  const gap = isMobile ? 16 : 24;
  const cardWidth = isMobile ? "100%" : 300;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: `${gap}px`,
        alignItems: "flex-end", // Align items to bottom so cards line up
        mb: 4,
      }}
    >
      {groupedPosts.map((group, groupIndex) => {
        if (group.type === "series" && group.series) {
          const startIndex = animationIndex;
          animationIndex += 1; // Series card counts as one item
          const isCollapsed = collapsedSeries.has(group.series.id);

          return (
            <Box
              key={`series-${group.series.id}`}
              sx={{
                width: cardWidth,
                mb: { xs: 1.5, sm: 2 }, // Match DocumentCard wrapper margin for alignment
                animation: `fadeInUp 0.6s ease ${startIndex * 0.1}s both`,
              }}
            >
              <SeriesGroupCard
                series={group.series}
                posts={group.posts}
                isCollapsed={isCollapsed}
                onToggle={() => toggleSeriesCollapsed(group.series!.id)}
                animationIndex={startIndex}
                isMobile={isMobile}
              />
            </Box>
          );
        } else {
          // Standalone post
          const document = group.posts[0];
          const currentIndex = animationIndex;
          animationIndex += 1;

          return (
            <Box
              key={document.id}
              sx={{
                width: cardWidth,
                mb: { xs: 1.5, sm: 2 }, // Match container padding for alignment
                animation: `fadeInUp 0.6s ease ${currentIndex * 0.1}s both`,
              }}
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
            </Box>
          );
        }
      })}
    </Box>
  );
};

export default PostsGrid;
