"use client";
import React from "react";
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
import { DateDisplay } from "@/components/common/DateDisplay";
import { LoadingState } from "@/components/common/LoadingState";
import { useAvailablePostsSelector } from "./hooks/useAvailablePostsSelector";

interface AddPostsDialogProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
  existingPosts?: Document[];
  onPostsAdded: () => void;
}

interface PostListItemProps {
  post: Document;
  checked: boolean;
  onToggle: (id: string) => void;
  iconColor?: "primary" | "action";
}

function PostListItem(
  { post, checked, onToggle, iconColor = "action" }: PostListItemProps,
) {
  return (
    <ListItem disablePadding>
      <ListItemButton onClick={() => onToggle(post.id)} dense>
        <ListItemIcon sx={{ minWidth: 40 }}>
          <Checkbox
            edge="start"
            checked={checked}
            tabIndex={-1}
            disableRipple
          />
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Article color={iconColor} />
        </ListItemIcon>
        <ListItemText
          primary={post.name}
          secondary={post.description || (
            <>
              Updated <DateDisplay date={post.updatedAt} variant="medium" />
            </>
          )}
          primaryTypographyProps={{ fontWeight: 500, noWrap: true }}
          secondaryTypographyProps={{ noWrap: true }}
        />
      </ListItemButton>
    </ListItem>
  );
}

interface PostListSectionProps {
  label: string;
  posts: Document[];
  selectedPosts: Set<string>;
  onToggle: (id: string) => void;
  iconColor?: "primary" | "action";
  maxHeight?: number;
}

function PostListSection({
  label,
  posts,
  selectedPosts,
  onToggle,
  iconColor = "action",
  maxHeight,
}: PostListSectionProps) {
  if (posts.length === 0) return null;
  return (
    <>
      <Box sx={{ px: 2, py: 1, backgroundColor: "background.default" }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
      </Box>
      <List
        sx={{ pt: 0, ...(maxHeight ? { maxHeight, overflow: "auto" } : {}) }}
      >
        {posts.map((post) => (
          <PostListItem
            key={post.id}
            post={post}
            checked={selectedPosts.has(post.id)}
            onToggle={onToggle}
            iconColor={iconColor}
          />
        ))}
      </List>
    </>
  );
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
  const {
    availablePosts,
    selectedPosts,
    loading,
    submitting,
    error,
    handleTogglePost,
    handleSelectAll,
    handleAddPosts,
    handleClose,
  } = useAvailablePostsSelector(
    open,
    seriesId,
    existingPosts,
    onPostsAdded,
    onClose,
  );

  const allPostCount = existingPosts.length + availablePosts.length;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
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
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {loading
          ? <LoadingState variant="spinner" showMessage={false} height={150} />
          : allPostCount === 0
          ? (
            <Box sx={{ textAlign: "center", py: 6, px: 2 }}>
              <Search sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No posts available
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You haven&apos;t created any posts yet.
              </Typography>
            </Box>
          )
          : (
            <>
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
                <Button
                  size="small"
                  onClick={() => handleSelectAll(allPostCount)}
                >
                  {selectedPosts.size === allPostCount
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </Box>

              <PostListSection
                label="IN SERIES"
                posts={existingPosts}
                selectedPosts={selectedPosts}
                onToggle={handleTogglePost}
                iconColor="primary"
              />
              <PostListSection
                label="AVAILABLE TO ADD"
                posts={availablePosts}
                selectedPosts={selectedPosts}
                onToggle={handleTogglePost}
                maxHeight={300}
              />
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
