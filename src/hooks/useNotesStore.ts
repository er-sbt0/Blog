"use client";
import { useCallback, useEffect, useState } from "react";
import { Note, NotesCanvas } from "@/types/notes";
import { getStore } from "@/indexeddb";

const NOTES_STORE = "notesCanvas";
const DEFAULT_CANVAS_ID = "default";

// Singleton state to prevent race conditions between multiple hook instances
let globalCanvas: NotesCanvas | null = null;
let globalListeners: Set<(canvas: NotesCanvas | null) => void> = new Set();
let isInitializing = false;
let initPromise: Promise<NotesCanvas | null> | null = null;

async function initializeCanvas(): Promise<NotesCanvas | null> {
  // If already initializing, wait for that to complete
  if (initPromise) {
    return initPromise;
  }

  // If already initialized, return cached value
  if (globalCanvas) {
    return globalCanvas;
  }

  isInitializing = true;
  initPromise = (async () => {
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
        try {
          await store.add(data);
        } catch (e) {
          // If add fails (duplicate key), try to get again
          data = await store.getByID(DEFAULT_CANVAS_ID);
          if (!data) {
            console.error("Failed to create or retrieve canvas:", e);
            return null;
          }
        }
      }

      globalCanvas = data;
      return data;
    } catch (error) {
      console.error("Failed to load notes canvas:", error);
      return null;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

function notifyListeners(canvas: NotesCanvas | null) {
  globalListeners.forEach((listener) => listener(canvas));
}

async function saveCanvasGlobal(updatedCanvas: NotesCanvas) {
  try {
    const store = getStore<NotesCanvas>(NOTES_STORE);
    const canvasToSave = {
      ...updatedCanvas,
      updatedAt: Date.now(),
    };
    await store.update(canvasToSave);
    globalCanvas = canvasToSave;
    notifyListeners(canvasToSave);
  } catch (error) {
    console.error("Failed to save notes canvas:", error);
  }
}

export function useNotesStore() {
  const [canvas, setCanvas] = useState<NotesCanvas | null>(globalCanvas);
  const [loading, setLoading] = useState(!globalCanvas);

  useEffect(() => {
    // Subscribe to global state changes
    const listener = (newCanvas: NotesCanvas | null) => {
      setCanvas(newCanvas);
    };
    globalListeners.add(listener);

    // Initialize if needed
    if (!globalCanvas) {
      initializeCanvas().then((data) => {
        setCanvas(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const store = getStore<NotesCanvas>(NOTES_STORE);
      const data = await store.getByID(DEFAULT_CANVAS_ID);
      if (data) {
        globalCanvas = data;
        notifyListeners(data);
      }
    } catch (error) {
      console.error("Failed to refresh notes canvas:", error);
    }
  }, []);

  const addNote = useCallback(async (
    note: Omit<Note, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!globalCanvas) return;

    const newNote: Note = {
      ...note,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedCanvas = {
      ...globalCanvas,
      notes: [...globalCanvas.notes, newNote],
    };

    await saveCanvasGlobal(updatedCanvas);
  }, []);

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    if (!globalCanvas) return;

    const updatedCanvas = {
      ...globalCanvas,
      notes: globalCanvas.notes.map((note) =>
        note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note
      ),
    };

    await saveCanvasGlobal(updatedCanvas);
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    if (!globalCanvas) return;

    const updatedCanvas = {
      ...globalCanvas,
      notes: globalCanvas.notes.filter((note) => note.id !== id),
    };

    await saveCanvasGlobal(updatedCanvas);
  }, []);

  const bringToFront = useCallback(async (id: string) => {
    if (!globalCanvas) return;

    const maxZIndex = Math.max(...globalCanvas.notes.map((n) => n.zIndex), 0);

    const updatedCanvas = {
      ...globalCanvas,
      notes: globalCanvas.notes.map((note) =>
        note.id === id ? { ...note, zIndex: maxZIndex + 1 } : note
      ),
    };

    await saveCanvasGlobal(updatedCanvas);
  }, []);

  return {
    canvas,
    loading,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    refresh,
  };
}
