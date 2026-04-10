"use client";
import { useCallback, useEffect } from "react";

interface UseKeyboardShortcutsProps {
  onToggleSidebar: () => void;
  enabled?: boolean;
}

interface UseKeyboardShortcutsReturn {
  shortcutHint: string;
}

/**
 * Custom hook to handle keyboard shortcuts for the sidebar
 * Provides accessible keyboard navigation
 */
export const useKeyboardShortcuts = ({
  onToggleSidebar,
  enabled = true,
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsReturn => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Check for modifier keys (Ctrl/Cmd + B to toggle sidebar)
    const isModifierPressed = event.ctrlKey || event.metaKey;

    if (isModifierPressed && event.key === "\\") {
      event.preventDefault();
      onToggleSidebar();
    }
  }, [onToggleSidebar, enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  return {
    shortcutHint: "Ctrl+\\",
  };
};
