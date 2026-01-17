"use client";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useRouter } from "next/navigation";
import { Series, User, UserDocument } from "@/types";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";
import { useState } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import NotesPreviewCard from "./NotesPreviewCard";
import KanbanPreviewCard from "./KanbanPreviewCard";
import ReadmePreviewCard from "./ReadmePreviewCard";
import RecentPostsPreviewCard from "./RecentPostsPreviewCard";
import FullViewDialog from "./FullViewDialog";
import NotesCanvas from "../NotesCanvas";
import KanbanBoard from "./KanbanBoard";
import ReadmeViewer from "./ReadmeViewer";
import ErrorBoundaryCard from "./ErrorBoundaryCard";

type ViewType = "notes" | "kanban" | "readme" | "posts" | null;

const Home: React.FC<{
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({ staticDocuments }) => {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ViewType>(null);
  const { documents, refresh } = useDocuments(staticDocuments);

  const recentPosts = documents.slice(0, 8);

  const handleOpenView = (viewType: ViewType) => {
    setActiveView(viewType);
  };

  const handleCloseView = () => {
    setActiveView(null);
  };

  return (
    <DragProvider>
      <Box sx={{ py: 2, px: { xs: 1, sm: 2, md: 3 }, width: "100%" }}>
        <Grid container spacing={2}>
          {/* Notes Preview Card - Full width at top */}
          <Grid size={{ xs: 12 }}>
            <ErrorBoundaryCard cardName="Notes">
              <NotesPreviewCard onViewFull={() => handleOpenView("notes")} />
            </ErrorBoundaryCard>
          </Grid>

          {/* Bottom row: Board, README, Recent Posts */}
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <ErrorBoundaryCard cardName="Board">
              <KanbanPreviewCard
                documents={documents}
                onViewFull={() => handleOpenView("kanban")}
              />
            </ErrorBoundaryCard>
          </Grid>

          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <ErrorBoundaryCard cardName="README">
              <ReadmePreviewCard
                documents={documents}
                onViewFull={() => handleOpenView("readme")}
              />
            </ErrorBoundaryCard>
          </Grid>

          <Grid size={{ xs: 12, md: 12, lg: 4 }}>
            <ErrorBoundaryCard cardName="Recent Posts">
              <RecentPostsPreviewCard
                documents={recentPosts}
                onViewFull={() => router.push("/posts")}
              />
            </ErrorBoundaryCard>
          </Grid>
        </Grid>

        {/* Empty State */}
        {documents.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="body1" color="text.secondary">
              No posts yet
            </Typography>
          </Box>
        )}

        <TrashBin />

        {/* Full View Dialog */}
        <FullViewDialog
          open={activeView !== null}
          onClose={handleCloseView}
          viewType={activeView}
        >
          {activeView === "notes" && (
            <Box sx={{ height: "100%", minHeight: 600 }}>
              <NotesCanvas />
            </Box>
          )}
          {activeView === "kanban" && (
            <KanbanBoard documents={documents} onRefresh={refresh} />
          )}
          {activeView === "readme" && <ReadmeViewer documents={documents} />}
        </FullViewDialog>
      </Box>
    </DragProvider>
  );
};

export default Home;
