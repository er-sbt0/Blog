"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * A custom hook that adds keyboard navigation support to grid layouts
 * @param numColumns The number of columns in the grid
 * @param totalItems The total number of items in the grid
 * @param onFocusChange Optional callback when focus changes
 */
export const useGridKeyboardNavigation = (
  numColumns: number,
  totalItems: number,
  onFocusChange?: (index: number) => void,
) => {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!gridRef.current) return;

    // Find the currently focused element
    const focusedElement = document.activeElement;

    // If we don't have a focused element or it's not in our grid, do nothing
    if (!focusedElement || !gridRef.current.contains(focusedElement)) return;

    // Find all focusable elements within the grid
    const focusableElements = Array.from(
      gridRef.current.querySelectorAll(
        'a[href], button, [tabindex]:not([tabindex="-1"])',
      ),
    );

    // Get the index of the currently focused element
    const currentIndex = focusableElements.indexOf(focusedElement);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = currentIndex + 1;
        if (nextIndex >= focusableElements.length) nextIndex = null;
        break;

      case "ArrowLeft":
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = null;
        break;

      case "ArrowDown":
        nextIndex = currentIndex + numColumns;
        if (nextIndex >= focusableElements.length) nextIndex = null;
        break;

      case "ArrowUp":
        nextIndex = currentIndex - numColumns;
        if (nextIndex < 0) nextIndex = null;
        break;

      case "Home":
        nextIndex = 0;
        break;

      case "End":
        nextIndex = focusableElements.length - 1;
        break;

      default:
        return; // Exit if we're not handling this key
    }

    if (nextIndex !== null && focusableElements[nextIndex]) {
      event.preventDefault(); // Prevent default scrolling behavior

      // Focus the next element
      (focusableElements[nextIndex] as HTMLElement).focus();

      // Call the callback if provided
      if (onFocusChange) {
        onFocusChange(nextIndex);
      }
    }
  }, [numColumns, onFocusChange]);

  useEffect(() => {
    const currentGridRef = gridRef.current;

    if (currentGridRef) {
      currentGridRef.addEventListener("keydown", handleKeyDown);

      return () => {
        currentGridRef.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [handleKeyDown, gridRef]);

  return {
    gridRef,
  };
};

export default useGridKeyboardNavigation;
