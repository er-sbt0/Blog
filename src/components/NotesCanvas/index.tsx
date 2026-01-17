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
        size: { width: 300, height: 250 },
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
    <>
      <NotesToolbar onAddNote={handleAddNote} onClearAll={handleClearAll} />

      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          overflow: "auto",
          position: "relative",
          bgcolor: "#fafafa",
          // Paper grid pattern: major lines every 120px, minor lines every 30px
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px),
            linear-gradient(rgba(0, 0, 0, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px)
          `,
          backgroundSize: "120px 120px, 120px 120px, 30px 30px, 30px 30px",
          backgroundPosition: "-1px -1px, -1px -1px, -1px -1px, -1px -1px",
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
    </>
  );
}
