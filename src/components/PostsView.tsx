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
import { usePostsSearch } from "@/hooks/usePostsSearch";
import {
  TimeFilterValue,
  usePostsTimeFilter,
} from "@/hooks/usePostsTimeFilter";
import { useTimeEditing } from "@/hooks/useTimeEditing";
import { type ViewType } from "@/components/shared/ViewToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import { getPostSeriesId } from "@/utils/posts/seriesGrouping";
import PostsTimeSection from "./PostsTimeSection";

// All-posts mode components
import PostsHeader from "@/components/PostsList/components/PostsHeader";
import PostsLoadingState from "@/components/PostsList/components/PostsLoadingState";
import CreatePostDrawer from "@/components/CreatePostDrawer";
import CreateSeriesDrawer from "@/components/CreateSeriesDrawer";

// Series mode components
import SeriesHeader from "@/components/SeriesView/components/SeriesHeader";
import SeriesSearchAndControls from "@/components/SeriesView/components/SeriesSearchAndControls";
import AddPostsDialog from "@/components/SeriesView/AddPostsDialog";

interface PostsViewProps {
  /** When provided, renders in series mode; otherwise all-posts mode. */
  series?: Series;
  /** Server-side user session (optional; falls back to next-auth client). */
  user?: User;
}

/**
 * Unified view for both /posts (all blog posts) and /posts/[id] (series detail).
 *
 * All-posts mode  – no `series` prop.  Reads posts from Redux, supports time
 *                   filtering, search, series/post content toggle, and view type.
 * Series mode      – `series` prop provided.  Posts come from the series object,
 *                   supports time-edit mode for re-ordering posts by date.
 */
const PostsView: React.FC<PostsViewProps> = ({ series, user: serverUser }) => {
  const isSeries = !!series;
  const router = useRouter();

  const { data: session } = useSession();
  const user = serverUser ?? (session?.user as User | undefined);
  const canEdit = isSeries ? !!user && user.id === series!.authorId : !!user;

  // ── Common state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [granularity, setGranularity] = useState<PartitionGranularity>(
    "quarter",
  );
  // Separate localStorage keys so each view retains its own preference.
  const [viewType, setViewType] = useLocalStorage<ViewType>(
    isSeries ? "seriesPostsView" : "postsView",
    "grid",
  );

  // ── All-posts mode state ──────────────────────────────────────────────────
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>("all");
  const [showPosts, setShowPosts] = useLocalStorage("postsShowPosts", true);
  const [showSeries, setShowSeries] = useLocalStorage("postsShowSeries", true);

  // ── Series mode state ─────────────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Redux (all-posts mode) ────────────────────────────────────────────────
  const allPostsFromStore = useSelector(selectAllPosts);
  const documentsLoading = useSelector((state) => state.ui.documentsLoading);

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

  // Time filter (no-op in series mode – pass "all").
  const { filteredPosts: timeFilteredPosts } = usePostsTimeFilter({
    posts: rawPosts,
    timeFilter: isSeries ? "all" : timeFilter,
  });

  // Search (common to both modes).
  const { filteredPosts: searchFilteredPosts } = usePostsSearch({
    posts: timeFilteredPosts,
    searchQuery,
  });

  // Grouping (unified hook).
  const { timeGroups } = usePostsGrouping({
    posts: searchFilteredPosts,
    allPosts: isSeries ? undefined : allPostsFromStore,
    granularity,
    pendingTimeChanges: isSeries ? pendingTimeChanges : undefined,
  });

  // ── Derived counts ────────────────────────────────────────────────────────
  const totalCount = isSeries
    ? sortedWithPending.length
    : allPostsFromStore.length;
  const filteredCount = searchFilteredPosts.length;
  const hasActiveFilters = searchQuery.trim() !== "" ||
    (!isSeries && timeFilter !== "all");

  // In all-posts mode, hide time buckets that have no visible content after
  // applying the posts / series visibility toggles.
  const displayGroups = useMemo(() => {
    if (isSeries) return timeGroups;
    if (showPosts && showSeries) return timeGroups;
    return timeGroups.filter((group) =>
      group.posts.some((post) => {
        const inSeries = !!getPostSeriesId(post);
        return inSeries ? showSeries : showPosts;
      })
    );
  }, [timeGroups, isSeries, showPosts, showSeries]);

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
      {isSeries
        ? (
          <SeriesHeader
            series={series!}
            canEdit={canEdit}
            postCount={sortedWithPending.length}
            onNewPost={() => setCreatePostDrawerOpen(true)}
            onAddPosts={() => setAddDialogOpen(true)}
          />
        )
        : (
          <PostsHeader
            totalCount={hasActiveFilters ? filteredCount : totalCount}
            loading={documentsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            granularity={granularity}
            onGranularityChange={setGranularity}
            onNewPost={() => setCreatePostDrawerOpen(true)}
            onNewSeries={() => setCreateSeriesDrawerOpen(true)}
            viewType={viewType}
            onViewTypeChange={setViewType}
            showPosts={showPosts}
            onShowPostsChange={setShowPosts}
            showSeries={showSeries}
            onShowSeriesChange={setShowSeries}
          />
        )}

      {/* ── Series search & controls ── */}
      {isSeries && sortedWithPending.length > 0 && (
        <SeriesSearchAndControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          granularity={granularity}
          onGranularityChange={setGranularity}
          filteredPostCount={filteredCount}
          viewType={viewType}
          onViewChange={setViewType}
          canEdit={canEdit}
          isTimeEditMode={isTimeEditMode}
          isSavingTimeChanges={isSavingTimeChanges}
          pendingTimeChanges={pendingTimeChanges}
          onToggleTimeEdit={handleToggleTimeEditMode}
          onSaveTimeChanges={handleSaveTimeChanges}
          onDiscardTimeChanges={handleDiscardTimeChanges}
        />
      )}

      {/* ── Content ── */}
      {!isSeries && documentsLoading
        ? (
          <section aria-label="Loading posts" aria-live="polite">
            <PostsLoadingState />
          </section>
        )
        : displayGroups.length === 0
        ? (
          <EmptyState
            emoji={hasActiveFilters ? "🔍" : isSeries ? "📚" : "📝"}
            title={hasActiveFilters
              ? searchQuery
                ? `No posts found for "${searchQuery}"`
                : "No posts found in this time period"
              : isSeries
              ? "No posts in this series yet"
              : "No posts yet"}
            description={hasActiveFilters
              ? "Try adjusting your search or filter criteria"
              : isSeries
              ? canEdit
                ? "Add your existing posts to organize them in this series"
                : "This series doesn't have any posts yet"
              : "Start writing your first blog post and share your thoughts with the world!"}
          />
        )
        : (
          <Box>
            {displayGroups.map((timeGroup, index) => (
              <Box key={timeGroup.timeKey}>
                <PostsTimeSection
                  timeGroup={timeGroup}
                  isLatest={index === 0}
                  viewType={viewType}
                  // all-posts mode props (undefined = series mode)
                  showPosts={isSeries ? undefined : showPosts}
                  showSeries={isSeries ? undefined : showSeries}
                  // series mode props (undefined = all-posts mode)
                  user={isSeries ? user : undefined}
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

      {!isSeries && (
        <CreateSeriesDrawer
          open={createSeriesDrawerOpen}
          onClose={() => setCreateSeriesDrawerOpen(false)}
        />
      )}

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
