"use client";
import { useRef, useState } from "react";
import { CanvasSummary } from "@/types/notes";

export function useRenameBoardState(
  onRenameBoard: (id: string, name: string) => void,
  onMenuClose: () => void,
) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleRenameClick = (boards: CanvasSummary[], menuBoardId: string | null) => {
    const board = boards.find((b) => b.id === menuBoardId);
    if (board) {
      setRenamingId(board.id);
      setRenameValue(board.name);
    }
    onMenuClose();
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameBoard(renamingId, trimmed);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  return {
    renamingId,
    renameValue,
    renameInputRef,
    setRenameValue,
    handleRenameClick,
    handleRenameSubmit,
    cancelRename,
  };
}
