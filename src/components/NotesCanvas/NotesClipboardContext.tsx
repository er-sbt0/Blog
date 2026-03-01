"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { Note } from "@/types/notes";

export interface ClipboardNote {
  title?: string;
  content: string;
  color: string;
  size: { width: number; height: number };
}

interface NotesClipboardContextType {
  clip: ClipboardNote | null;
  copyNote: (note: Note) => void;
  cutNote: (note: Note, onDelete: (id: string) => void) => void;
  clearClip: () => void;
}

const NotesClipboardContext = createContext<NotesClipboardContextType | null>(
  null,
);

export function NotesClipboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clip, setClip] = useState<ClipboardNote | null>(null);

  const copyNote = useCallback((note: Note) => {
    setClip({
      title: note.title,
      content: note.content,
      color: note.color,
      size: { width: note.size.width, height: note.size.height },
    });
  }, []);

  const cutNote = useCallback(
    (note: Note, onDelete: (id: string) => void) => {
      setClip({
        title: note.title,
        content: note.content,
        color: note.color,
        size: { width: note.size.width, height: note.size.height },
      });
      onDelete(note.id);
    },
    [],
  );

  const clearClip = useCallback(() => setClip(null), []);

  return (
    <NotesClipboardContext.Provider value={{ clip, copyNote, cutNote, clearClip }}>
      {children}
    </NotesClipboardContext.Provider>
  );
}

export function useNotesClipboard() {
  const ctx = useContext(NotesClipboardContext);
  if (!ctx) {
    throw new Error(
      "useNotesClipboard must be used inside NotesClipboardProvider",
    );
  }
  return ctx;
}
