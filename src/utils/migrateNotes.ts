import { getStore } from "@/indexeddb";
import { Note, NotesCanvas } from "@/types/notes";

const NOTES_STORE = "notesCanvas";
const DEFAULT_CANVAS_ID = "default";
const MIGRATION_KEY = "notes_migrated_to_backend";

export interface MigrationResult {
  success: boolean;
  notesCount: number;
  error?: string;
}

/**
 * Check if user has IndexedDB notes that need migration
 */
export async function hasIndexedDBNotes(): Promise<boolean> {
  try {
    const store = getStore<NotesCanvas>(NOTES_STORE);
    const canvas = await store.getByID(DEFAULT_CANVAS_ID);
    return canvas !== undefined && canvas.notes.length > 0;
  } catch (error) {
    console.error("Error checking IndexedDB notes:", error);
    return false;
  }
}

/**
 * Check if notes have already been migrated
 */
export function hasMigrated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIGRATION_KEY) === "true";
}

/**
 * Mark migration as completed
 */
function markMigrationComplete(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(MIGRATION_KEY, "true");
  }
}

/**
 * Migrate notes from IndexedDB to backend
 */
export async function migrateNotesFromIndexedDB(): Promise<MigrationResult> {
  try {
    // Check if already migrated
    if (hasMigrated()) {
      return {
        success: true,
        notesCount: 0,
      };
    }

    // Get notes from IndexedDB
    const store = getStore<NotesCanvas>(NOTES_STORE);
    const canvas = await store.getByID(DEFAULT_CANVAS_ID);

    if (!canvas || canvas.notes.length === 0) {
      // No notes to migrate
      markMigrationComplete();
      return {
        success: true,
        notesCount: 0,
      };
    }

    // Get or create backend canvas
    const canvasResponse = await fetch("/api/notes/canvas");
    const canvasData = await canvasResponse.json();

    if (!canvasResponse.ok) {
      throw new Error(canvasData.error?.subtitle || "Failed to get canvas");
    }

    const backendCanvas = canvasData.data;

    // Create notes on backend (batch or individually)
    const migrationPromises = canvas.notes.map(async (note) => {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionX: note.position.x,
          positionY: note.position.y,
          width: note.size.width,
          height: note.size.height,
          title: note.title,
          content: note.content,
          color: note.color,
          zIndex: note.zIndex,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.subtitle || "Failed to create note");
      }

      return response.json();
    });

    await Promise.all(migrationPromises);

    // Mark migration as complete
    markMigrationComplete();

    return {
      success: true,
      notesCount: canvas.notes.length,
    };
  } catch (error) {
    console.error("Migration error:", error);
    return {
      success: false,
      notesCount: 0,
      error: error instanceof Error
        ? error.message
        : "Unknown error during migration",
    };
  }
}

/**
 * Clear IndexedDB notes after successful migration
 * (Optional - we keep them as backup for 30 days)
 */
export async function clearIndexedDBNotes(): Promise<void> {
  try {
    const store = getStore<NotesCanvas>(NOTES_STORE);
    await store.deleteByID(DEFAULT_CANVAS_ID);
  } catch (error) {
    console.error("Error clearing IndexedDB notes:", error);
  }
}

/**
 * Reset migration flag (for testing purposes)
 */
export function resetMigrationFlag(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(MIGRATION_KEY);
  }
}
