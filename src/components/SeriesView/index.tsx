"use client";
import * as React from "react";
import { useState } from "react";
import { DocumentType, Post, Series, User } from "@/types";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Add, CollectionsBookmark } from "@mui/icons-material";
import Grid from "@mui/material/Grid2";
import DocumentCard from "../DocumentCardNew";
import AddPostsDialog from "./AddPostsDialog";
import { useRouter } from "next/navigation";

interface SeriesViewProps {
  series: Series;
  user?: User;
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
 * Series detail view component
 * Shows series information and contained posts with management capabilities
 */
const SeriesView: React.FC<SeriesViewProps> = ({
  series,
  user,
}) => {
  const router = useRouter();
  const canEdit = !!user && user.id === series.authorId;
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const sortedPosts = [...(series.posts || [])].sort((a, b) =>
    (a.seriesOrder || 0) - (b.seriesOrder || 0)
  );

  const handlePostsAdded = () => {
    router.refresh();
  };

  return (
    <Box
      component="main"
      sx={{
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3, lg: 4 },
        minHeight: "50vh",
        maxWidth: "100%",
        width: "100%",
      }}
    >
      {/* Series Header */}
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 2,
          }}
        >
          <CollectionsBookmark
            sx={{
              fontSize: { xs: 28, md: 36 },
              color: "primary.main",
            }}
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
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => setAddDialogOpen(true)}
              sx={{
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 600,
                height: "40px",
              }}
            >
              Edit Posts
            </Button>
          </Box>
        )}

        {/* Meta info */}
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
            label={`${sortedPosts.length} post${
              sortedPosts.length !== 1 ? "s" : ""
            }`}
            size="small"
            color="primary"
            sx={{ fontWeight: 600, fontSize: "0.75rem" }}
          />
        </Box>

        {series.description && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 800,
              lineHeight: 1.6,
            }}
          >
            {series.description}
          </Typography>
        )}
      </Box>

      {/* Posts Grid */}
      {sortedPosts.length > 0
        ? (
          <Grid
            container
            spacing={3}
            sx={{ mb: 4 }}
          >
            {sortedPosts.map((post, index) => {
              const userDocument = {
                id: post.id,
                cloud: {
                  ...post,
                  name: post.name,
                  head: post.id,
                  type: "DOCUMENT" as DocumentType,
                  coauthors: [],
                  revisions: [],
                  children: undefined,
                },
              };

              return (
                <Grid
                  key={post.id}
                  size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
                  sx={{
                    animation: `fadeInUp 0.6s ease ${index * 0.1}s both`,
                  }}
                >
                  <DocumentCard userDocument={userDocument} user={user} />
                </Grid>
              );
            })}
          </Grid>
        )
        : (
          <Box
            sx={{
              textAlign: "center",
              py: { xs: 6, md: 10 },
              px: { xs: 2, md: 4 },
              color: "text.secondary",
            }}
          >
            <Box
              sx={{
                mb: 3,
                fontSize: { xs: 40, md: 56 },
                filter: "grayscale(0.3)",
              }}
            >
              📚
            </Box>
            <Box
              sx={{
                fontSize: { xs: "1.125rem", md: "1.375rem" },
                mb: 1,
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              No posts in this series yet
            </Box>
            <Box
              sx={{
                fontSize: { xs: "0.875rem", md: "1rem" },
                color: "text.secondary",
                maxWidth: 400,
                mx: "auto",
              }}
            >
              {canEdit
                ? "Add your existing posts to organize them in this series"
                : "This series doesn't have any posts yet"}
            </Box>
          </Box>
        )}

      {/* Add Posts Dialog */}
      <AddPostsDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        seriesId={series.id}
        existingPosts={sortedPosts}
        onPostsAdded={handlePostsAdded}
      />
    </Box>
  );
};

export default SeriesView;
