"use client";
import { alpha, Box, Typography } from "@mui/material";
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
              <Typography variant="body2">Loading notes...</Typography>
            </Box>
          )
          : previewNotes.length === 0
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
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gridTemplateRows: "repeat(2, 1fr)",
                gap: 2,
                p: 2,
                height: "100%",
              }}
            >
              {previewNotes.map((note, index) => (
                <Box
                  key={note.id}
                  sx={{
                    bgcolor: note.color || "#fff9c4",
                    borderRadius: 2,
                    boxShadow: (theme) =>
                      theme.palette.mode === "dark"
                        ? "0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)"
                        : "0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
                    p: 2,
                    overflow: "hidden",
                    position: "relative",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    animation: `fadeInUp 0.4s ease-out ${index * 0.1}s both`,
                    "@keyframes fadeInUp": {
                      from: {
                        opacity: 0,
                        transform: "translateY(10px)",
                      },
                      to: {
                        opacity: 1,
                        transform: "translateY(0)",
                      },
                    },
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: (theme) =>
                        theme.palette.mode === "dark"
                          ? "0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)"
                          : "0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)",
                    },
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      bgcolor: (theme) =>
                        alpha(theme.palette.common.black, 0.1),
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    },
                  }}
                >
                  <Typography
                    sx={{
                      color: "rgba(0,0,0,0.85)",
                      fontSize: "12px",
                      lineHeight: 1.5,
                      fontWeight: 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 6,
                      WebkitBoxOrient: "vertical",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {extractTextFromLexicalState(note.content).substring(
                      0,
                      150,
                    )}
                  </Typography>
                </Box>
              ))}
              {remainingCount > 0 && (
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
          )}
      </Box>
    </Box>
  );
}
