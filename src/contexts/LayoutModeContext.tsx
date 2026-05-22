"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type RailMode = "full" | "compact" | "hidden";
export type ViewMode = "read" | "focus" | "edit";

const RAIL_CYCLE: RailMode[] = ["full", "compact", "hidden"];
const RAIL_MODE_KEY = "ui.railMode";

interface LayoutModeContextType {
  railMode: RailMode;
  toggleRail: () => void;
  viewMode: ViewMode;
  setFocus: () => void;
  setRead: () => void;
}

const LayoutModeContext = createContext<LayoutModeContextType | undefined>(
  undefined,
);

export const useLayoutMode = () => {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return ctx;
};

export const LayoutModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [railMode, setRailMode] = useState<RailMode>("full");
  // viewMode is intentionally not persisted — resets to "read" on mount/navigation
  const [viewMode, setViewMode] = useState<ViewMode>("read");

  useEffect(() => {
    const saved = localStorage.getItem(RAIL_MODE_KEY) as RailMode | null;
    if (saved && RAIL_CYCLE.includes(saved)) setRailMode(saved);
  }, []);

  const toggleRail = useCallback(() => {
    setRailMode((prev) => {
      const next = RAIL_CYCLE[(RAIL_CYCLE.indexOf(prev) + 1) % RAIL_CYCLE.length];
      localStorage.setItem(RAIL_MODE_KEY, next);
      return next;
    });
  }, []);

  const setFocus = useCallback(() => setViewMode("focus"), []);
  const setRead = useCallback(() => setViewMode("read"), []);

  return (
    <LayoutModeContext.Provider value={{ railMode, toggleRail, viewMode, setFocus, setRead }}>
      {children}
    </LayoutModeContext.Provider>
  );
};
