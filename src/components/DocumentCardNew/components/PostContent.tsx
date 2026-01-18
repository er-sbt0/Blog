import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { UserDocument } from "@/types";

/**
 * Props for PostContent component
 */
interface PostContentProps {
  userDocument?: UserDocument;
}

/**
 * Simple date formatter
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
 * Blog-style PostContent component
 * Follows standard blog UI conventions with title, meta info, and excerpt
 */
export const PostContent: React.FC<PostContentProps> = ({
  userDocument,
}) => {
  const document = userDocument?.cloud || userDocument?.local;
  const title = document?.name || "Untitled Post";
  const createdAt = document?.createdAt;
  const author = userDocument?.cloud?.author;

  // Format the date
  const formattedDate = createdAt ? formatDate(createdAt) : "";

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        display: "flex",
        flexDirection: "column",
        height: 200, // Fixed height instead of minHeight
        overflow: "hidden", // Prevent overflow
      }}
    >
      {/* Blog post title */}
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
          flexShrink: 0, // Don't shrink the title
          "&:hover": {
            color: "primary.main", // Unified hover blue
          },
        }}
      >
        {title}
      </Typography>

      {/* Meta information */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          mb: 3,
          flexShrink: 0, // Don't shrink the meta info
        }}
      >
        {author && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            by{" "}
            <Box
              component="span"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = "http://localhost:3000/dashboard";
              }}
              sx={{
                color: "text.secondary",
                textDecoration: "none",
                cursor: "pointer",
                "&:hover": {
                  color: "primary.main", // Unified hover blue
                  textDecoration: "underline",
                },
              }}
            >
              {author.name || author.email}
            </Box>
          </Typography>
        )}

        {author && formattedDate && (
          <Box
            sx={{
              width: 4,
              height: 4,
              bgcolor: "text.secondary",
              borderRadius: "50%",
            }}
          />
        )}

        {formattedDate && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {formattedDate}
          </Typography>
        )}

        {
          /* <Chip
          label="Article"
          size="small"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: "0.75rem",
            fontWeight: 500,
            color: "primary.main",
            borderColor: "primary.main",
            opacity: 0.8
          }}
        /> */
        }
      </Box>

      {/* Excerpt/Description */}
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: "1rem",
          flex: 1,
          minHeight: 0,
        }}
      >
        {document?.description}
      </Typography>
    </Box>
  );
};

export default PostContent;
