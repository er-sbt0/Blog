"use client";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
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

interface AddPostsDialogProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
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
    }
  }, [open]);

  const fetchAvailablePosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/series/available-posts");
      const { data, error } = await response.json();
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
    if (selectedPosts.size === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      // Add posts one by one with order
      const postIds = Array.from(selectedPosts);
      for (let i = 0; i < postIds.length; i++) {
        const response = await fetch(`/api/series/${seriesId}/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: postIds[i],
            order: i + 1000, // Start from 1000 to append at end
          }),
        });

        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error?.title || "Failed to add post");
        }
      }

      onPostsAdded();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add posts");
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
          <Typography variant="h6">Add Posts to Series</Typography>
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
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 6,
              }}
            >
              <CircularProgress />
            </Box>
          )
          : availablePosts.length === 0
          ? (
            <Box sx={{ textAlign: "center", py: 6, px: 2 }}>
              <Search
                sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No available posts
              </Typography>
              <Typography variant="body2" color="text.secondary">
                All your posts are already in a series, or you haven&apos;t
                created any posts yet.
              </Typography>
            </Box>
          )
          : (
            <>
              {/* Select all header */}
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
                  {availablePosts.length} post
                  {availablePosts.length !== 1 ? "s" : ""} available
                </Typography>
                <Button size="small" onClick={handleSelectAll}>
                  {selectedPosts.size === availablePosts.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </Box>

              <List sx={{ maxHeight: 400, overflow: "auto" }}>
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
                          `Updated ${
                            new Date(post.updatedAt).toLocaleDateString()
                          }`}
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
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleAddPosts}
          disabled={selectedPosts.size === 0 || submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : <Add />}
        >
          {submitting
            ? "Adding..."
            : `Add ${selectedPosts.size || ""} Post${
              selectedPosts.size !== 1 ? "s" : ""
            }`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddPostsDialog;
