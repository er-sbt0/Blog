"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 240;
const COLLAPSED_WIDTH = 72;
const STORAGE_KEY = "sidebar-width";

interface UseSidebarResizeReturn {
  width: number;
  isResizing: boolean;
  startResize: (e: React.MouseEvent) => void;
  resetWidth: () => void;
  getWidth: (isOpen: boolean) => number;
}

/**
 * Custom hook to manage sidebar resizable width
 */
export const useSidebarResize = (): UseSidebarResizeReturn => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Load saved width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10);
      if (parsedWidth >= MIN_WIDTH && parsedWidth <= MAX_WIDTH) {
        setWidth(parsedWidth);
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const delta = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + delta;
    
    // Clamp width between min and max
    const clampedWidth = Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH);
    setWidth(clampedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, width.toString());
  }, [width]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  const resetWidth = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
    localStorage.setItem(STORAGE_KEY, DEFAULT_WIDTH.toString());
  }, []);

  const getWidth = useCallback((isOpen: boolean) => {
    return isOpen ? width : COLLAPSED_WIDTH;
  }, [width]);

  return {
    width,
    isResizing,
    startResize,
    resetWidth,
    getWidth,
  };
};
