"use client";
import { alpha, Box, Typography } from "@mui/material";
import { StickyNote2Outlined } from "@mui/icons-material";
import { useNotesStore } from "@/hooks/useNotesStore";
import DraggableNote from "./DraggableNote";
import NotesToolbar from "./NotesToolbar";
import StaticNoteCard from "./StaticNoteCard";
import { useCallback, useEffect } from "react";

// Virtual canvas dimensions for consistent coordinate system
const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;
const PREVIEW_HEIGHT = 260;

interface NotesCanvasProps {
  preview?: boolean;
  onViewFull?: () => void;
}

export default function NotesCanvas(
  { preview = false, onViewFull }: NotesCanvasProps,
) {
  const {
    canvas,
    loading,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    refresh,
  } = useNotesStore();

  const handleAddNote = useCallback(
    (color: string) => {
      // Calculate center position with some randomness using virtual canvas dimensions
      const centerX = VIRTUAL_CANVAS_WIDTH / 2 - 150 + Math.random() * 100;
      const centerY = VIRTUAL_CANVAS_HEIGHT / 2 - 100 + Math.random() * 100;

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

  // Refresh notes when in preview mode
  useEffect(() => {
    if (preview) {
      refresh();

      // Also refresh when window gains focus (user returns to tab)
      const handleFocus = () => refresh();
      window.addEventListener("focus", handleFocus);
      return () => window.removeEventListener("focus", handleFocus);
    }
  }, [preview, refresh]);

  const previewNotes = preview ? (canvas?.notes.slice(0, 4) || []) : [];
  const remainingCount = preview ? ((canvas?.notes.length || 0) - 4) : 0;

  if (loading && preview) {
    return (
      <Box
        sx={{
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">Loading notes...</Typography>
      </Box>
    );
  }

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

  // Preview mode rendering
  if (preview) {
    return (
      <Box
        sx={{
          height: 320,
          position: "relative",
          cursor: "pointer",
          borderRadius: 3,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            "& .preview-overlay": {
              opacity: 1,
            },
          },
        }}
        onClick={onViewFull}
      >
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
            <StickyNote2Outlined
              sx={{ fontSize: 20, color: "text.secondary" }}
            />
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
            height: 260,
            position: "relative",
            overflow: "hidden",
            borderRadius: 2,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: (theme) =>
                theme.palette.mode === "dark"
                  ? `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`
                  : `linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
              pointerEvents: "none",
              opacity: 0.5,
            },
          }}
        >
          {previewNotes.length === 0
            ? (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 1.5,
                  color: "text.secondary",
                }}
              >
                <StickyNote2Outlined sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  No notes yet
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.5 }}>
                  Click to create your first note
                </Typography>
              </Box>
            )
            : (
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    width: `${VIRTUAL_CANVAS_WIDTH}px`,
                    height: `${VIRTUAL_CANVAS_HEIGHT}px`,
                    transform: `scale(${
                      PREVIEW_HEIGHT / VIRTUAL_CANVAS_HEIGHT
                    })`,
                    transformOrigin: "top left",
                  }}
                >
                  {previewNotes.map((note, index) => (
                    <Box
                      key={note.id}
                      sx={{
                        position: "absolute",
                        left: note.position.x * 2,
                        top: note.position.y * 2,
                        width: note.size.width * 2,
                        height: note.size.height * 2,
                        zIndex: note.zIndex,
                        display: "flex",
                      }}
                    >
                      <StaticNoteCard note={note} index={index} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          {previewNotes.length > 0 && remainingCount > 0 && (
            <Box
              sx={{
                position: "absolute",
                bottom: 16,
                right: 16,
                bgcolor: (theme) =>
                  alpha(
                    theme.palette.background.paper,
                    theme.palette.mode === "dark" ? 0.9 : 0.95,
                  ),
                backdropFilter: "blur(8px)",
                px: 1.5,
                py: 0.75,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "text.secondary",
                  letterSpacing: "0.02em",
                }}
              >
                +{remainingCount} more
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Full canvas mode rendering
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
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
          overflow: "auto",
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
        <Box
          sx={{
            position: "relative",
            width: `${VIRTUAL_CANVAS_WIDTH}px`,
            height: `${VIRTUAL_CANVAS_HEIGHT}px`,
            minWidth: "100%",
            minHeight: "100%",
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
    </Box>
  );
}
