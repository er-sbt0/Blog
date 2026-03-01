import React from "react";
import {
  Box,
  IconButton,
  InputBase,
  ListItem,
  ListItemButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { DeleteForever } from "@mui/icons-material";
import { DocumentStatus, User, UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import PostActionMenu from "@/components/DocumentCardNew/PostActionMenu";
import { PendingTimeChange } from "./PostsCompactListView";
import { TimeStepperControls } from "./TimeStepperControls";

const MONTHS = [
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

function formatDate(dateString: string | Date): string {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatFullDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

interface PostCompactListItemProps {
  post: UserDocument;
  user?: User;
  isTimeEditMode: boolean;
  pendingChange?: PendingTimeChange;
  editingName: string | undefined;
  onNameChange: (postId: string, value: string) => void;
  onNameCommit: (
    postId: string,
    documentId: string,
    originalName: string,
  ) => void;
  onNameCancel: (postId: string) => void;
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  onTimeReset?: (postId: string) => void;
  onDelete: (post: UserDocument) => void;
}

const PostCompactListItem: React.FC<PostCompactListItemProps> = ({
  post,
  user,
  isTimeEditMode,
  pendingChange,
  editingName,
  onNameChange,
  onNameCommit,
  onNameCancel,
  onTimeAdjust,
  onTimeReset,
  onDelete,
}) => {
  const router = useRouter();
  const document = post.cloud || post.local;
  const isDone = document?.status === DocumentStatus.DONE;
  const authorName =
    (document && "author" in document && document.author?.name) || "Unknown";
  const originalDate = new Date(document?.createdAt || new Date());
  const displayDate = pendingChange ? pendingChange.newDate : originalDate;
  const hasRowChanges = !!pendingChange;
  const isEditing = editingName !== undefined;

  return (
    <ListItem
      key={post.id}
      disablePadding
      sx={{
        borderRadius: 1.5,
        overflow: "hidden",
        bgcolor: hasRowChanges ? "warning.50" : "transparent",
        "&:hover": { bgcolor: hasRowChanges ? "warning.100" : "action.hover" },
        transition: "background-color 0.2s ease",
      }}
    >
      <ListItemButton
        onClick={() => {
          if (!isTimeEditMode && document?.id) {
            router.push(
              `/view/${document.id}`,
            );
          }
        }}
        sx={{
          py: 1.25,
          px: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
          cursor: isTimeEditMode ? "default" : "pointer",
          "&:hover": { bgcolor: "transparent" },
        }}
      >
        {/* Title and Metadata */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {isTimeEditMode && document?.id
              ? (
                <InputBase
                  value={isEditing ? editingName : (document?.name || "")}
                  onChange={(e) => {
                    e.stopPropagation();
                    onNameChange(post.id, e.target.value);
                  }}
                  onBlur={() =>
                    onNameCommit(post.id, document.id, document?.name || "")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onNameCommit(post.id, document.id, document?.name || "");
                    }
                    if (e.key === "Escape") onNameCancel(post.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  fullWidth
                  sx={{
                    fontWeight: 500,
                    fontSize: "0.9rem",
                    letterSpacing: "-0.01em",
                    color: isDone ? "text.secondary" : "text.primary",
                    borderBottom: "1px solid",
                    borderColor: isEditing ? "primary.main" : "divider",
                    borderRadius: 0,
                    px: 0.5,
                    "& input": { p: 0 },
                  }}
                />
              )
              : (
                <Tooltip title={authorName} placement="top-start" enterDelay={600}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: isDone ? "text.secondary" : "text.primary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                      flex: 1,
                      fontSize: "0.9rem",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {document?.name || "Untitled"}
                  </Typography>
                </Tooltip>
              )}

            {isTimeEditMode && (
              <Tooltip title="Delete post" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(post);
                  }}
                  sx={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    color: "text.disabled",
                    "&:hover": {
                      color: "text.secondary",
                      bgcolor: "action.hover",
                    },
                  }}
                >
                  <DeleteForever sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Metadata — only shown in time-edit mode */}
          {isTimeEditMode && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <span
                  style={{
                    color: hasRowChanges ? "inherit" : undefined,
                    fontWeight: hasRowChanges ? 600 : 400,
                  }}
                >
                  {formatFullDate(displayDate)}
                </span>
                {hasRowChanges && (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.7rem",
                      color: "warning.main",
                      fontWeight: 500,
                    }}
                  >
                    (was {formatFullDate(originalDate)})
                  </Typography>
                )}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Time stepper controls */}
        {isTimeEditMode && onTimeAdjust && onTimeReset && (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
            onClick={(e) => e.stopPropagation()}
          >
            <TimeStepperControls
              onAdjust={(days) => onTimeAdjust(post.id, originalDate, days)}
              onReset={() => onTimeReset(post.id)}
              hasChanges={hasRowChanges}
            />
          </Box>
        )}

        {/* Action menu */}
        {!isTimeEditMode && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: "flex",
              alignItems: "center",
              opacity: 0,
              transition: "opacity 0.2s ease",
              ".MuiListItem-root:hover &": { opacity: 1 },
            }}
          >
            <PostActionMenu userDocument={post} user={user} />
          </Box>
        )}
      </ListItemButton>
    </ListItem>
  );
};

export default PostCompactListItem;
