"use client";
import { useCallback, useEffect, useState } from "react";
import { CanvasSummary } from "@/types/notes";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const API_BASE = "/api/notes/canvas";
const STORAGE_KEY = "activeNotesCanvasId";

export function useNotesBoards() {
  const { status } = useSession();
  const router = useRouter();
  const [boards, setBoards] = useState<CanvasSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCanvasId, setActiveCanvasIdState] = useState<string | null>(
    null,
  );

  const setActiveCanvasId = useCallback((id: string) => {
    setActiveCanvasIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(API_BASE);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.subtitle || "Failed to fetch boards");
      }

      const fetchedBoards: CanvasSummary[] = data.data;
      setBoards(fetchedBoards);

      // Restore previously active board from localStorage
      const savedId = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
      if (savedId && fetchedBoards.find((b) => b.id === savedId)) {
        setActiveCanvasIdState(savedId);
      } else if (fetchedBoards.length > 0) {
        setActiveCanvasIdState(fetchedBoards[0].id);
      }
    } catch (err) {
      console.error("Error fetching boards:", err);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const createBoard = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      // Optimistic: append new board to end
      const tempId = `temp-${Date.now()}`;
      const optimisticBoard: CanvasSummary = {
        id: tempId,
        name: trimmed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setBoards((prev) => [...prev, optimisticBoard]);

      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.subtitle || "Failed to create board");
        }

        const realBoard: CanvasSummary = {
          id: data.data.id,
          name: data.data.name,
          createdAt: data.data.createdAt,
          updatedAt: data.data.updatedAt,
        };
        setBoards((prev) => prev.map((b) => (b.id === tempId ? realBoard : b)));
        setActiveCanvasId(data.data.id);
        router.refresh();
      } catch (err) {
        console.error("Error creating board:", err);
        // Rollback optimistic update
        setBoards((prev) => prev.filter((b) => b.id !== tempId));
      }
    },
    [router, setActiveCanvasId],
  );

  const renameBoard = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const previous = boards;
      // Optimistic update
      setBoards((prev) =>
        prev.map((b) => (b.id === id ? { ...b, name: trimmed } : b))
      );

      try {
        const res = await fetch(`${API_BASE}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.subtitle || "Failed to rename board");
        }
        router.refresh();
      } catch (err) {
        console.error("Error renaming board:", err);
        setBoards(previous);
      }
    },
    [boards, router],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      if (boards.length <= 1) return; // Guard: cannot delete the last board

      const deletedIndex = boards.findIndex((b) => b.id === id);
      const previous = boards;
      const newBoards = boards.filter((b) => b.id !== id);

      // Optimistic update
      setBoards(newBoards);

      // Switch to an adjacent board if the deleted one was active
      if (activeCanvasId === id) {
        const newActive = deletedIndex > 0
          ? newBoards[deletedIndex - 1]
          : newBoards[0];
        setActiveCanvasId(newActive.id);
      }

      try {
        const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.subtitle || "Failed to delete board");
        }
        router.refresh();
      } catch (err) {
        console.error("Error deleting board:", err);
        // Rollback
        setBoards(previous);
        if (activeCanvasId === id) {
          setActiveCanvasIdState(id);
        }
      }
    },
    [boards, activeCanvasId, router, setActiveCanvasId],
  );

  return {
    boards,
    loading,
    activeCanvasId,
    setActiveCanvasId,
    createBoard,
    renameBoard,
    deleteBoard,
  };
}
