"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_STORAGE_KEY,
} from "./constants";

interface SidebarWidthContextType {
  /** The user's preferred expanded width (persisted to localStorage) */
  width: number;
  /** Whether the user is currently dragging the resize handle */
  isResizing: boolean;
  /** Start a resize operation */
  startResize: (e: React.MouseEvent) => void;
  /** Reset width to default */
  resetWidth: () => void;
  /** Get the effective width based on open/closed state */
  getEffectiveWidth: (isOpen: boolean) => number;
  /**
   * @deprecated Use getEffectiveWidth instead.
   * Kept for backward compatibility during migration.
   */
  sidebarWidth: number;
  /**
   * @deprecated No longer needed - width is managed internally.
   * Kept for backward compatibility during migration.
   */
  setSidebarWidth: (width: number) => void;
}

const SidebarWidthContext = createContext<SidebarWidthContextType | undefined>(
  undefined,
);

export const useSidebarWidth = () => {
  const context = useContext(SidebarWidthContext);
  if (!context) {
    throw new Error(
      "useSidebarWidth must be used within SidebarWidthProvider",
    );
  }
  return context;
};

export const SidebarWidthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!saved) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = parseInt(saved, 10);
    return parsed >= SIDEBAR_MIN_WIDTH && parsed <= SIDEBAR_MAX_WIDTH
      ? parsed
      : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Refs to track resize state without stale closures
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const currentWidthRef = useRef(width);

  // Keep ref in sync with state
  useEffect(() => {
    currentWidthRef.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const delta = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + delta;

    // Clamp width between min and max
    const clampedWidth = Math.min(
      Math.max(newWidth, SIDEBAR_MIN_WIDTH),
      SIDEBAR_MAX_WIDTH,
    );
    setWidth(clampedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    // Use ref to get the current width (avoids stale closure)
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      currentWidthRef.current.toString(),
    );
  }, []);

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
    // Use the current sidebar width as the anchor rather than e.clientX.
    // This ensures the sidebar's right edge snaps directly to the cursor
    // regardless of where within the 4px handle the user clicked, preventing
    // the handle from jumping away on drag start.
    startXRef.current = width;
    startWidthRef.current = width;
  }, [width]);

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH.toString());
  }, []);

  const getEffectiveWidth = useCallback((isOpen: boolean) => {
    return isOpen ? width : SIDEBAR_COLLAPSED_WIDTH;
  }, [width]);

  // Backward compatibility: compute effective width assuming closed state
  // This will be removed once all consumers are updated
  const sidebarWidth = width;
  const setSidebarWidth = useCallback((newWidth: number) => {
    // No-op for backward compatibility - width is managed internally
  }, []);

  return (
    <SidebarWidthContext.Provider
      value={{
        width,
        isResizing,
        startResize,
        resetWidth,
        getEffectiveWidth,
        // Deprecated - for backward compatibility
        sidebarWidth,
        setSidebarWidth,
      }}
    >
      {children}
    </SidebarWidthContext.Provider>
  );
};
