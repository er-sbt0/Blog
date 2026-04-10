"use client";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { Add, Article, Close, Search } from "@mui/icons-material";
import { Document } from "@/types";
import { DateDisplay } from "@/components/DateDisplay";
import { LoadingState } from "@/components/LoadingState";

interface SeriesApiResponse {
  data?: Document[];
  error?: { title: string };
}

interface AddPostsDialogProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
  existingPosts?: Document[];
  onPostsAdded: () => void;
}

/**
 * Dialog for adding posts to a series
 * Shows available posts (not in any series) and allows selecting multiple
 */
const AddPostsDialog: React.FC<AddPostsDialogProps> = ({
  open,
  onClose,
  seriesId,
  existingPosts = [],
  onPostsAdded,
}) => {
  const [availablePosts, setAvailablePosts] = useState<Document[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available posts when dialog opens
  useEffect(() => {
    if (open) {
      fetchAvailablePosts();
      // Initialize selected posts with existing posts
      setSelectedPosts(new Set(existingPosts.map((p) => p.id)));
    }
  }, [open, existingPosts]);

  const fetchAvailablePosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/series/available-posts");
      const { data, error } = (await response.json()) as SeriesApiResponse;
      if (error) {
        setError(error.title || "Failed to load posts");
        return;
      }
      setAvailablePosts(data || []);
    } catch (err) {
      setError("Failed to load available posts");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePost = (postId: string) => {
    setSelectedPosts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPosts.size === availablePosts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(availablePosts.map((p) => p.id)));
    }
  };

  const handleAddPosts = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const existingPostIds = new Set(existingPosts.map((p) => p.id));
      const currentlySelected = Array.from(selectedPosts);

      // Find posts to add (selected but not in existing)
      const postsToAdd = currentlySelected
        .filter((id) => !existingPostIds.has(id))
        .map((postId, i) => ({ postId, order: i + 1000 }));

      // Find posts to remove (in existing but not selected)
      const postsToRemove = existingPosts
        .map((p) => p.id)
        .filter((id) => !selectedPosts.has(id));

      const response = await fetch(`/api/series/${seriesId}/posts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postsToAdd, postsToRemove }),
      });

      if (!response.ok) {
        const { error } = (await response.json()) as SeriesApiResponse;
        throw new Error(error?.title || "Failed to update posts");
      }

      onPostsAdded();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update posts");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPosts(new Set());
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Add color="primary" />
          <Typography variant="h6">Edit Posts in Series</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 0 }}>
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {loading
          ? (
            <LoadingState
              variant="spinner"
              showMessage={false}
              height={150}
            />
          )
          : (() => {
            // Combine available posts and existing posts for display
            const allPosts = [
              ...existingPosts.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                updatedAt: p.updatedAt,
                inSeries: true,
              })),
              ...availablePosts.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                updatedAt: p.updatedAt,
                inSeries: false,
              })),
            ];

            if (allPosts.length === 0) {
              return (
                <Box sx={{ textAlign: "center", py: 6, px: 2 }}>
                  <Search
                    sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
                  />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No posts available
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    You haven&apos;t created any posts yet.
                  </Typography>
                </Box>
              );
            }

            return (
              <>
                {/* Info header */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    py: 1,
                    backgroundColor: "action.hover",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {existingPosts.length} in series · {availablePosts.length}
                    {" "}
                    available
                  </Typography>
                  <Button size="small" onClick={handleSelectAll}>
                    {selectedPosts.size === allPosts.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </Box>

                {/* Existing posts section */}
                {existingPosts.length > 0 && (
                  <>
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        backgroundColor: "background.default",
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                      >
                        IN SERIES
                      </Typography>
                    </Box>
                    <List sx={{ pt: 0 }}>
                      {existingPosts.map((post) => (
                        <ListItem key={post.id} disablePadding>
                          <ListItemButton
                            onClick={() =>
                              handleTogglePost(post.id)}
                            dense
                          >
                            <ListItemIcon sx={{ minWidth: 40 }}>
                              <Checkbox
                                edge="start"
                                checked={selectedPosts.has(post.id)}
                                tabIndex={-1}
                                disableRipple
                              />
                            </ListItemIcon>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Article color="primary" />
                            </ListItemIcon>
                            <ListItemText
                              primary={post.name}
                              secondary={post.description ||
                                (
                                  <>
                                    Updated{" "}
                                    <DateDisplay
                                      date={post.updatedAt}
                                      variant="medium"
                                    />
                                  </>
                                )}
                              primaryTypographyProps={{
                                fontWeight: 500,
                                noWrap: true,
                              }}
                              secondaryTypographyProps={{
                                noWrap: true,
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}

                {/* Available posts section */}
                {availablePosts.length > 0 && (
                  <>
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        backgroundColor: "background.default",
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                      >
                        AVAILABLE TO ADD
                      </Typography>
                    </Box>
                    <List sx={{ pt: 0, maxHeight: 300, overflow: "auto" }}>
                      {availablePosts.map((post) => (
                        <ListItem key={post.id} disablePadding>
                          <ListItemButton
                            onClick={() =>
                              handleTogglePost(post.id)}
                            dense
                          >
                            <ListItemIcon sx={{ minWidth: 40 }}>
                              <Checkbox
                                edge="start"
                                checked={selectedPosts.has(post.id)}
                                tabIndex={-1}
                                disableRipple
                              />
                            </ListItemIcon>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Article color="action" />
                            </ListItemIcon>
                            <ListItemText
                              primary={post.name}
                              secondary={post.description ||
                                (
                                  <>
                                    Updated{" "}
                                    <DateDisplay
                                      date={post.updatedAt}
                                      variant="medium"
                                    />
                                  </>
                                )}
                              primaryTypographyProps={{
                                fontWeight: 500,
                                noWrap: true,
                              }}
                              secondaryTypographyProps={{
                                noWrap: true,
                              }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}
              </>
            );
          })()}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleAddPosts}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : <Add />}
        >
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddPostsDialog;
