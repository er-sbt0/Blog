"use client";
import { Box, Typography } from "@mui/material";
import { StickyNote2Outlined } from "@mui/icons-material";
import { useNotesStore } from "@/hooks/useNotesStore";
import { useEffect } from "react";

interface NotesPreviewCardProps {
  onViewFull: () => void;
}

/** Extract plain text from Lexical editor state JSON */
function extractTextFromLexicalState(content: string): string {
  try {
    const state = JSON.parse(content);
    const texts: string[] = [];

    function extractText(node: any) {
      if (node.text) {
        texts.push(node.text);
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(extractText);
      }
    }

    if (state.root) {
      extractText(state.root);
    }

    return texts.join(" ").trim() || "Empty note";
  } catch {
    // If it's not valid JSON, return the content as-is (might be plain text)
    return content || "Empty note";
  }
}

export default function NotesPreviewCard({
  onViewFull,
}: NotesPreviewCardProps) {
  const { canvas, loading, refresh } = useNotesStore();

  // Refresh notes when component mounts or becomes visible
  useEffect(() => {
    refresh();

    // Also refresh when window gains focus (user returns to tab)
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  const previewNotes = canvas?.notes.slice(0, 4) || [];
  const remainingCount = (canvas?.notes.length || 0) - 4;

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
          <StickyNote2Outlined sx={{ fontSize: 20, color: "text.secondary" }} />
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
          bgcolor: "action.hover",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: (theme) =>
              theme.palette.mode === "dark"
                ? `linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                   linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`
                : `linear-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px),
                   linear-gradient(90deg, rgba(0, 0, 0, 0.04) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
            pointerEvents: "none",
          },
        }}
      >
        {loading
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "text.secondary",
              }}
            >
              Loading...
            </Box>
          )
          : previewNotes.length === 0
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "text.secondary",
                textAlign: "center",
                px: 2,
              }}
            >
              <Typography variant="body2">
                No notes yet - click to add your first note
              </Typography>
            </Box>
          )
          : (
            <>
              {previewNotes.map((note, index) => (
                <Box
                  key={note.id}
                  sx={{
                    position: "absolute",
                    left: 16 + index * 20,
                    top: 16 + index * 18,
                    width: 140,
                    height: 90,
                    bgcolor: note.color || "#fff9c4",
                    borderRadius: 1.5,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    p: 1.5,
                    overflow: "hidden",
                    transition: "transform 0.2s",
                  }}
                >
                  <Typography
                    sx={{
                      color: "rgba(0,0,0,0.7)",
                      fontSize: "11px",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {extractTextFromLexicalState(note.content).substring(0, 80)}
                  </Typography>
                </Box>
              ))}
              {remainingCount > 0 && (
                <Typography
                  sx={{
                    position: "absolute",
                    bottom: 12,
                    right: 12,
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "text.secondary",
                  }}
                >
                  +{remainingCount} more
                </Typography>
              )}
            </>
          )}
      </Box>
    </Box>
  );
}
