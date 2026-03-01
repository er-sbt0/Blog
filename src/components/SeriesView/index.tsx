"use client";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Series, User } from "@/types";
import { useSession } from "next-auth/react";
import { PartitionGranularity } from "@/types/partitioning";
import { Box } from "@mui/material";
import AddPostsDialog from "./AddPostsDialog";
import CreatePostDrawer from "../CreatePostDrawer";
import { useRouter } from "next/navigation";
import { usePostsGrouping } from "./hooks/usePostsGrouping";
import PostsTimeSection from "./components/PostsTimeSection";
import { type ViewType } from "./components/ViewToggle";
import { useTimeEditing } from "./hooks/useTimeEditing";
import SeriesHeader from "./components/SeriesHeader";
import SeriesSearchAndControls from "./components/SeriesSearchAndControls";

interface SeriesViewProps {
  series: Series;
  user?: User;
}

const SeriesView: React.FC<SeriesViewProps> = (
  { series, user: serverUser },
) => {
  const router = useRouter();
  const { data: session } = useSession();
  const user = serverUser || (session?.user as User | undefined);
  const canEdit = !!user && user.id === series.authorId;

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [granularity, setGranularity] = useState<PartitionGranularity>(
    "quarter",
  );
  const [viewType, setViewType] = useState<ViewType>("grid");

  useEffect(() => {
    const saved = localStorage.getItem("seriesPostsView");
    if (saved && ["grid", "compact", "detailed"].includes(saved)) {
      setViewType(saved as ViewType);
    }
  }, []);

  const handleViewChange = (v: ViewType) => {
    setViewType(v);
    localStorage.setItem("seriesPostsView", v);
  };

  const {
    isTimeEditMode,
    pendingTimeChanges,
    isSavingTimeChanges,
    sortedWithPending: sortedPosts,
    handleToggleTimeEditMode,
    handleTimeAdjust,
    handleTimeReset,
    handleSaveTimeChanges,
    handleDiscardTimeChanges,
  } = useTimeEditing(series.posts || []);

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return sortedPosts;
    const q = searchQuery.toLowerCase().trim();
    return sortedPosts.filter(
      (post) =>
        post.name?.toLowerCase().includes(q) ||
        post.handle?.toLowerCase().includes(q) ||
        post.author?.name?.toLowerCase().includes(q),
    );
  }, [sortedPosts, searchQuery]);

  const { timeGroups } = usePostsGrouping({
    posts: filteredPosts,
    granularity,
    pendingTimeChanges,
  });

  const handlePostsAdded = () => router.refresh();

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
    >
      <SeriesHeader
        series={series}
        canEdit={canEdit}
        postCount={sortedPosts.length}
        onNewPost={() => setCreatePostDrawerOpen(true)}
        onAddPosts={() => setAddDialogOpen(true)}
      />

      {sortedPosts.length > 0 && (
        <SeriesSearchAndControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          granularity={granularity}
          onGranularityChange={setGranularity}
          filteredPostCount={filteredPosts.length}
          viewType={viewType}
          onViewChange={handleViewChange}
          canEdit={canEdit}
          isTimeEditMode={isTimeEditMode}
          isSavingTimeChanges={isSavingTimeChanges}
          pendingTimeChanges={pendingTimeChanges}
          onToggleTimeEdit={handleToggleTimeEditMode}
          onSaveTimeChanges={handleSaveTimeChanges}
          onDiscardTimeChanges={handleDiscardTimeChanges}
        />
      )}

      {filteredPosts.length > 0
        ? (
          <Box>
            {timeGroups.map((timeGroup, index) => (
              <Box key={timeGroup.timeKey}>
                <PostsTimeSection
                  timeGroup={timeGroup}
                  user={user}
                  isLatest={index === 0}
                  viewType={viewType}
                  isTimeEditMode={isTimeEditMode}
                  pendingChanges={pendingTimeChanges}
                  onTimeAdjust={canEdit ? handleTimeAdjust : undefined}
                  onTimeReset={canEdit ? handleTimeReset : undefined}
                />
              </Box>
            ))}
          </Box>
        )
        : (
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
              {searchQuery ? "🔍" : "📚"}
            </Box>
            <Box
              sx={{
                fontSize: { xs: "1.125rem", md: "1.375rem" },
                mb: 1,
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              {searchQuery ? "No posts found" : "No posts in this series yet"}
            </Box>
            <Box
              sx={{
                fontSize: { xs: "0.875rem", md: "1rem" },
                color: "text.secondary",
                maxWidth: 400,
                mx: "auto",
              }}
            >
              {searchQuery
                ? `No posts match "${searchQuery}". Try a different search term.`
                : canEdit
                ? "Add your existing posts to organize them in this series"
                : "This series doesn't have any posts yet"}
            </Box>
          </Box>
        )}

      <AddPostsDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        seriesId={series.id}
        existingPosts={sortedPosts}
        onPostsAdded={handlePostsAdded}
      />
      <CreatePostDrawer
        open={createPostDrawerOpen}
        onClose={() => setCreatePostDrawerOpen(false)}
        seriesId={series.id}
        seriesTitle={series.title}
        onSuccess={handlePostsAdded}
      />
    </Box>
  );
};

export default SeriesView;
