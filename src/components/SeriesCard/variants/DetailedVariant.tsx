"use client";
import * as React from "react";
import { memo, useMemo, useState } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Typography,
} from "@mui/material";
import { Article, Delete, Edit, MoreVert } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import CardBase from "../../DocumentCardNew/CardBase";
import { DetailedVariantProps } from "../types";

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
 * Detailed variant of SeriesCard
 *
 * Rich display showing:
 * - Series title
 * - Created date and author
 * - Description (or fallback to post count)
 * - Post count chip
 * - Actions menu (Edit/Delete for authors)
 *
 * Used in series catalog (/series route)
 */
const DetailedVariant: React.FC<DetailedVariantProps> = memo(({
  series,
  user,
  sx,
  showMetadata = true,
  showActions = true,
}) => {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Navigation and metadata
  const href = series ? `/series/${series.id}` : "/";
  const isAuthor = series?.authorId === user?.id;
  const isLoading = !series;

  // Format date
  const formattedDate = series?.createdAt ? formatDate(series.createdAt) : "";

  // Sort posts by creation date (newest first) instead of seriesOrder
  const sortedPosts = useMemo(() => {
    if (!series?.posts) return [];
    return [...series.posts].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // Newest first
    });
  }, [series?.posts]);

  const postCount = sortedPosts.length;

  // Menu handlers
  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleCloseMenu();
    if (series) {
      router.push(`/series/${series.id}/edit`);
    }
  };

  const handleDelete = async () => {
    handleCloseMenu();
    if (!series) return;
    if (!confirm("Delete this series? Posts will not be deleted.")) return;

    try {
      const response = await fetch(`/api/series/${series.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.refresh();
      } else {
        const { error } = await response.json();
        alert(error?.title || "Failed to delete series");
      }
    } catch (err) {
      alert("Failed to delete series");
    }
  };

  // Memoize top content - blog-style with title and meta
  const topContent = useMemo(
    () => (
      <Box
        sx={{
          p: { xs: 2, sm: 3 },
          display: "flex",
          flexDirection: "column",
          height: 200,
          overflow: "hidden",
        }}
      >
        {/* Series title */}
        <Typography
          variant="h5"
          component="h2"
          sx={{
            fontWeight: 700,
            lineHeight: 1.2,
            color: "text.primary",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: { xs: "1.25rem", sm: "1.5rem" },
            mb: showMetadata ? 1 : 0,
            flexShrink: 0,
            "&:hover": {
              color: "primary.main",
            },
          }}
        >
          {series?.title || <Skeleton variant="text" width="80%" />}
        </Typography>

        {/* Meta information - creation date */}
        {showMetadata && formattedDate && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              mb: 1.5,
              flexShrink: 0,
            }}
          >
            {
              /* <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: "0.75rem",
                fontWeight: 400,
                letterSpacing: "0.01em",
              }}
            >
              Created
            </Typography> */
            }
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.875rem", fontWeight: 600 }}
            >
              {formattedDate}
            </Typography>
          </Box>
        )}

        {/* Description */}
        {showMetadata && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.6,
              flex: 1,
            }}
          >
            {series?.description}
          </Typography>
        )}
      </Box>
    ),
    [series, formattedDate, postCount, showMetadata],
  );

  // Memoize chip content - post count with icon
  const chipContent = useMemo(() => {
    if (isLoading) {
      return (
        <Skeleton
          variant="rectangular"
          width={80}
          height={28}
          sx={{ borderRadius: 1.5 }}
        />
      );
    }

    return (
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          borderRadius: "16px",
          bgcolor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.15)"
              : "rgba(25, 118, 210, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Article
          sx={{
            fontSize: "1rem",
            color: "primary.main",
            opacity: 0.8,
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: "primary.main",
            fontSize: "0.875rem",
          }}
        >
          {postCount}
        </Typography>
      </Box>
    );
  }, [isLoading, postCount]);

  // Action content with menu
  const actionContent = showActions && isAuthor
    ? (
      <>
        <IconButton
          aria-label="Series Actions"
          aria-controls={menuOpen ? "series-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={menuOpen ? "true" : undefined}
          size="small"
          disabled={isLoading}
          onClick={handleOpenMenu}
          sx={{
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          <MoreVert />
        </IconButton>
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
          onClick={(e) => e.stopPropagation()}
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
      </>
    )
    : undefined;

  // Memoize aria label for better accessibility
  const ariaLabel = useMemo(() => {
    return series ? `Open ${series.title} series` : "Loading series";
  }, [series]);

  return (
    <CardBase
      href={href}
      isLoading={isLoading}
      topContent={topContent}
      chipContent={chipContent}
      actionContent={actionContent}
      ariaLabel={ariaLabel}
      sx={sx}
    />
  );
});

DetailedVariant.displayName = "DetailedVariant";

export default DetailedVariant;
