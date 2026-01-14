"use client";
import React, { memo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { CompactVariantProps } from "../types";
import { UserDocument } from "@/types";
import { cardTheme } from "../../DocumentCardNew/theme";

/**
 * Individual document item within an expanded series card
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
      sx={{
        width: "100%",
        flexShrink: 0,
        border: "1px solid",
        borderColor: cardTheme.colors.border,
        borderRadius: "4px",
        p: 1.5,
        bgcolor: "background.paper",
        textDecoration: "none",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
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
  collapsible = true,
  defaultExpanded = false,
  onExpand,
  onCollapse,
  animationIndex = 0,
  sx,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);
  const postCount = posts.length;

  const handleToggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);

    if (newState) {
      onCollapse?.();
    } else {
      onExpand?.();
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
        animation: `fadeInUp 0.6s ease ${animationIndex * 0.1}s both`,
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
                }}
              >
                {series.title}
              </Typography>
            </Box>

            {/* Bottom bar - matches CardBase action bar */}
            <Box
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
              }}
            >
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "12px",
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? "rgba(144, 202, 249, 0.15)"
                      : "rgba(25, 118, 210, 0.1)",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    color: "text.secondary",
                    fontSize: "0.8rem",
                  }}
                >
                  {postCount} post{postCount !== 1 ? "s" : ""}
                </Typography>
              </Box>
            </Box>
          </Box>
        )
        : (
          // Expanded State: Post list + series title in bottom bar
          <>
            {/* Content area with post list */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                p: { xs: 2, sm: 3 },
                height: 200,
                overflow: "hidden",
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
                {posts.map((doc) => <DocItem key={doc.id} document={doc} />)}
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
            </Box>
          </>
        )}
    </Box>
  );
});

CompactVariant.displayName = "CompactVariant";

export default CompactVariant;
