"use client";
import React, { useState } from "react";
import { Box } from "@mui/material";

// Import components
import TimeSection from "./components/TimeSection";
import PostsHeader from "./components/PostsHeader";
import PostsLoadingState from "./components/PostsLoadingState";
import CreatePostDrawer from "@/components/CreatePostDrawer";
import CreateSeriesDrawer from "@/components/CreateSeriesDrawer";
import { ViewType } from "@/components/SeriesView/components/ViewToggle";
import { getPostSeriesId } from "./utils/seriesGrouping";

// Import custom hooks
import { usePostsData } from "./hooks/usePostsData";
import useLocalStorage from "@/hooks/useLocalStorage";

interface PostsListProps {
  // No props needed for now
}

/**
 * Main PostsList component that displays blog posts with flexible partitioning
 * Features: Search, time filtering, partitioning control, responsive design, accessibility, SEO optimization
 */
const PostsList: React.FC<PostsListProps> = () => {
  // State for Create Post Drawer
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);

  // Layout and content filter state (persisted to localStorage)
  const [viewType, setViewType] = useLocalStorage<ViewType>(
    "postsView",
    "grid",
  );
  const [showPosts, setShowPosts] = useLocalStorage("postsShowPosts", true);
  const [showSeries, setShowSeries] = useLocalStorage("postsShowSeries", true);

  const handleViewTypeChange = (view: ViewType) => setViewType(view);
  const handleShowPostsChange = (show: boolean) => setShowPosts(show);
  const handleShowSeriesChange = (show: boolean) => setShowSeries(show);

  // Use custom hook to get posts data with search, filtering, and partitioning
  const {
    timeGroups,
    loading,
    totalCount,
    filteredCount,
    searchQuery,
    setSearchQuery,
    timeFilter,
    setTimeFilter,
    granularity,
    setGranularity,
    hasActiveFilters,
    searchResults,
  } = usePostsData();

  // Filter out time groups with no visible content given current showPosts/showSeries
  const displayGroups = timeGroups.filter((group) => {
    if (showPosts && showSeries) return true;
    return group.posts.some((post) => {
      const inSeries = !!getPostSeriesId(post);
      return inSeries ? showSeries : showPosts;
    });
  });

  return (
    <Box
      component="main"
      sx={{
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3, lg: 4 },
        minHeight: "50vh",
        maxWidth: "100%",
        width: "100%",
      }}
      // Accessibility attributes
      role="main"
      aria-label="Blog posts with flexible partitioning"
    >
      {/* Enhanced Header with Search and Filters */}
      <PostsHeader
        totalCount={hasActiveFilters ? filteredCount : totalCount}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        granularity={granularity}
        onGranularityChange={setGranularity}
        onNewPost={() => setCreatePostDrawerOpen(true)}
        onNewSeries={() => setCreateSeriesDrawerOpen(true)}
        viewType={viewType}
        onViewTypeChange={handleViewTypeChange}
        showPosts={showPosts}
        onShowPostsChange={handleShowPostsChange}
        showSeries={showSeries}
        onShowSeriesChange={handleShowSeriesChange}
      />

      {/* Time-Based Sections */}
      {loading
        ? (
          <section aria-label="Loading posts" aria-live="polite">
            <PostsLoadingState />
          </section>
        )
        : displayGroups.length === 0
        ? (
          <section
            role="region"
            aria-label={hasActiveFilters
              ? "No posts match filters"
              : "No posts available"}
            aria-live="polite"
          >
            <Box
              sx={{
                textAlign: "center",
                py: { xs: 6, md: 10 },
                px: { xs: 2, md: 4 },
                color: "text.secondary",
              }}
            >
              <Box
                sx={{
                  mb: 3,
                  fontSize: { xs: 40, md: 56 },
                  filter: "grayscale(0.3)",
                }}
              >
                {hasActiveFilters ? "🔍" : "📝"}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "1.125rem", md: "1.375rem" },
                  mb: 1,
                  fontWeight: 600,
                  color: "text.primary",
                }}
              >
                {hasActiveFilters
                  ? searchQuery
                    ? `No posts found for "${searchQuery}"`
                    : "No posts found in this time period"
                  : "No posts yet"}
              </Box>
              <Box
                sx={{
                  fontSize: { xs: "0.95rem", md: "1.125rem" },
                  maxWidth: 400,
                  mx: "auto",
                  lineHeight: 1.6,
                }}
              >
                {hasActiveFilters
                  ? "Try adjusting your search or filter criteria"
                  : "Start writing your first blog post and share your thoughts with the world!"}
              </Box>
            </Box>
          </section>
        )
        : (
          <section
            role="region"
            aria-label={`${filteredCount} blog posts organized by ${granularity}`}
            aria-live="polite"
          >
            <Box>
              {displayGroups.map((timeGroup, index) => (
                <Box key={timeGroup.timeKey}>
                  <TimeSection
                    timeGroup={timeGroup}
                    isLatest={index === 0}
                    viewType={viewType}
                    showPosts={showPosts}
                    showSeries={showSeries}
                  />
                </Box>
              ))}
            </Box>
          </section>
        )}

      {/* Create Post Drawer */}
      <CreatePostDrawer
        open={createPostDrawerOpen}
        onClose={() => setCreatePostDrawerOpen(false)}
        seriesId=""
      />

      {/* Create Series Drawer */}
      <CreateSeriesDrawer
        open={createSeriesDrawerOpen}
        onClose={() => setCreateSeriesDrawerOpen(false)}
      />
    </Box>
  );
};

export default PostsList;
