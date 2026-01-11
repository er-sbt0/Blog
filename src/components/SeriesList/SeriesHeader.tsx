"use client";
import React from "react";
import {
  Box,
  Button,
  Chip,
  Skeleton,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Add, CollectionsBookmark } from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface SeriesHeaderProps {
  totalCount: number;
  loading?: boolean;
}

/**
 * Header component for series list page
 * Displays title, count, and new series button
 */
const SeriesHeader: React.FC<SeriesHeaderProps> = ({
  totalCount,
  loading = false,
}) => {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const handleNewSeries = () => {
    router.push("/series/new");
  };

  return (
    <Box
      sx={{
        mb: { xs: 3, md: 4 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2, md: 3 },
      }}
    >
      {/* Title Row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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
            Series
          </Typography>
          {loading
            ? (
              <Skeleton
                variant="rounded"
                width={60}
                height={28}
                sx={{ borderRadius: 3 }}
              />
            )
            : (
              <Chip
                label={`${totalCount} ${
                  totalCount === 1 ? "series" : "series"
                }`}
                size="small"
                color="primary"
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: "0.75rem", md: "0.8125rem" },
                }}
              />
            )}
        </Box>

        {/* New Series Button - styled like New Post */}
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleNewSeries}
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 600,
            height: "40px",
            px: { xs: 2, md: 3 },
            fontSize: { xs: "0.875rem", md: "1rem" },
          }}
        >
          {isMobile ? "New" : "New Series"}
        </Button>
      </Box>
    </Box>
  );
};

export default SeriesHeader;
