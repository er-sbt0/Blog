"use client";
import { Note } from "@/types/notes";
import { Rnd } from "react-rnd";
import { EditorState, LexicalEditor } from "lexical";
import { editorConfig } from "@/editor/config";
import { useRef, useState } from "react";
import { Box, IconButton, Paper, TextField } from "@mui/material";
import { Close } from "@mui/icons-material";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorPlugins } from "@/editor/plugins";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { NOTE_COLORS, NoteColorKey } from "./noteColors";

interface DraggableNoteProps {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
}

export default function DraggableNote({
  note,
  onUpdate,
  onDelete,
  onFocus,
}: DraggableNoteProps) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [title, setTitle] = useState(note.title || "");

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

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = event.target.value;
    setTitle(newTitle);
    onUpdate(note.id, { title: newTitle });
  };

  return (
    <Rnd
      size={{ width: note.size.width, height: note.size.height }}
      position={{ x: note.position.x, y: note.position.y }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={160}
      minHeight={120}
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
          background: NOTE_COLORS[note.color as NoteColorKey] ||
            NOTE_COLORS.yellow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "12px",
          border: isFocused
            ? "2px solid rgba(25, 118, 210, 0.5)"
            : "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow: isFocused
            ? "0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 3px rgba(25, 118, 210, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5)"
            : "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow:
              "0 4px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
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
            gap: 1,
            padding: "8px 10px",
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            cursor: "move",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            minHeight: "36px",
            transition: "background-color 0.2s ease",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.35)",
            },
          }}
        >
          <TextField
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            variant="standard"
            fullWidth
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            InputProps={{
              disableUnderline: true,
              sx: {
                fontSize: "13px",
                fontWeight: 500,
                color: "rgba(0, 0, 0, 0.75)",
                "& input": {
                  padding: 0,
                  cursor: "text",
                  "&::placeholder": {
                    color: "rgba(0, 0, 0, 0.3)",
                    opacity: 1,
                  },
                },
              },
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            sx={{
              padding: "3px",
              opacity: 0.5,
              transition: "all 0.2s ease",
              "&:hover": {
                opacity: 1,
                backgroundColor: "rgba(244, 67, 54, 0.08)",
                color: "error.main",
              },
            }}
          >
            <Close sx={{ fontSize: "16px" }} />
          </IconButton>
        </Box>

        {/* Editor Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            padding: "12px",
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
