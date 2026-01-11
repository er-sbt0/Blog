import React, { useCallback, useMemo, useState } from "react";
import { Box, IconButton, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ChevronRight } from "@mui/icons-material";
import { Series, UserDocument } from "@/types";
import { useSelector } from "@/store";
import DocumentCard from "@/components/DocumentCardNew";
import {
  buildSeriesMap,
  groupPostsBySeries,
  type SeriesGroupItem,
} from "../utils/seriesGrouping";

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

  // Track collapsed state for each series (default: expanded)
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(
    new Set(),
  );

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
          animationIndex += group.posts.length;
          const isCollapsed = collapsedSeries.has(group.series.id);
          const hasMultipleCards = group.posts.length > 1;

          return (
            <Box
              key={`series-${group.series.id}`}
              component="fieldset"
              sx={{
                display: "inline-block",
                borderRadius: 2,
                border: "1px solid",
                borderColor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(144, 202, 249, 0.2)"
                    : "rgba(25, 118, 210, 0.15)",
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(144, 202, 249, 0.03)"
                    : "rgba(25, 118, 210, 0.02)",
                pt: { xs: 0.5, sm: 1 },
                px: { xs: 1.5, sm: 2 },
                pb: { xs: 1.5, sm: 2 },
                m: 0,
                transition: "all 0.2s ease",
                position: "relative",
                "&:hover": {
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? "rgba(144, 202, 249, 0.08)"
                      : "rgba(25, 118, 210, 0.05)",
                  borderColor: (t) =>
                    t.palette.mode === "dark"
                      ? "rgba(144, 202, 249, 0.35)"
                      : "rgba(25, 118, 210, 0.25)",
                },
              }}
            >
              {/* Series title embedded in border */}
              <Box
                component="legend"
                sx={{
                  px: 1,
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "text.secondary",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                {/* Collapse/Expand toggle */}
                {hasMultipleCards && (
                  <IconButton
                    size="small"
                    onClick={() => toggleSeriesCollapsed(group.series!.id)}
                    sx={{
                      p: 0,
                      width: 20,
                      height: 20,
                      transition: "transform 0.2s ease",
                      transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                      color: "text.secondary",
                      "&:hover": {
                        color: "primary.main",
                        bgcolor: "transparent",
                      },
                    }}
                  >
                    <ChevronRight sx={{ fontSize: "1.1rem" }} />
                  </IconButton>
                )}
                <Box
                  component="a"
                  href={`/series/${group.series.id}`}
                  sx={{
                    textDecoration: "none",
                    color: "inherit",
                    transition: "color 0.2s ease",
                    "&:hover": {
                      color: "primary.main",
                    },
                  }}
                >
                  {group.series.title}
                  {hasMultipleCards && (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.5,
                        color: "text.disabled",
                        fontWeight: 400,
                      }}
                    >
                      ({group.posts.length})
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Series cards */}
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: `${gap}px`,
                }}
              >
                {group.posts.map((document, index) => {
                  // When collapsed, only show first card
                  if (isCollapsed && index > 0) {
                    return null;
                  }

                  return (
                    <Box
                      key={document.id}
                      sx={{
                        width: cardWidth,
                        animation: !isCollapsed
                          ? `fadeInUp 0.6s ease ${
                            (startIndex + index) * 0.1
                          }s both`
                          : "none",
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
                })}
              </Box>
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
