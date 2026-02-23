"use client";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useRouter } from "next/navigation";
import { Series, User, UserDocument } from "@/types";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";
import { useState, useRef, useCallback, useEffect } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import KanbanPreviewCard from "./KanbanPreviewCard";
import ReadmePreviewCard from "./ReadmePreviewCard";
import RecentPostsPreviewCard from "./RecentPostsPreviewCard";
import FullViewDialog from "./FullViewDialog";
import NotesCanvas from "../NotesCanvas";
import KanbanBoard from "./KanbanBoard";
import ReadmeViewer from "./ReadmeViewer";
import ErrorBoundaryCard from "./ErrorBoundaryCard";
import { StickyNote2 } from "@mui/icons-material";

type ViewType = "notes" | "kanban" | "readme" | "posts" | null;

const Home: React.FC<{
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({ staticDocuments }) => {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ViewType>(null);
  const [notesHeight, setNotesHeight] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notesCanvasHeight');
      return saved ? parseInt(saved, 10) : 400;
    }
    return 400;
  }); // Default height in pixels
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const { documents, refresh } = useDocuments(staticDocuments);

  const recentPosts = documents.slice(0, 8);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      startY: e.clientY,
      startHeight: notesHeight,
    };
  }, [notesHeight]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeStartRef.current) return;

    const deltaY = e.clientY - resizeStartRef.current.startY;
    const newHeight = Math.max(200, resizeStartRef.current.startHeight + deltaY);
    setNotesHeight(newHeight);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
  }, []);

  // Save height to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notesCanvasHeight', notesHeight.toString());
    }
  }, [notesHeight]);

  // Add/remove global event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

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
          {/* Notes Canvas - Full width at top */}
          <Grid size={{ xs: 12 }}>
            <ErrorBoundaryCard cardName="Notes">
              {/* Header */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1.5,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <StickyNote2 sx={{ fontSize: 20, color: "text.secondary" }} />
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 500,
                      color: "text.primary",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Notes
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  height: `${notesHeight}px`,
                  minHeight: 200,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <NotesCanvas />

                {/* Resize Handle */}
                <Box
                  onMouseDown={handleResizeStart}
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 8,
                    cursor: "ns-resize",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isResizing ? "action.selected" : "transparent",
                    "&:hover": {
                      backgroundColor: "action.hover",
                    },
                    transition: "background-color 0.2s",
                    zIndex: 10,
                  }}
                />
              </Box>
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
