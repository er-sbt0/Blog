"use client";
import { Box, Typography } from "@mui/material";
import { useNotesStore } from "@/hooks/useNotesStore";
import DraggableNote from "./DraggableNote";
import NotesToolbar from "./NotesToolbar";
import { useCallback } from "react";

export default function NotesCanvas() {
  const { canvas, loading, addNote, updateNote, deleteNote, bringToFront } =
    useNotesStore();

  const handleAddNote = useCallback(
    (color: string) => {
      // Calculate center position with some randomness
      const centerX = window.innerWidth / 2 - 150 + Math.random() * 100;
      const centerY = window.innerHeight / 2 - 100 + Math.random() * 100;

      addNote({
        position: { x: centerX, y: centerY },
        size: { width: 240, height: 200 },
        content: "",
        color,
        zIndex: canvas
          ? Math.max(...canvas.notes.map((n) => n.zIndex), 0) + 1
          : 1,
      });
    },
    [addNote, canvas],
  );

  const handleClearAll = useCallback(() => {
    if (
      canvas && window.confirm("Are you sure you want to delete all notes?")
    ) {
      canvas.notes.forEach((note) => deleteNote(note.id));
    }
  }, [canvas, deleteNote]);

  if (loading) {
    return (
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#fafafa",
        }}
      >
        <Typography color="text.secondary">Loading notes...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        minHeight: 0,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <NotesToolbar onAddNote={handleAddNote} onClearAll={handleClearAll} />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
          backgroundImage: (theme) =>
            theme.palette.mode === "dark"
              ? `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`
              : `linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0",
        }}
      >
        {canvas?.notes.map((note) => (
          <DraggableNote
            key={note.id}
            note={note}
            onUpdate={updateNote}
            onDelete={deleteNote}
            onFocus={bringToFront}
          />
        ))}
      </Box>
    </Box>
  );
}
