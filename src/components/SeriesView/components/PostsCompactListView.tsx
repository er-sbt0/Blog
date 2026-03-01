import React, { useState } from "react";
import { Box, List } from "@mui/material";
import { User, UserDocument } from "@/types";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import PostCompactListItem from "./PostCompactListItem";

export interface PendingTimeChange {
  originalDate: Date;
  newDate: Date;
}

interface PostsCompactListViewProps {
  posts: UserDocument[];
  user?: User;
  isTimeEditMode?: boolean;
  pendingChanges?: Map<string, PendingTimeChange>;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
}

/**
 * Compact list view for posts.
 * Renders each post as a PostCompactListItem; delegates per-row controls
 * and time-stepping to sub-components.
 */
export const PostsCompactListView: React.FC<PostsCompactListViewProps> = ({
  posts,
  user,
  isTimeEditMode = false,
  pendingChanges = new Map(),
  onTimeAdjust,
  onTimeReset,
}) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [editingNames, setEditingNames] = useState<Map<string, string>>(new Map());

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
    await dispatch(actions.updateCloudDocument({ id: documentId, partial: { name: newName } }));
    router.refresh();
  };

  const handleDelete = async (post: UserDocument) => {
    const name = post.cloud?.name || post.local?.name || "This post";
    const alertPayload = {
      title: "Delete Post",
      content: `Are you sure you want to delete "${name}"? This cannot be undone.`,
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

  if (posts.length === 0) return null;

  return (
    <Box sx={{ width: "100%" }}>
      <List
        sx={{
          width: "100%",
          bgcolor: "transparent",
          p: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        {posts.map((post) => (
          <PostCompactListItem
            key={post.id}
            post={post}
            user={user}
            isTimeEditMode={isTimeEditMode}
            pendingChange={pendingChanges.get(post.id)}
            editingName={editingNames.get(post.id)}
            onNameChange={(postId, value) =>
              setEditingNames((prev) => new Map(prev).set(postId, value))
            }
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
        ))}
      </List>
    </Box>
  );
};
