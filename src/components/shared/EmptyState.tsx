import React from "react";
import { Box } from "@mui/material";

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description?: string;
}

/**
 * Shared empty-state widget used across PostsView and SeriesView.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  emoji = "📝",
  title,
  description,
}) => (
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
      {emoji}
    </Box>
    <Box
      sx={{
        fontSize: { xs: "1.125rem", md: "1.375rem" },
        mb: 1,
        fontWeight: 600,
        color: "text.primary",
      }}
    >
      {title}
    </Box>
    {description && (
      <Box
        sx={{
          fontSize: { xs: "0.875rem", md: "1rem" },
          color: "text.secondary",
          maxWidth: 400,
          mx: "auto",
          lineHeight: 1.6,
        }}
      >
        {description}
      </Box>
    )}
  </Box>
);
