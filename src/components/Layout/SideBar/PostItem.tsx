import React, { memo } from "react";
import {
  Box,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
} from "@mui/material";
import { Article, CloudUpload } from "@mui/icons-material";
import { actions, useDispatch } from "@/store";
import type { UserDocument } from "@/types";
import { SafeNavigationLink } from "./SafeNavigationLink";
import type { PostItemActions } from "./hooks/useSidebarActions";

interface PostItemProps {
  post: UserDocument;
  inSeries: boolean;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const PostItem = memo(
  ({ post, inSeries, sidebarOpen, pathname, itemActions }: PostItemProps) => {
    const dispatch = useDispatch();
    const {
      renamingPostId,
      renameValue,
      setRenameValue,
      renameInputRef,
      handleContextMenu,
      handleDoubleClick,
      handleRenameBlur,
      handleRenameKeyDown,
    } = itemActions;

    const doc = post.cloud || post.local;
    const docName = doc?.name || "Untitled";
    const isViewing = pathname === `/view/${post.id}`;
    const isEditing = pathname === `/edit/${post.id}`;
    const isSelected = isViewing || isEditing;
    const isRenaming = renamingPostId === post.id;
    const isDirty = Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head;

    const handleSyncToCloud = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch(
        actions.updateCloudDocument({
          id: post.id,
          partial: {
            head: post.local!.head,
            updatedAt: post.local!.updatedAt,
            parentId: post.local!.parentId,
          },
        }),
      );
    };

    const linkProps = isRenaming
      ? {}
      : { component: SafeNavigationLink, href: `/view/${post.id}` };

    return (
      <ListItem
        disablePadding
        sx={{
          display: "block",
          "& .sync-btn": { opacity: 0, transition: "opacity 0.15s" },
          "&:hover .sync-btn": { opacity: 1 },
        }}
      >
        <Tooltip title={sidebarOpen ? "" : docName} placement="right">
          <ListItemButton
            {...linkProps}
            selected={isSelected}
            onContextMenu={(e) => handleContextMenu(e, post.id)}
            onDoubleClick={(e) => {
              if (sidebarOpen) handleDoubleClick(e, post.id, docName);
            }}
            sx={{
              minHeight: inSeries ? 30 : 32,
              justifyContent: sidebarOpen ? "initial" : "center",
              ...(inSeries
                ? { pl: 2, pr: 2.5 }
                : { px: sidebarOpen ? 3 : 2.5 }),
              py: inSeries ? 0.25 : 0.5,
              "&.Mui-selected": {
                bgcolor: "action.selected",
                "&:hover": {
                  bgcolor: inSeries
                    ? "rgba(0, 0, 0, 0.12)"
                    : "rgba(0, 0, 0, 0.15)",
                },
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 1.5 : "auto",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Article sx={{ fontSize: "0.85em", color: "text.secondary" }} />
              {post.local && post.cloud &&
                post.local.head !== post.cloud.head && (
                <Box
                  component="span"
                  sx={{
                    position: "absolute",
                    top: -1,
                    right: -3,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                  }}
                />
              )}
            </ListItemIcon>
            {sidebarOpen &&
              (isRenaming
                ? (
                  <TextField
                    inputRef={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameBlur}
                    onKeyDown={handleRenameKeyDown}
                    size="small"
                    variant="standard"
                    fullWidth
                    sx={{
                      "& .MuiInput-input": {
                        fontSize: "0.78em",
                        fontWeight: isSelected ? 600 : 400,
                        py: 0,
                      },
                    }}
                  />
                )
                : (
                  <ListItemText
                    primary={docName}
                    primaryTypographyProps={{
                      fontSize: "0.78em",
                      sx: {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isSelected ? 600 : 400,
                      },
                    }}
                  />
                ))}
            {sidebarOpen && isDirty && (
              <Tooltip title="Save to cloud" placement="right">
                <IconButton
                  className="sync-btn"
                  size="small"
                  onClick={handleSyncToCloud}
                  sx={{
                    p: 0.25,
                    ml: 0.5,
                    color: "primary.main",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <CloudUpload sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>
    );
  },
);

PostItem.displayName = "PostItem";
