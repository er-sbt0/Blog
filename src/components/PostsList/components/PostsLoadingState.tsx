"use client";
import React from "react";
import { Box, Skeleton, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Grid from "@mui/material/Grid2";
import SkeletonCard from "@/components/DocumentCardNew/components/LoadingCard";

/**
 * Loading state component for posts list.
 * Shows skeleton UI organised in month-like sections, using `LoadingCard`
 * for each card slot — consistent with the rest of the card loading system.
 */
const PostsLoadingState: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: { xs: 4, md: 6 },
      }}
    >
      {/* Multiple month sections with skeleton content */}
      {Array.from({ length: isMobile ? 2 : 3 }).map((_, monthIndex) => (
        <Box
          key={`loading-month-${monthIndex}`}
          sx={{
            mb: { xs: 4, md: 6 },
            p: { xs: 2, sm: 3 },
            borderRadius: 2,
            backgroundColor: "background.paper",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {/* Month header skeleton */}
          <Box
            sx={{
              mb: { xs: 2, md: 3 },
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Skeleton variant="circular" width={28} height={28} />
            <Skeleton
              variant="text"
              width={isMobile ? 200 : 280}
              height={isMobile ? 32 : 40}
              sx={{ fontSize: { xs: "1.5rem", md: "1.75rem" } }}
            />
            <Skeleton
              variant="rounded"
              width={80}
              height={24}
              sx={{ borderRadius: 3 }}
            />
          </Box>

          {/* Posts grid skeleton — each card uses the shared LoadingCard */}
          <Grid container spacing={3}>
            {Array.from({
              length: monthIndex === 0
                ? (isMobile ? 3 : 6)
                : (isMobile ? 2 : 4),
            }).map((_, cardIndex) => (
              <Grid
                key={`loading-card-${monthIndex}-${cardIndex}`}
                size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
              >
                <SkeletonCard />
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
};

export default PostsLoadingState;
