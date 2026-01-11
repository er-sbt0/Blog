"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import { Series, UserDocument } from "@/types";

interface SeriesGroupCardProps {
  series: Series;
  posts: UserDocument[];
  isCollapsed: boolean;
  onToggle: () => void;
  animationIndex: number;
  isMobile?: boolean;
}

/**
 * Card component for displaying a series with collapsible post list
 * Collapsed: Shows centered title + count with toggle icon
 * Expanded: Shows horizontal scrollable list of bordered doc items
 */
const SeriesGroupCard: React.FC<SeriesGroupCardProps> = ({
  series,
  posts,
  isCollapsed,
  onToggle,
  animationIndex,
}) => {
  const postCount = posts.length;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        borderRadius: "6px",
        border: "2px solid",
        borderColor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(144, 202, 249, 0.2)"
            : "rgba(25, 118, 210, 0.15)",
        bgcolor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(144, 202, 249, 0.03)"
            : "rgba(25, 118, 210, 0.02)",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: `fadeInUp 0.6s ease ${animationIndex * 0.1}s both`,
        "&:hover": {
          bgcolor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.08)"
              : "rgba(25, 118, 210, 0.05)",
          borderColor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.35)"
              : "rgba(25, 118, 210, 0.25)",
        },
      }}
    >
      {isCollapsed
        ? (
          // Collapsed State: Click anywhere to expand
          <Box
            onClick={onToggle}
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
              onClick={onToggle}
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
                cursor: "pointer",
                transition: "background-color 0.2s ease",
                "&:hover": {
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? "rgba(144, 202, 249, 0.08)"
                      : "rgba(25, 118, 210, 0.05)",
                },
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
            </Box>
          </>
        )}
    </Box>
  );
};

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
        borderColor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(144, 202, 249, 0.15)"
            : "rgba(25, 118, 210, 0.12)",
        borderRadius: "4px",
        p: 1.5,
        bgcolor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(0, 0, 0, 0.2)"
            : "rgba(255, 255, 255, 0.5)",
        textDecoration: "none",
        transition: "all 0.2s ease",
        "&:hover": {
          bgcolor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.1)"
              : "rgba(25, 118, 210, 0.08)",
          borderColor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.4)"
              : "rgba(25, 118, 210, 0.3)",
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

export default SeriesGroupCard;
