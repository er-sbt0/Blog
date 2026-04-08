"use client";
import React, { memo, useMemo, useState } from "react";
import { useMenuState } from "@/hooks/useMenuState";
import { useRouter } from "next/navigation";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { Article, Delete, Edit, MoreVert } from "@mui/icons-material";
import { CompactVariantProps } from "../types";
import { UserDocument } from "@/types";
import { cardTheme } from "../../DocumentCardNew/theme";
import { useDispatch } from "@/store";
import { deleteSeries } from "@/store/app";

/** * Format date to readable string
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

/** * Individual document item within an expanded series card
 */
interface DocItemProps {
  document: UserDocument;
}

const DocItem: React.FC<DocItemProps> = ({ document }) => {
  // Get document name from local or cloud version
  const doc = document.local || document.cloud;
  const title = doc?.name || "Untitled";
  const docId = document.id;

  return (
    <Box
      component="a"
      href={`/view/${docId}`}
      onClick={(e) => e.stopPropagation()}
      sx={{
        width: "100%",
        flexShrink: 0,
        border: "1px solid",
        borderColor: cardTheme.colors.border,
        borderRadius: "4px",
        p: 1.5,
        bgcolor: "background.paper",
        textDecoration: "none",
        transition:
          "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "primary.light",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        },
      }}
    >
      {/* Post title */}
      <Typography
        variant="body2"
        sx={{
          color: "text.primary",
          fontWeight: 500,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

/**
 * Compact variant of SeriesCard
 *
 * Collapsible card showing:
 * - Collapsed: Series title centered with post count
 * - Expanded: Scrollable list of posts with series title in footer
 *
 * Used in posts timeline (/posts route) to group series posts
 */
const CompactVariant: React.FC<CompactVariantProps> = memo(({
  series,
  posts,
  user,
  showActions = true,
  collapsible = true,
  defaultExpanded = false,
  onExpand,
  onCollapse,
  animationIndex = 0,
  sx,
}) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);
  const { anchorEl, menuOpen, openMenu, closeMenu } = useMenuState();

  // Check if current user is the author
  const isAuthor = !!user && user.id === series.authorId;

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation(); // Prevent card click
    openMenu(event);
  };

  const handleCloseMenu = closeMenu;

  const handleEdit = () => {
    handleCloseMenu();
    router.push(`/series/${series.id}/edit`);
  };

  const handleDelete = async () => {
    handleCloseMenu();
    if (!confirm("Delete this series? Posts will not be deleted.")) return;
    await dispatch(deleteSeries(series.id));
    router.refresh();
  };

  // Sort posts by creation date (newest first)
  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => {
      const dateA = new Date(a.cloud?.createdAt || a.local?.createdAt || 0)
        .getTime();
      const dateB = new Date(b.cloud?.createdAt || b.local?.createdAt || 0)
        .getTime();
      return dateB - dateA; // Newest first
    });
  }, [posts]);

  const postCount = sortedPosts.length;

  const handleToggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);

    if (newState) {
      onCollapse?.();
    } else {
      onExpand?.();
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Check if the click is on a link or inside a link
    const target = e.target as HTMLElement;
    const isLinkClick = target.closest("a");

    // Only navigate if not clicking on a link (post item)
    if (!isLinkClick) {
      router.push(`/series/${series.id}`);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        borderRadius: 2,
        border: "2px solid",
        borderColor: cardTheme.colors.border,
        bgcolor: cardTheme.colors.cardBackground,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        "&:hover": {
          boxShadow: cardTheme.colors.shadow.hover,
          borderColor: "primary.light",
        },
        "&:focus-within": {
          boxShadow: "0 0 0 2px rgba(25, 118, 210, 0.2)",
          borderColor: "primary.main",
        },
        ...sx,
      }}
    >
      {isCollapsed && collapsible
        ? (
          // Collapsed State: Click anywhere to expand
          <Box
            onClick={handleToggle}
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              cursor: "pointer",
            }}
          >
            {/* Top content area - matches PostContent height */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                p: { xs: 2, sm: 3 },
                gap: 1.5,
              }}
            >
              {/* Series title */}
              <Typography
                variant="h5"
                component="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "1.25rem", sm: "1.5rem" },
                  lineHeight: 1.2,
                  color: "text.primary",
                  textAlign: "center",
                  transition: "color 0.2s ease",
                  "&:hover": {
                    color: "primary.main",
                  },
                }}
              >
                {series.title}
              </Typography>

              {/* Creation date and post count */}
              {series.createdAt && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.875rem", fontWeight: 600 }}
                  >
                    {formatDate(series.createdAt)}
                  </Typography>

                  {
                    /* <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.875rem", fontWeight: 400 }}
                  >
                    •
                  </Typography>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <Article
                      sx={{
                        fontSize: "0.9rem",
                        color: "text.secondary",
                      }}
                    />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: "0.875rem",
                        fontWeight: 600,
                      }}
                    >
                      {postCount}
                    </Typography>
                  </Box> */
                  }
                </Box>
              )}
            </Box>

            {/* Bottom bar - matches CardBase action bar */}
            <Box
              sx={{
                px: 2,
                py: 1,
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                borderTop: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.default",
                minHeight: 48,
              }}
            >
              {/* Actions menu */}
              {showActions && isAuthor && (
                <IconButton
                  aria-label="Series Actions"
                  aria-controls={menuOpen ? "series-menu" : undefined}
                  aria-haspopup="true"
                  aria-expanded={menuOpen ? "true" : undefined}
                  size="small"
                  onClick={handleOpenMenu}
                >
                  <MoreVert />
                </IconButton>
              )}
            </Box>
          </Box>
        )
        : (
          // Expanded State: Post list + series title in bottom bar
          <>
            {/* Content area with post list */}
            <Box
              onClick={handleCardClick}
              sx={{
                display: "flex",
                flexDirection: "column",
                p: { xs: 2, sm: 3 },
                height: 200,
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              {/* Scrollable post list */}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  flex: 1,
                  overflowY: "auto",
                  // Custom scrollbar
                  "&::-webkit-scrollbar": {
                    width: 4,
                  },
                  "&::-webkit-scrollbar-thumb": {
                    bgcolor: "divider",
                    borderRadius: 2,
                  },
                }}
              >
                {sortedPosts.map((doc) => (
                  <DocItem key={doc.id} document={doc} />
                ))}
              </Box>
            </Box>

            {/* Bottom bar with series title and collapse action */}
            <Box
              onClick={collapsible ? handleToggle : undefined}
              sx={{
                px: 2,
                py: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.default",
                minHeight: 48,
                cursor: collapsible ? "pointer" : "default",
                transition: "background-color 0.2s ease",
                ...(collapsible && {
                  "&:hover": {
                    bgcolor: (t) =>
                      t.palette.mode === "dark"
                        ? "rgba(144, 202, 249, 0.08)"
                        : "rgba(25, 118, 210, 0.05)",
                  },
                }),
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: "text.primary",
                }}
              >
                {series.title}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {collapsible && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: "primary.main",
                      fontWeight: 500,
                      fontSize: "0.8rem",
                    }}
                  >
                    Collapse
                  </Typography>
                )}

                {/* Actions menu */}
                {showActions && isAuthor && (
                  <IconButton
                    aria-label="Series Actions"
                    aria-controls={menuOpen ? "series-menu" : undefined}
                    aria-haspopup="true"
                    aria-expanded={menuOpen ? "true" : undefined}
                    size="small"
                    onClick={handleOpenMenu}
                  >
                    <MoreVert />
                  </IconButton>
                )}
              </Box>
            </Box>
          </>
        )}

      {/* Actions Menu */}
      <Menu
        id="series-menu"
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleCloseMenu}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <Delete fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
});

CompactVariant.displayName = "CompactVariant";

export default CompactVariant;
