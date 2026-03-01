"use client";
import NotesCanvas from "@/components/NotesCanvas";
import BoardSelector from "@/components/NotesCanvas/BoardSelector";
import { useNotesBoards } from "@/hooks/useNotesBoards";
import { Box } from "@mui/material";
import { StickyNote2 } from "@mui/icons-material";
import { NotesClipboardProvider } from "@/components/NotesCanvas/NotesClipboardContext";

export default function NotesPage() {
  const {
    boards,
    activeCanvasId,
    setActiveCanvasId,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useNotesBoards();

  return (
    <NotesClipboardProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* Board selector header — visually distinct from canvas */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: "background.paper",
            flexShrink: 0,
          }}
        >
          <StickyNote2 sx={{ fontSize: 20, color: "text.secondary" }} />
          <BoardSelector
            boards={boards}
            activeCanvasId={activeCanvasId}
            onSelectBoard={setActiveCanvasId}
            onCreateBoard={createBoard}
            onRenameBoard={renameBoard}
            onDeleteBoard={deleteBoard}
          />
        </Box>

        {/* Canvas area */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <NotesCanvas canvasId={activeCanvasId} />
        </Box>
      </Box>
    </NotesClipboardProvider>
  );
}
