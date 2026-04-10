"use client";
import React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Add, CollectionsBookmark, NoteAdd } from "@mui/icons-material";
import { Series } from "@/types";
import { formatFullDate as formatDate } from "@/utils/dateFormat";

interface SeriesHeaderProps {
  series: Series;
  canEdit: boolean;
  postCount: number;
  onNewPost: () => void;
  onAddPosts: () => void;
}

const SeriesHeader: React.FC<SeriesHeaderProps> = ({
  series,
  canEdit,
  postCount,
  onNewPost,
  onAddPosts,
}) => (
  <Box sx={{ mb: { xs: 3, md: 4 } }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
      <CollectionsBookmark
        sx={{ fontSize: { xs: 28, md: 36 }, color: "primary.main" }}
      />
      <Typography
        variant="h4"
        component="h1"
        sx={{
          fontWeight: 700,
          fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2.125rem" },
          color: "text.primary",
        }}
      >
        {series.title}
      </Typography>
    </Box>

    {canEdit && (
      <Box sx={{ mb: 2, display: "flex", gap: 1.5 }}>
        <Button
          variant="contained"
          startIcon={<NoteAdd />}
          onClick={onNewPost}
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 600,
            height: "40px",
          }}
        >
          New Post
        </Button>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={onAddPosts}
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 600,
            height: "40px",
          }}
        >
          Add/Remove Posts
        </Button>
      </Box>
    )}

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
