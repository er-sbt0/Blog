import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sidebarFontSize";
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;

export function useSidebarFontSize() {
  const [sidebarFontSize, setSidebarFontSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_FONT_SIZE;
    }
    return DEFAULT_FONT_SIZE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, sidebarFontSize.toString());
  }, [sidebarFontSize]);

  const increaseFontSize = useCallback(() => {
    setSidebarFontSize((prev) => Math.min(prev + 1, MAX_FONT_SIZE));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setSidebarFontSize((prev) => Math.max(prev - 1, MIN_FONT_SIZE));
  }, []);

  const resetFontSize = useCallback(() => {
    setSidebarFontSize(DEFAULT_FONT_SIZE);
  }, []);

  return { sidebarFontSize, increaseFontSize, decreaseFontSize, resetFontSize };
}
