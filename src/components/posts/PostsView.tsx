"use client";
import React, { useMemo, useState } from "react";
import { Box } from "@mui/material";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Series, User, UserDocument } from "@/types";
import { PartitionGranularity } from "@/types/partitioning";
import { useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";
import useLocalStorage from "@/hooks/useLocalStorage";
import { usePostsGrouping } from "@/hooks/usePostsGrouping";
import { useTimeEditing } from "@/hooks/useTimeEditing";
import { type ViewType } from "@/components/shared/ViewToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import PostsTimeSection from "./PostsTimeSection";

// Header & controls
import SeriesHeader from "./components/SeriesHeader";
import SeriesSearchAndControls from "./components/SeriesSearchAndControls";

// Drawers & dialogs
import CreatePostDrawer from "@/components/drawers/CreatePostDrawer";
import CreateSeriesDrawer from "@/components/drawers/CreateSeriesDrawer";
import AddPostsDialog from "./AddPostsDialog";

interface PostsViewProps {
  /**
   * When provided, renders in series mode; otherwise renders all posts with
   * the same series-style header and controls ("All Posts" virtual mode).
   */
  series?: Series;
  /** Server-side user session (optional; falls back to next-auth client). */
  user?: User;
}

/**
 * Unified view for both /posts (all blog posts) and /posts/[id] (series detail).
 *
 * Series mode      – `series` prop provided.  Posts come from the series object,
 *                   supports time-edit mode for re-ordering posts by date.
 * All-posts mode   – no `series` prop. Posts come from Redux. Uses the same
 *                   series-style header and controls layout.
 */
const PostsView: React.FC<PostsViewProps> = ({ series, user: serverUser }) => {
  const isSeries = !!series;
  const router = useRouter();

  const { data: session } = useSession();
  const user = serverUser ?? (session?.user as User | undefined);
  const canEdit = isSeries ? !!user && user.id === series!.authorId : !!user;

  // ── Common state ──────────────────────────────────────────────────────────
  const [granularity, setGranularity] = useState<PartitionGranularity>(
    "quarter",
  );
  // Separate localStorage keys so each view retains its own preference.
  const [viewType, setViewType] = useLocalStorage<ViewType>(
    isSeries ? "seriesPostsView" : "postsView",
    "grid",
  );

  // ── Drawer / dialog state ─────────────────────────────────────────────────
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Redux (all-posts mode) ────────────────────────────────────────────────
  const allPostsFromStore = useSelector(selectAllPosts);

  // ── Series time-editing (always called – hooks must be unconditional) ─────
  const {
    isTimeEditMode,
    pendingTimeChanges,
    isSavingTimeChanges,
    sortedWithPending,
    handleToggleTimeEditMode,
    handleTimeAdjust,
    handleTimeReset,
    handleSaveTimeChanges,
    handleDiscardTimeChanges,
  } = useTimeEditing(series?.posts ?? []);

  // Wrap series Document[] → UserDocument[] for the shared grouping hook.
  const seriesUserDocs: UserDocument[] = useMemo(
    () =>
      isSeries
        ? sortedWithPending.map((post) => ({
          id: post.id,
          cloud: post,
          local: undefined,
        }))
        : [],
    [isSeries, sortedWithPending],
  );

  // ── Data pipeline ─────────────────────────────────────────────────────────
  const rawPosts = isSeries ? seriesUserDocs : allPostsFromStore;

  // Grouping (unified hook).
  const { timeGroups } = usePostsGrouping({
    posts: rawPosts,
    allPosts: isSeries ? undefined : allPostsFromStore,
    granularity,
    pendingTimeChanges: isSeries ? pendingTimeChanges : undefined,
  });

  // ── Derived counts ────────────────────────────────────────────────────────
  const totalCount = isSeries
    ? sortedWithPending.length
    : allPostsFromStore.length;
  const filteredCount = rawPosts.length;

  const handlePostsAdded = () => router.refresh();

  // ── Render ────────────────────────────────────────────────────────────────
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
      role="main"
      aria-label={isSeries ? `Series: ${series!.title}` : "Blog posts"}
    >
      {/* ── Header ── */}
      <SeriesHeader
        series={series}
        canEdit={canEdit}
        postCount={isSeries ? sortedWithPending.length : totalCount}
        onAddPosts={isSeries ? () => setAddDialogOpen(true) : undefined}
        onNewPost={() => setCreatePostDrawerOpen(true)}
        onNewSeries={!isSeries
          ? () => setCreateSeriesDrawerOpen(true)
          : undefined}
      />

      {/* ── Controls bar ── */}
      {rawPosts.length > 0 && (
        <SeriesSearchAndControls
          granularity={granularity}
          onGranularityChange={setGranularity}
          filteredPostCount={filteredCount}
          viewType={viewType}
          onViewChange={setViewType}
          canEdit={canEdit && isSeries}
          isTimeEditMode={isTimeEditMode}
          isSavingTimeChanges={isSavingTimeChanges}
          pendingTimeChanges={pendingTimeChanges}
          onToggleTimeEdit={handleToggleTimeEditMode}
          onSaveTimeChanges={handleSaveTimeChanges}
          onDiscardTimeChanges={handleDiscardTimeChanges}
        />
      )}

      {/* ── Content ── */}
      {timeGroups.length === 0
        ? (
          <EmptyState
            emoji={isSeries ? "📚" : "📝"}
            title={isSeries ? "No posts in this series yet" : "No posts yet"}
            description={isSeries
              ? canEdit
                ? "Add your existing posts to organize them in this series"
                : "This series doesn't have any posts yet"
              : "Start writing your first blog post and share your thoughts with the world!"}
          />
        )
        : (
          <Box>
            {timeGroups.map((timeGroup, index) => (
              <Box key={timeGroup.timeKey}>
                <PostsTimeSection
                  timeGroup={timeGroup}
                  isLatest={index === 0}
                  viewType={viewType}
                  user={user}
                  isTimeEditMode={isSeries ? isTimeEditMode : undefined}
                  pendingChanges={isSeries ? pendingTimeChanges : undefined}
                  onTimeAdjust={isSeries && canEdit
                    ? handleTimeAdjust
                    : undefined}
                  onTimeReset={isSeries && canEdit
                    ? handleTimeReset
                    : undefined}
                />
              </Box>
            ))}
          </Box>
        )}

      {/* ── Drawers & dialogs ── */}
      <CreatePostDrawer
        open={createPostDrawerOpen}
        onClose={() => setCreatePostDrawerOpen(false)}
        seriesId={isSeries ? series!.id : ""}
        seriesTitle={isSeries ? series!.title : undefined}
        onSuccess={isSeries ? handlePostsAdded : undefined}
      />

      <CreateSeriesDrawer
        open={createSeriesDrawerOpen}
        onClose={() => setCreateSeriesDrawerOpen(false)}
      />

      {isSeries && (
        <AddPostsDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          seriesId={series!.id}
          existingPosts={sortedWithPending}
          onPostsAdded={handlePostsAdded}
        />
      )}
    </Box>
  );
};

export default PostsView;
