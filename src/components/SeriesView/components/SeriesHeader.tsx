"use client";
import React from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { Add, CollectionsBookmark, PostAdd } from "@mui/icons-material";
import { Series } from "@/types";
import { formatFullDate as formatDate } from "@/utils/dateFormat";

interface SeriesHeaderProps {
  series: Series;
  canEdit: boolean;
  postCount: number;
  onAddPosts: () => void;
  onNewPost?: () => void;
}

const SeriesHeader: React.FC<SeriesHeaderProps> = ({
  series,
  canEdit,
  postCount,
  onAddPosts,
  onNewPost,
}) => (
  <Box sx={{ mb: { xs: 3, md: 4 } }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
      <CollectionsBookmark
        sx={{
          fontSize: { xs: 24, md: 28 },
          color: "primary.main",
          flexShrink: 0,
        }}
      />
      <Typography
        variant="h4"
        component="h1"
        sx={{
          fontWeight: 700,
          fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2.125rem" },
          color: "text.primary",
          flex: 1,
        }}
      >
        {series.title}
      </Typography>
      {canEdit && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          <Tooltip title="New post in series">
            <IconButton
              onClick={onNewPost}
              size="small"
              sx={{ color: "text.secondary" }}
              aria-label="Create new post in series"
            >
              <PostAdd fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add / remove posts">
            <IconButton
              onClick={onAddPosts}
              size="small"
              sx={{ color: "text.secondary" }}
              aria-label="Add or remove posts"
            >
              <Add fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>

    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
        mb: 2,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: "0.875rem" }}
      >
        {formatDate(series.createdAt)}
      </Typography>
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
        sx={{ fontSize: "0.875rem" }}
      >
        by {series.author?.name || "Unknown"}
      </Typography>
      <Box
        sx={{
          width: 4,
          height: 4,
          bgcolor: "text.secondary",
          borderRadius: "50%",
        }}
      />
      <Chip
        label={`${postCount} post${postCount !== 1 ? "s" : ""}`}
        size="small"
        color="primary"
        sx={{ fontWeight: 600, fontSize: "0.75rem" }}
      />
    </Box>

    {series.description && (
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ maxWidth: 800, lineHeight: 1.6 }}
      >
        {series.description}
      </Typography>
    )}
  </Box>
);

export default SeriesHeader;
