"use client";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowForward } from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { Series, User, UserDocument } from "@/types";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";

const Home: React.FC<{
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({ staticDocuments, series = [], user }) => {
  const router = useRouter();

  const recentPosts = staticDocuments.slice(0, 6);
  const recentSeries = series.slice(0, 3);

  return (
    <DragProvider>
      <Container maxWidth="md" sx={{ py: 6 }}>
        {/* Recent Posts */}
        {recentPosts.length > 0 && (
          <Box sx={{ mb: 6 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography
                variant="h6"
                component="h2"
                sx={{ fontWeight: 600, color: "text.primary" }}
              >
                Recent Posts
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
                onClick={() => router.push("/posts")}
                sx={{ textTransform: "none", color: "text.secondary" }}
              >
                All posts
              </Button>
            </Box>

            <Stack spacing={1}>
              {recentPosts.map((doc) => {
                const post = doc.cloud || doc.local;
                if (!post) return null;

                return (
                  <Card
                    key={doc.id}
                    variant="outlined"
                    sx={{
                      border: "none",
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      borderRadius: 0,
                      "&:last-child": { borderBottom: "none" },
                    }}
                  >
                    <CardActionArea
                      onClick={() => router.push(`/doc/${doc.id}`)}
                      sx={{ py: 2, px: 0 }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 2,
                        }}
                      >
                        <Typography
                          variant="body1"
                          sx={{
                            fontWeight: 500,
                            color: "text.primary",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {post.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            flexShrink: 0,
                          }}
                        >
                          {new Date(post.updatedAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </Typography>
                      </Box>
                      {post.description && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: "text.secondary",
                            mt: 0.5,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {post.description}
                        </Typography>
                      )}
                    </CardActionArea>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        )}

        {/* Series */}
        {recentSeries.length > 0 && (
          <Box sx={{ mb: 6 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
              }}
            >
              <Typography
                variant="h6"
                component="h2"
                sx={{ fontWeight: 600, color: "text.primary" }}
              >
                Series
              </Typography>
              <Button
                size="small"
                endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
                onClick={() => router.push("/series")}
                sx={{ textTransform: "none", color: "text.secondary" }}
              >
                All series
              </Button>
            </Box>

            <Stack spacing={1}>
              {recentSeries.map((s) => (
                <Card
                  key={s.id}
                  variant="outlined"
                  sx={{
                    border: "none",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    borderRadius: 0,
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <CardActionArea
                    onClick={() => router.push(`/series/${s.id}`)}
                    sx={{ py: 2, px: 0 }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 2,
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{
                          fontWeight: 500,
                          color: "text.primary",
                        }}
                      >
                        {s.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          flexShrink: 0,
                        }}
                      >
                        {s.posts?.length || 0} posts
                      </Typography>
                    </Box>
                    {s.description && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          mt: 0.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.description}
                      </Typography>
                    )}
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          </Box>
        )}

        {/* Empty State */}
        {staticDocuments.length === 0 && series.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="body1" color="text.secondary">
              No posts yet
            </Typography>
          </Box>
        )}

        <TrashBin />
      </Container>
    </DragProvider>
  );
};

export default Home;
