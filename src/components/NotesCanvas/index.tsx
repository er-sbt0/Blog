"use client";
import { Box } from "@mui/material";
import { useNotesStore } from "@/hooks/useNotesStore";
import DraggableNote from "./DraggableNote";
import NotesToolbar from "./NotesToolbar";
import { useCallback } from "react";

export default function NotesCanvas() {
  const { canvas, loading, addNote, updateNote, deleteNote, bringToFront } = useNotesStore();

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
        zIndex: canvas ? Math.max(...canvas.notes.map((n) => n.zIndex), 0) + 1 : 1,
      });
    },
    [addNote, canvas]
  );

  const handleClearAll = useCallback(() => {
    if (canvas && window.confirm("Are you sure you want to delete all notes?")) {
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
        }}
      >
        Loading notes...
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
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
          backgroundAttachment: "fixed",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: "30px 30px",
            pointerEvents: "none",
            opacity: 0.6,
          },
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

        {canvas?.notes.length === 0 && (
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              color: "rgba(0, 0, 0, 0.4)",
              fontSize: "20px",
              fontWeight: 500,
              letterSpacing: "0.5px",
              pointerEvents: "none",
            }}
          >
            Click the + button to create your first note ✨
          </Box>
        )}
      </Box>
    </>
  );
}
