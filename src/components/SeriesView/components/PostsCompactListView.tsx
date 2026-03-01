import React, { useCallback, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  Typography,
} from "@mui/material";
import { ChevronRight } from "@mui/icons-material";
import { User, UserDocument } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import PostCompactListItem from "./PostCompactListItem";
import { SeriesGroupItem } from "@/components/PostsList/utils/seriesGrouping";

export interface PendingTimeChange {
  originalDate: Date;
  newDate: Date;
}

interface PostsCompactListViewProps {
  posts?: UserDocument[];
  groups?: SeriesGroupItem[];
  user?: User;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Compact list view for posts.
 * When `groups` is provided, renders series as collapsible header rows with
 * indented doc rows beneath them. Falls back to a flat list when only `posts`
 * is supplied (used by PostsTimeSection).
 */
export const PostsCompactListView: React.FC<PostsCompactListViewProps> = ({
  posts = [],
  groups,
  user,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [editingNames, setEditingNames] = useState<Map<string, string>>(
    new Map(),
  );

  // Shared expand state with the grid view (same localStorage key)
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => {
    const saved = typeof window !== "undefined"
      ? localStorage.getItem("seriesExpandedState")
      : null;
    if (saved) {
      try {
        return new Set<string>(JSON.parse(saved));
      } catch {
        // ignore parse errors
      }
    }
    return new Set<string>();
  });

  const toggleSeries = useCallback((seriesId: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("seriesExpandedState", JSON.stringify([...next]));
      }
      return next;
    });
  }, []);

  const handleRenameCommit = async (
    postId: string,
    documentId: string,
    originalName: string,
  ) => {
    const newName = editingNames.get(postId)?.trim();
    setEditingNames((prev) => {
      const m = new Map(prev);
      m.delete(postId);
      return m;
    });
    if (!newName || newName === originalName) return;
    await dispatch(
      actions.updateCloudDocument({
        id: documentId,
        partial: { name: newName },
      }),
    );
    router.refresh();
  };

  const handleDelete = async (post: UserDocument) => {
    const name = post.cloud?.name || post.local?.name || "This post";
    const alertPayload = {
      title: "Delete Post",
      content:
        `Are you sure you want to delete "${name}"? This cannot be undone.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alertPayload));
    if (response.payload === alertPayload.actions[1].id) {
      if (post.cloud) await dispatch(actions.deleteCloudDocument(post.id));
      if (post.local) await dispatch(actions.deleteLocalDocument(post.id));
      router.refresh();
    }
  };

  const listSx = {
    width: "100%",
    bgcolor: "transparent",
    p: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 0.5,
  };

  const renderPostItem = (post: UserDocument) => (
    <PostCompactListItem
      key={post.id}
      post={post}
      user={user}
      isTimeEditMode={isTimeEditMode}
      pendingChange={pendingChanges.get(post.id)}
      editingName={editingNames.get(post.id)}
      onNameChange={(postId, value) =>
        setEditingNames((prev) => new Map(prev).set(postId, value))}
      onNameCommit={handleRenameCommit}
      onNameCancel={(postId) => {
        setEditingNames((prev) => {
          const m = new Map(prev);
          m.delete(postId);
          return m;
        });
      }}
      onTimeAdjust={onTimeAdjust}
      onTimeReset={onTimeReset}
      onDelete={handleDelete}
    />
  );

  // Group-aware rendering (used by PostsGrid compact mode)
  if (groups !== undefined) {
    if (groups.length === 0) return null;
    return (
      <Box sx={{ width: "100%" }}>
        <List sx={listSx}>
          {groups.map((group) => {
            if (group.type === "series" && group.series) {
              const isExpanded = expandedSeries.has(group.series.id);
              const postCount = group.posts.length;

              if (postCount === 0) {
                return (
                  <Box
                    key={`series-${group.series.id}`}
                    sx={{
                      py: 1.25,
                      px: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      borderRadius: 1.5,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        letterSpacing: "-0.01em",
                        color: "text.disabled",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {group.series.title}
                    </Typography>
                  </Box>
                );
              }

              return (
                <React.Fragment key={`series-${group.series.id}`}>
                  <ListItem
                    disablePadding
                    sx={{
                      borderRadius: 1.5,
                      overflow: "hidden",
                      position: "relative",
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: isExpanded ? "100%" : 0,
                        bgcolor: "primary.main",
                        borderRadius: "0 2px 2px 0",
                        transition: "height 0.2s ease",
                      },
                      "&:hover::before": { height: "60%" },
                      "&:hover": { bgcolor: "action.hover" },
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    <ListItemButton
                      onClick={() => toggleSeries(group.series!.id)}
                      sx={{
                        py: 1.25,
                        px: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        borderRadius: 1.5,
                        "&:hover": { bgcolor: "transparent" },
                      }}
                    >
                      <ChevronRight
                        sx={{
                          fontSize: 18,
                          color: "text.secondary",
                          flexShrink: 0,
                          transition: "transform 0.2s ease",
                          transform: isExpanded ? "rotate(90deg)" : "none",
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          letterSpacing: "-0.01em",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        }}
                      >
                        {group.series.title}
                      </Typography>
                      <Chip
                        label={postCount}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: "0.7rem",
                          flexShrink: 0,
                          bgcolor: "action.selected",
                        }}
                      />
                    </ListItemButton>
                  </ListItem>

                  <Collapse in={isExpanded} unmountOnExit>
                    <Box
                      sx={{
                        pl: 1,
                        ml: 2.5,
                        borderLeft: "2px solid",
                        borderColor: "divider",
                        mb: 0.5,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                      }}
                    >
                      {group.posts.map(renderPostItem)}
                    </Box>
                  </Collapse>
                </React.Fragment>
              );
            } else {
              const post = group.posts[0];
              if (!post) return null;
              // Match the indentation of series member posts (ml:2.5 + pl:1 = 28px)
              return (
                <Box key={post.id} sx={{ pl: 3.5 }}>
                  {renderPostItem(post)}
                </Box>
              );
            }
          })}
        </List>
      </Box>
    );
  }

  // Flat list fallback (used by PostsTimeSection)
  if (posts.length === 0) return null;

  return (
    <Box sx={{ width: "100%" }}>
      <List sx={listSx}>
        {posts.map(renderPostItem)}
      </List>
    </Box>
  );
};
