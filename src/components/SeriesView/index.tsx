"use client";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentType, Post, Series, User } from "@/types";
import { useSession } from "next-auth/react";
import { PartitionGranularity } from "@/types/partitioning";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import {
  AccessTime,
  Add,
  Check,
  Clear,
  Close,
  CollectionsBookmark,
  NoteAdd,
  Search,
} from "@mui/icons-material";
import Grid from "@mui/material/Grid2";
import DocumentCard from "../DocumentCardNew";
import AddPostsDialog from "./AddPostsDialog";
import CreatePostDrawer from "../CreatePostDrawer";
import { useRouter } from "next/navigation";
import { usePostsGrouping } from "./hooks/usePostsGrouping";
import { PostsPartitionControl } from "./components/PostsPartitionControl";
import PostsTimeSection from "./components/PostsTimeSection";
import { ViewToggle, type ViewType } from "./components/ViewToggle";
import { PendingTimeChange } from "./components/PostsCompactListView";

interface SeriesViewProps {
  series: Series;
  user?: User;
}

/**
 * Format date to readable string
 */
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

/**
 * Series detail view component
 * Shows series information and contained posts with management capabilities
 */
const SeriesView: React.FC<SeriesViewProps> = ({
  series,
  user: serverUser,
}) => {
  const router = useRouter();

  // Fetch session on client-side since SSR session doesn't work reliably
  const { data: session } = useSession();
  const clientUser = session?.user as User | undefined;

  // Use client session if server session is not available
  const user = serverUser || clientUser;

  const canEdit = !!user && user.id === series.authorId;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [granularity, setGranularity] = useState<PartitionGranularity>(
    "quarter",
  );
  const [viewType, setViewType] = useState<ViewType>("grid");

  // Global time editing state
  const [isTimeEditMode, setIsTimeEditMode] = useState(false);
  const [pendingTimeChanges, setPendingTimeChanges] = useState<
    Map<string, PendingTimeChange>
  >(new Map());
  const [isSavingTimeChanges, setIsSavingTimeChanges] = useState(false);

  // Load view preference from localStorage on mount
  useEffect(() => {
    const savedView = localStorage.getItem("seriesPostsView");
    if (savedView && ["grid", "compact", "detailed"].includes(savedView)) {
      setViewType(savedView as ViewType);
    }
  }, []);

  // Save view preference to localStorage when changed
  const handleViewChange = (newView: ViewType) => {
    setViewType(newView);
    localStorage.setItem("seriesPostsView", newView);
  };

  // Global time editing handlers
  const handleToggleTimeEditMode = useCallback(() => {
    if (isTimeEditMode) {
      // Exiting edit mode - discard changes
      setPendingTimeChanges(new Map());
    }
    setIsTimeEditMode(!isTimeEditMode);
  }, [isTimeEditMode]);

  const handleTimeAdjust = useCallback(
    (postId: string, originalDate: Date, days: number) => {
      setPendingTimeChanges((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(postId);
        const currentDate = existing
          ? existing.newDate
          : new Date(originalDate);
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);

        newMap.set(postId, {
          originalDate: existing
            ? existing.originalDate
            : new Date(originalDate),
          newDate,
        });
        return newMap;
      });
    },
    [],
  );

  const handleTimeReset = useCallback((postId: string) => {
    setPendingTimeChanges((prev) => {
      const newMap = new Map(prev);
      newMap.delete(postId);
      return newMap;
    });
  }, []);

  const handleSaveTimeChanges = useCallback(async () => {
    if (pendingTimeChanges.size === 0) return;

    setIsSavingTimeChanges(true);
    try {
      const updates = Array.from(pendingTimeChanges.entries()).map((
        [id, change],
      ) => ({
        id,
        createdAt: change.newDate,
      }));

      const response = await fetch("/api/posts/update-times", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error("Failed to update times");
      }

      setPendingTimeChanges(new Map());
      setIsTimeEditMode(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save time changes:", error);
    } finally {
      setIsSavingTimeChanges(false);
    }
  }, [pendingTimeChanges, router]);

  const handleDiscardTimeChanges = useCallback(() => {
    setPendingTimeChanges(new Map());
    setIsTimeEditMode(false);
  }, []);

  // Sort posts, applying pending time changes for live reordering
  const sortedPosts = useMemo(
    () =>
      [...(series.posts || [])].sort((a, b) => {
        // Use pending date if available, otherwise use original date
        const pendingA = pendingTimeChanges.get(a.id);
        const pendingB = pendingTimeChanges.get(b.id);
        const dateA = (pendingA ? pendingA.newDate : new Date(a.createdAt || 0))
          .getTime();
        const dateB = (pendingB ? pendingB.newDate : new Date(b.createdAt || 0))
          .getTime();
        return dateB - dateA; // Newest first
      }),
    [series.posts, pendingTimeChanges],
  );

  // Filter posts by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedPosts;
    }

    const query = searchQuery.toLowerCase().trim();
    return sortedPosts.filter((post) => {
      // Search in post title
      if (post.name?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in post handle
      if (post.handle?.toLowerCase().includes(query)) {
        return true;
      }

      // Search in author name
      if (post.author?.name?.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  }, [sortedPosts, searchQuery]);

  // Apply time grouping to filtered posts, with pending changes for live preview
  const { timeGroups } = usePostsGrouping({
    posts: filteredPosts,
    granularity,
    pendingTimeChanges,
  });

  const handlePostsAdded = () => {
    router.refresh();
  };

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
      {/* Series Header */}
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 2,
          }}
        >
          <CollectionsBookmark
            sx={{
              fontSize: { xs: 28, md: 36 },
              color: "primary.main",
            }}
          />
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 700,
              fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2.125rem" },
              color: "text.primary",
            }}
          >
            {series.title}
          </Typography>
        </Box>

        {canEdit && (
          <Box sx={{ mb: 2, display: "flex", gap: 1.5 }}>
            <Button
              variant="contained"
              startIcon={<NoteAdd />}
              onClick={() => setCreatePostDrawerOpen(true)}
              sx={{
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 600,
                height: "40px",
              }}
            >
              New Post
            </Button>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => setAddDialogOpen(true)}
              sx={{
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 600,
                height: "40px",
              }}
            >
              Add/Remove Posts
            </Button>
          </Box>
        )}

        {/* Meta info */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            mb: 2,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.875rem" }}
          >
            {formatDate(series.createdAt)}
          </Typography>
          <Box
            sx={{
              width: 4,
              height: 4,
              bgcolor: "text.secondary",
              borderRadius: "50%",
            }}
          />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.875rem" }}
          >
            by {series.author?.name || "Unknown"}
          </Typography>
          <Box
            sx={{
              width: 4,
              height: 4,
              bgcolor: "text.secondary",
              borderRadius: "50%",
            }}
          />
          <Chip
            label={`${sortedPosts.length} post${
              sortedPosts.length !== 1 ? "s" : ""
            }`}
            size="small"
            color="primary"
            sx={{ fontWeight: 600, fontSize: "0.75rem" }}
          />
        </Box>

        {series.description && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 800,
              lineHeight: 1.6,
            }}
          >
            {series.description}
          </Typography>
        )}
      </Box>

      {/* Search Box and Partition Control */}
      {sortedPosts.length > 0 && (
        <Box sx={{ mb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search posts by title, handle, or author..."
            value={searchQuery}
            onChange={(e) =>
              setSearchQuery(e.target.value)}
            sx={{
              maxWidth: { xs: "100%", md: 600 },
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                backgroundColor: "background.paper",
                transition: "box-shadow 0.2s ease-in-out",
                "&:hover": {
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                },
                "&.Mui-focused": {
                  boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: "text.secondary", fontSize: 22 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    sx={{
                      "&:hover": {
                        backgroundColor: "action.hover",
                      },
                    }}
                  >
                    <Clear sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <PostsPartitionControl
              granularity={granularity}
              onGranularityChange={setGranularity}
              postCount={filteredPosts.length}
              disabled={filteredPosts.length === 0}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              {/* Global Time Edit Controls - only for compact view and can edit */}
              {canEdit && viewType === "compact" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Button
                    size="small"
                    variant={isTimeEditMode ? "contained" : "outlined"}
                    startIcon={<AccessTime />}
                    onClick={handleToggleTimeEditMode}
                    sx={{
                      textTransform: "none",
                      fontWeight: 500,
                      fontSize: "0.8rem",
                      borderRadius: 1.5,
                      height: 32,
                    }}
                  >
                    {isTimeEditMode ? "Editing" : "Edit"}
                  </Button>

                  {isTimeEditMode && (
                    <>
                      {pendingTimeChanges.size > 0 && (
                        <Chip
                          size="small"
                          label={`${pendingTimeChanges.size} modified`}
                          color="warning"
                          sx={{ fontSize: "0.75rem", height: 24 }}
                        />
                      )}
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={<Check />}
                        onClick={handleSaveTimeChanges}
                        disabled={pendingTimeChanges.size === 0 ||
                          isSavingTimeChanges}
                        sx={{
                          textTransform: "none",
                          fontWeight: 500,
                          fontSize: "0.8rem",
                          borderRadius: 1.5,
                          minWidth: 80,
                          height: 32,
                        }}
                      >
                        {isSavingTimeChanges ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Close />}
                        onClick={handleDiscardTimeChanges}
                        disabled={isSavingTimeChanges}
                        sx={{
                          textTransform: "none",
                          fontWeight: 500,
                          fontSize: "0.8rem",
                          borderRadius: 1.5,
                          height: 32,
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </Box>
              )}
              <ViewToggle view={viewType} onChange={handleViewChange} />
            </Box>
          </Box>
        </Box>
      )}

      {/* Posts Grid with Time Partitioning */}
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

      {/* Add Posts Dialog */}
      <AddPostsDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        seriesId={series.id}
        existingPosts={sortedPosts}
        onPostsAdded={handlePostsAdded}
      />

      {/* Create Post Drawer */}
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
