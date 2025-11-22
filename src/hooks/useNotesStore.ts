"use client";
import { useEffect, useState } from "react";
import { Note, NotesCanvas } from "@/types/notes";
import { getStore } from "@/indexeddb";

const NOTES_STORE = "notesCanvas";
const DEFAULT_CANVAS_ID = "default";

export function useNotesStore() {
  const [canvas, setCanvas] = useState<NotesCanvas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCanvas();
  }, []);

  const loadCanvas = async () => {
    try {
      const store = getStore<NotesCanvas>(NOTES_STORE);
      let data = await store.getByID(DEFAULT_CANVAS_ID);

      if (!data) {
        // Create default canvas
        data = {
          id: DEFAULT_CANVAS_ID,
          name: "My Notes",
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await store.add(data);
      }

      setCanvas(data);
    } catch (error) {
      console.error("Failed to load notes canvas:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveCanvas = async (updatedCanvas: NotesCanvas) => {
    try {
      const store = getStore<NotesCanvas>(NOTES_STORE);
      await store.update({
        ...updatedCanvas,
        updatedAt: Date.now(),
      });
      setCanvas(updatedCanvas);
    } catch (error) {
      console.error("Failed to save notes canvas:", error);
    }
  };

  const addNote = async (
    note: Omit<Note, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!canvas) return;

    const newNote: Note = {
      ...note,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedCanvas = {
      ...canvas,
      notes: [...canvas.notes, newNote],
    };

    await saveCanvas(updatedCanvas);
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    if (!canvas) return;

    const updatedCanvas = {
      ...canvas,
      notes: canvas.notes.map((note) =>
        note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note
      ),
    };

    await saveCanvas(updatedCanvas);
  };

  const deleteNote = async (id: string) => {
    if (!canvas) return;

    const updatedCanvas = {
      ...canvas,
      notes: canvas.notes.filter((note) => note.id !== id),
    };

    await saveCanvas(updatedCanvas);
  };

  const bringToFront = async (id: string) => {
    if (!canvas) return;

    const maxZIndex = Math.max(...canvas.notes.map((n) => n.zIndex), 0);

    const updatedCanvas = {
      ...canvas,
      notes: canvas.notes.map((note) =>
        note.id === id ? { ...note, zIndex: maxZIndex + 1 } : note
      ),
    };

    await saveCanvas(updatedCanvas);
  };

  return {
    canvas,
    loading,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
  };
}
