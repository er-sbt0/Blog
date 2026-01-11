"use client";
import React from "react";
import { Box, Card, IconButton, Typography } from "@mui/material";
import { ChevronRight } from "@mui/icons-material";
import { Series, UserDocument } from "@/types";
import Link from "next/link";

interface SeriesGroupCardProps {
  series: Series;
  posts: UserDocument[];
  isCollapsed: boolean;
  onToggle: () => void;
  animationIndex: number;
}

/**
 * A card component for displaying a series of documents.
 * - Collapsed: Shows series title and post count centered
 * - Expanded: Shows horizontal scrollable list of bordered doc items
 */
const SeriesGroupCard: React.FC<SeriesGroupCardProps> = ({
  series,
  posts,
  isCollapsed,
  onToggle,
  animationIndex,
}) => {
  const postCount = posts.length;
  const hasMultiplePosts = postCount > 1;

  // Fixed width for doc items in expanded view
  const docItemWidth = 200;
  // Max width when expanded (prevents overly wide containers)
  const maxExpandedWidth = 1000;
  // Card width when collapsed (matches DocumentCard)
  const collapsedWidth = 300;
  // Card height when collapsed (matches DocumentCard minHeight)
  const cardHeight = 380;

  return (
    <Card
      variant="outlined"
      sx={{
        height: isCollapsed ? cardHeight : cardHeight,
        minHeight: cardHeight,
        width: isCollapsed ? collapsedWidth : "auto",
        maxWidth: isCollapsed ? collapsedWidth : maxExpandedWidth,
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        border: "2px solid",
        borderColor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(144, 202, 249, 0.2)"
            : "rgba(25, 118, 210, 0.15)",
        bgcolor: (t) =>
          t.palette.mode === "dark"
            ? "rgba(144, 202, 249, 0.03)"
            : "rgba(25, 118, 210, 0.02)",
        overflow: "hidden",
        transition: "all 0.3s ease",
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
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        },
      }}
    >
      {/* Header with toggle and series title */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: isCollapsed ? "none" : "1px solid",
          borderColor: "divider",
          cursor: hasMultiplePosts ? "pointer" : "default",
        }}
        onClick={hasMultiplePosts ? onToggle : undefined}
      >
        {/* Collapse/Expand toggle */}
        {hasMultiplePosts && (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            sx={{
              p: 0,
              width: 24,
              height: 24,
              transition: "transform 0.2s ease",
              transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
              color: "text.secondary",
              "&:hover": {
                color: "primary.main",
                bgcolor: "transparent",
              },
            }}
          >
            <ChevronRight sx={{ fontSize: "1.2rem" }} />
          </IconButton>
        )}

        {/* Series title link */}
        <Box
          component={Link}
          href={`/series/${series.id}`}
          onClick={(e) => e.stopPropagation()}
          sx={{
            textDecoration: "none",
            color: "text.primary",
            fontWeight: 600,
            fontSize: "1rem",
            transition: "color 0.2s ease",
            "&:hover": {
              color: "primary.main",
            },
          }}
        >
          {series.title}
        </Box>

        {/* Post count badge */}
        <Box
          sx={{
            ml: "auto",
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(144, 202, 249, 0.15)"
                : "rgba(25, 118, 210, 0.1)",
            color: "text.secondary",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          {postCount} {postCount === 1 ? "post" : "posts"}
        </Box>
      </Box>

      {/* Content area */}
      {isCollapsed
        ? (
          /* Collapsed state: Centered title and count */
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              px: 2,
              py: 3,
              cursor: hasMultiplePosts ? "pointer" : "default",
            }}
            onClick={hasMultiplePosts ? onToggle : undefined}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                textAlign: "center",
                mb: 1,
              }}
            >
              {series.title}
            </Typography>
            {series.description && (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  textAlign: "center",
                  mb: 2,
                  maxWidth: "90%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {series.description}
              </Typography>
            )}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "text.secondary",
                fontSize: "0.875rem",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {postCount} {postCount === 1 ? "post" : "posts"}
              </Typography>
              {hasMultiplePosts && (
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", ml: 1 }}
                >
                  Click to expand
                </Typography>
              )}
            </Box>
          </Box>
        )
        : (
          /* Expanded state: Horizontal scrollable list of doc items */
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              px: 2,
              py: 2,
              overflowX: "auto",
              overflowY: "hidden",
              // Custom scrollbar styling
              "&::-webkit-scrollbar": {
                height: 6,
              },
              "&::-webkit-scrollbar-track": {
                bgcolor: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                bgcolor: "divider",
                borderRadius: 3,
              },
            }}
          >
            {posts.map((doc) => (
              <DocItem key={doc.id} document={doc} width={docItemWidth} />
            ))}
          </Box>
        )}
    </Card>
  );
};

/**
 * Individual document item within an expanded series card
 */
interface DocItemProps {
  document: UserDocument;
  width: number;
}

const DocItem: React.FC<DocItemProps> = ({ document, width }) => {
  // Get document name from local or cloud version
  const doc = document.local || document.cloud;
  const title = doc?.name || "Untitled";
  const docId = document.id;

  return (
    <Box
      component={Link}
      href={`/view/${docId}`}
      sx={{
        display: "block",
        minWidth: width,
        maxWidth: width,
        p: 1.5,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        textDecoration: "none",
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.5)"
              : "rgba(25, 118, 210, 0.4)",
          bgcolor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(144, 202, 249, 0.08)"
              : "rgba(25, 118, 210, 0.05)",
          transform: "translateY(-2px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        },
      }}
    >
      <Typography
        sx={{
          fontWeight: 500,
          fontSize: "0.875rem",
          color: "text.primary",
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
