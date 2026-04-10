"use client";
import { useRef, useState } from "react";

export function useAddBoardState(onCreateBoard: (name: string) => void) {
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardError, setNewBoardError] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const handleAddClick = () => {
    setAddingBoard(true);
    setNewBoardName("");
    setNewBoardError("");
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const handleAddSubmit = () => {
    const trimmed = newBoardName.trim();
    if (!trimmed) {
      setNewBoardError("Name cannot be empty");
      return;
    }
    onCreateBoard(trimmed);
    setAddingBoard(false);
    setNewBoardName("");
    setNewBoardError("");
  };

  const handleAddCancel = () => {
    setAddingBoard(false);
    setNewBoardName("");
    setNewBoardError("");
  };

  return {
    addingBoard,
    newBoardName,
    newBoardError,
    addInputRef,
    setNewBoardName,
    setNewBoardError,
    handleAddClick,
    handleAddSubmit,
    handleAddCancel,
  };
}
