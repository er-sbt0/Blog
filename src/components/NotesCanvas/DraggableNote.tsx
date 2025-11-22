"use client";
import { Note } from "@/types/notes";
import { Rnd } from "react-rnd";
import { EditorState, LexicalEditor } from "lexical";
import { editorConfig } from "@/editor/config";
import { useRef, useState } from "react";
import { Box, IconButton, Paper } from "@mui/material";
import { Close, DragIndicator } from "@mui/icons-material";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorPlugins } from "@/editor/plugins";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";

interface DraggableNoteProps {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
}

const NOTE_COLORS = {
  yellow: "linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)",
  pink: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
  blue: "linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)",
  green: "linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)",
  orange: "linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)",
  purple: "linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)",
  mint: "linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 100%)",
  peach: "linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)",
};

export default function DraggableNote({
  note,
  onUpdate,
  onDelete,
  onFocus,
}: DraggableNoteProps) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleEditorChange = (
    editorState: EditorState,
    editor: LexicalEditor,
  ) => {
    const serialized = JSON.stringify(editorState);
    onUpdate(note.id, { content: serialized });
  };

  const initialConfig = {
    ...editorConfig,
    editorState: note.content || undefined,
  };

  const handleDragStop = (_e: any, d: { x: number; y: number }) => {
    onUpdate(note.id, { position: { x: d.x, y: d.y } });
  };

  const handleResizeStop = (
    _e: any,
    _direction: any,
    ref: HTMLElement,
    _delta: any,
    position: { x: number; y: number },
  ) => {
    onUpdate(note.id, {
      size: { width: ref.offsetWidth, height: ref.offsetHeight },
      position,
    });
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocus(note.id);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <Rnd
      size={{ width: note.size.width, height: note.size.height }}
      position={{ x: note.position.x, y: note.position.y }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={200}
      minHeight={150}
      bounds="parent"
      dragHandleClassName="drag-handle"
      style={{ zIndex: note.zIndex }}
      enableResizing={{
        bottom: true,
        bottomRight: true,
        right: true,
        bottomLeft: true,
        left: true,
        top: true,
        topLeft: true,
        topRight: true,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          height: "100%",
          background: NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] ||
            NOTE_COLORS.yellow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "12px",
          border: isFocused
            ? "2px solid rgba(25, 118, 210, 0.6)"
            : "1px solid rgba(0, 0, 0, 0.08)",
          boxShadow: isFocused
            ? "0 12px 40px rgba(0, 0, 0, 0.15), 0 0 0 3px rgba(25, 118, 210, 0.1)"
            : "0 4px 20px rgba(0, 0, 0, 0.08)",
          backdropFilter: "blur(10px)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: isFocused ? "scale(1.02)" : "scale(1)",
          "&:hover": {
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
          },
        }}
        onMouseDown={handleFocus}
      >
        {/* Header */}
        <Box
          className="drag-handle"
          sx={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            backgroundColor: "rgba(255, 255, 255, 0.4)",
            backdropFilter: "blur(10px)",
            cursor: "move",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            transition: "background-color 0.2s",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.6)",
            },
          }}
        >
          <DragIndicator
            fontSize="small"
            sx={{
              mr: "auto",
              opacity: 0.4,
              transition: "opacity 0.2s",
              "&:hover": { opacity: 0.7 },
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            sx={{
              ml: "auto",
              padding: "4px",
              transition: "all 0.2s",
              "&:hover": {
                backgroundColor: "rgba(244, 67, 54, 0.1)",
                color: "error.main",
                transform: "scale(1.1)",
              },
            }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>

        {/* Editor Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            padding: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            "& .editor-input": {
              minHeight: "100%",
              outline: "none",
              fontSize: "14px",
              lineHeight: "1.6",
              color: "rgba(0, 0, 0, 0.87)",
            },
            "& p": {
              marginBottom: "8px",
            },
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <LexicalComposer initialConfig={initialConfig}>
            <EditorPlugins
              onChange={handleEditorChange}
              contentEditable={
                <ContentEditable
                  className="editor-input"
                  ariaLabel="note editor"
                />
              }
            />
            <EditorRefPlugin editorRef={editorRef} />
          </LexicalComposer>
        </Box>
      </Paper>
    </Rnd>
  );
}
