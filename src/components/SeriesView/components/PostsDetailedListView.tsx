import React from "react";
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Stack,
  Divider,
} from "@mui/material";
import {
  Person,
  CalendarToday,
} from "@mui/icons-material";
import { UserDocument, User, DocumentStatus } from "@/types";
import { useRouter } from "next/navigation";

interface PostsDetailedListViewProps {
  posts: UserDocument[];
  user?: User;
}

/**
 * Format date to readable string
 */
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

/**
 * Detailed list view component for posts
 * Shows posts with expanded information including descriptions
 */
export const PostsDetailedListView: React.FC<PostsDetailedListViewProps> = ({
  posts,
  user,
}) => {
  const router = useRouter();

  if (posts.length === 0) {
    return null;
  }

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      {posts.map((post) => {
        const document = post.cloud || post.local;
        const isDone = document?.status === DocumentStatus.DONE;
        const isOwner = user && document && 'author' in document && user.id === document.author?.id;

        return (
          <Card
            key={post.id}
            sx={{
              width: "100%",
              borderRadius: 2,
              bgcolor: isDone ? "action.disabledBackground" : "background.paper",
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                boxShadow: 3,
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => {
                if (document?.handle) {
                  router.push(`/${document.handle}`);
                }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                {/* Header with Title and Status */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    mb: 2,
                    gap: 2,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h6"
                      component="h3"
                      sx={{
                        fontWeight: 600,
                        mb: 0.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {document?.name || "Untitled"}
                    </Typography>

                    {/* Handle/Slug */}
                    {document?.handle && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontFamily: "monospace",
                          display: "block",
                          mb: 1,
                        }}
                      >
                        /{document.handle}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Description/Excerpt */}
                {document?.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      lineHeight: 1.6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {document.description}
                  </Typography>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Metadata Footer */}
                <Stack
                  direction="row"
                  spacing={3}
                  sx={{
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {/* Author */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Person sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography variant="body2" color="text.secondary">
                      {(document && 'author' in document && document.author?.name) || "Unknown Author"}
                    </Typography>
                  </Box>

                  {/* Date */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <CalendarToday
                      sx={{ fontSize: 16, color: "text.secondary" }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(document?.createdAt || new Date())}
                    </Typography>
                  </Box>

                  {/* Document Type */}
                  {document?.type && (
                    <Chip
                      label={document.type}
                      size="small"
                      variant="outlined"
                      sx={{ height: 24 }}
                    />
                  )}
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        );
      })}
    </Stack>
  );
};
