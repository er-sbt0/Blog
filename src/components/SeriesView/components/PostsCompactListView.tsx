import React from "react";
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Remove, Undo } from "@mui/icons-material";
import { DocumentStatus, User, UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import PostActionMenu from "@/components/DocumentCardNew/PostActionMenu";

export interface PendingTimeChange {
  originalDate: Date;
  newDate: Date;
}

interface PostsCompactListViewProps {
  posts: UserDocument[];
  user?: User;
  /** Whether time edit mode is active (controlled from parent) */
  isTimeEditMode?: boolean;
  /** Map of post ID to pending time changes */
  pendingChanges?: Map<string, PendingTimeChange>;
  /** Callback when time is adjusted for a post */
  onTimeAdjust?: (postId: string, originalDate: Date, days: number) => void;
  /** Callback when a row's changes are reset */
  onTimeReset?: (postId: string) => void;
}

/**
 * Format date to short readable string
 */
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

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
 * Format date to full display
 */
const formatFullDate = (date: Date): string => {
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
 * Time adjustment column with label and +/- buttons (vertical: + above -)
 */
const TimeAdjustColumn: React.FC<{
  label: string;
  tooltipMinus: string;
  tooltipPlus: string;
  onMinus: () => void;
  onPlus: () => void;
}> = ({ label, tooltipMinus, tooltipPlus, onMinus, onPlus }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1.0,
    }}
  >
    {/* Label */}
    <Typography
      sx={{
        fontSize: "0.6rem",
        fontWeight: 600,
        color: "text.secondary",
        lineHeight: 1,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </Typography>
    {/* Buttons column: + on top, - on bottom */}
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      <Tooltip title={tooltipPlus} arrow placement="left">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onPlus();
          }}
          sx={{
            width: 22,
            height: 18,
            bgcolor: "action.hover",
            borderRadius: 0.75,
            "&:hover": {
              bgcolor: "success.light",
              color: "success.contrastText",
            },
          }}
        >
          <Add sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={tooltipMinus} arrow placement="left">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onMinus();
          }}
          sx={{
            width: 22,
            height: 18,
            bgcolor: "action.hover",
            borderRadius: 0.75,
            "&:hover": {
              bgcolor: "error.light",
              color: "error.contrastText",
            },
          }}
        >
          <Remove sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  </Box>
);

/**
 * Time stepper controls for a single row
 */
const TimeStepperControls: React.FC<{
  onAdjust: (days: number) => void;
  onReset: () => void;
  hasChanges: boolean;
}> = ({ onAdjust, onReset, hasChanges }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1,
      ml: "auto",
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* Reset button - fixed position, always takes space */}
    <Box sx={{ width: 24, display: "flex", justifyContent: "center" }}>
      {hasChanges && (
        <Tooltip title="Reset to original" arrow>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            sx={{
              width: 24,
              height: 24,
              color: "warning.main",
              "&:hover": {
                bgcolor: "warning.light",
                color: "warning.dark",
              },
            }}
          >
            <Undo sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>

    {/* Day controls */}
    <TimeAdjustColumn
      label="D"
      tooltipMinus="-1 Day"
      tooltipPlus="+1 Day"
      onMinus={() => onAdjust(-1)}
      onPlus={() => onAdjust(1)}
    />

    {/* Week controls */}
    <TimeAdjustColumn
      label="W"
      tooltipMinus="-1 Week"
      tooltipPlus="+1 Week"
      onMinus={() => onAdjust(-7)}
      onPlus={() => onAdjust(7)}
    />

    {/* Month controls */}
    <TimeAdjustColumn
      label="M"
      tooltipMinus="-1 Month"
      tooltipPlus="+1 Month"
      onMinus={() => onAdjust(-30)}
      onPlus={() => onAdjust(30)}
    />
  </Box>
);

/**
 * Compact list view component for posts
 * Modern, minimal design inspired by Linear/Notion
 * With time editing capability
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

  if (posts.length === 0) {
    return null;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Posts List */}
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
        {posts.map((post) => {
          const document = post.cloud || post.local;
          const isDone = document?.status === DocumentStatus.DONE;
          const authorName =
            (document && "author" in document && document.author?.name) ||
            "Unknown";
          const originalDate = new Date(document?.createdAt || new Date());
          const pendingChange = pendingChanges.get(post.id);
          const displayDate = pendingChange
            ? pendingChange.newDate
            : originalDate;
          const hasRowChanges = !!pendingChange;

          return (
            <ListItem
              key={post.id}
              disablePadding
              sx={{
                borderRadius: 1.5,
                overflow: "hidden",
                position: "relative",
                // Left accent bar
                "&::before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: hasRowChanges ? "100%" : isDone ? "100%" : 0,
                  bgcolor: hasRowChanges
                    ? "warning.main"
                    : isDone
                    ? "text.disabled"
                    : "primary.main",
                  borderRadius: "0 2px 2px 0",
                  transition: "height 0.2s ease, background-color 0.2s ease",
                },
                "&:hover::before": {
                  height: "60%",
                },
                // Background
                bgcolor: hasRowChanges ? "warning.50" : "transparent",
                "&:hover": {
                  bgcolor: hasRowChanges ? "warning.100" : "action.hover",
                },
                transition: "background-color 0.2s ease",
              }}
            >
              <ListItemButton
                onClick={() => {
                  if (!isTimeEditMode && document?.id) {
                    router.push(`/view/${document.id}`);
                  }
                }}
                sx={{
                  py: 1.25,
                  px: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  cursor: isTimeEditMode ? "default" : "pointer",
                  "&:hover": {
                    bgcolor: "transparent",
                  },
                }}
              >
                {/* Title and Metadata */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      color: isDone ? "text.secondary" : "text.primary",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      width: "100%",
                      fontSize: "0.9rem",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {document?.name || "Untitled"}
                  </Typography>

                  {/* Metadata line */}
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
                      <span>{authorName}</span>
                      <Box
                        component="span"
                        sx={{
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          bgcolor: "text.disabled",
                          opacity: 0.5,
                        }}
                      />
                      <span
                        style={{
                          color: hasRowChanges ? "inherit" : undefined,
                          fontWeight: hasRowChanges ? 600 : 400,
                        }}
                      >
                        {isTimeEditMode
                          ? formatFullDate(displayDate)
                          : formatDate(displayDate)}
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
                </Box>

                {/* Time Edit Controls */}
                {isTimeEditMode && onTimeAdjust && onTimeReset && (
                  <TimeStepperControls
                    onAdjust={(days) =>
                      onTimeAdjust(post.id, originalDate, days)}
                    onReset={() => onTimeReset(post.id)}
                    hasChanges={hasRowChanges}
                  />
                )}

                {/* Action Menu - Three Dots */}
                {!isTimeEditMode && (
                  <Box
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      opacity: 0,
                      transition: "opacity 0.2s ease",
                      ".MuiListItem-root:hover &": {
                        opacity: 1,
                      },
                    }}
                  >
                    <PostActionMenu userDocument={post} user={user} />
                  </Box>
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};
