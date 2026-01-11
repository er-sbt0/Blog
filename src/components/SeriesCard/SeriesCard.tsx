"use client";
import * as React from "react";
import { memo, useMemo, useState } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Typography,
} from "@mui/material";
import {
  CollectionsBookmark,
  Delete,
  Edit,
  MoreVert,
} from "@mui/icons-material";
import { Series, User } from "@/types";
import CardBase from "../DocumentCardNew/CardBase";
import { cardTheme } from "../DocumentCardNew/theme";
import { useRouter } from "next/navigation";

// Define proper interface for component props
interface SeriesCardProps {
  /** The series data */
  series?: Series;
  /** The current user */
  user?: User;
  /** Additional styles to apply */
  sx?: SxProps<Theme>;
  /** Card configuration */
  cardConfig?: {
    /** Min height of the card */
    minHeight?: string;
    /** Whether to show the author chip */
    showAuthor?: boolean;
    /** Max number of status chips to display */
    maxStatusChips?: number;
    /** Whether to show the sort order chip */
    showSortOrder?: boolean;
    /** Whether to show permission chips (published, collab, private) */
    showPermissionChips?: boolean;
  };
}

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
 * Series card component representing a series in the system
 * Modern design matching PostCard style
 */
const SeriesCard: React.FC<SeriesCardProps> = memo(({
  series,
  user,
  sx,
  cardConfig = {},
}) => {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Apply default configuration with overrides
  const config = useMemo(() => ({
    minHeight: cardConfig.minHeight || cardTheme.minHeight.post,
    showAuthor: cardConfig.showAuthor !== false,
    maxStatusChips: cardConfig.maxStatusChips,
    showSortOrder: cardConfig.showSortOrder !== false,
    showPermissionChips: cardConfig.showPermissionChips !== false,
  }), [cardConfig]);

  // Navigation and metadata
  const href = series ? `/series/${series.id}` : "/";
  const isAuthor = series?.authorId === user?.id;

  // Rendering helpers
  const isLoading = !series;

  // Format date
  const formattedDate = series?.createdAt ? formatDate(series.createdAt) : "";
  const postCount = series?.posts?.length || 0;

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
            mb: 1,
            flexShrink: 0,
            "&:hover": {
              color: "primary.main",
            },
          }}
        >
          {series?.title || <Skeleton variant="text" width="80%" />}
        </Typography>

        {/* Meta information */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            mb: 1,
            flexShrink: 0,
          }}
        >
          {formattedDate && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.875rem", fontWeight: 500 }}
            >
              {formattedDate}
            </Typography>
          )}

          {series?.author && (
            <>
              <Box
                sx={{
                  width: 4,
                  height: 4,
                  bgcolor: "text.secondary",
                  borderRadius: "50%",
                }}
              />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: "0.875rem", fontWeight: 500 }}
              >
                by {series.author.name || series.author.email}
              </Typography>
            </>
          )}
        </Box>

        {/* Description */}
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
          {series?.description ||
            `A collection of ${postCount} post${postCount !== 1 ? "s" : ""}`}
        </Typography>
      </Box>
    ),
    [series, formattedDate, postCount],
  );

  // Memoize chip content - simple post count
  const chipContent = useMemo(() => {
    if (isLoading) {
      return (
        <Skeleton
          variant="rectangular"
          width={70}
          height={24}
          sx={{ borderRadius: 1 }}
        />
      );
    }

    return (
      <Chip
        icon={<CollectionsBookmark sx={{ fontSize: 16 }} />}
        label={`${postCount} post${postCount !== 1 ? "s" : ""}`}
        size="small"
        variant="outlined"
        sx={{
          fontSize: "0.75rem",
          fontWeight: 500,
          height: 24,
          "& .MuiChip-icon": { ml: 0.5 },
        }}
      />
    );
  }, [isLoading, postCount]);

  // Action content with menu
  const actionContent = (
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
        {isAuthor && (
          <MenuItem onClick={handleEdit}>
            <ListItemIcon>
              <Edit fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )}
        {isAuthor && (
          <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
            <ListItemIcon>
              <Delete fontSize="small" sx={{ color: "error.main" }} />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );

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

// Set display name for debugging purposes
SeriesCard.displayName = "SeriesCard";

export default SeriesCard;
