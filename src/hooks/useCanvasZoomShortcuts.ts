import { RefObject, useEffect } from "react";

interface UseCanvasZoomShortcutsOptions {
  enabled: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

/**
 * Attaches ctrl+wheel and ctrl+keyboard (=, -, 0) zoom shortcuts to a
 * scrollable canvas container. Has no effect when `enabled` is false.
 */
export function useCanvasZoomShortcuts({
  enabled,
  scrollContainerRef,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: UseCanvasZoomShortcutsOptions) {
  // Ctrl+wheel
  useEffect(() => {
    if (!enabled) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        onZoomIn?.();
      } else {
        onZoomOut?.();
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [enabled, scrollContainerRef, onZoomIn, onZoomOut]);

  // Ctrl+= / Ctrl+- / Ctrl+0
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        onZoomIn?.();
      } else if (e.key === "-") {
        e.preventDefault();
        onZoomOut?.();
      } else if (e.key === "0") {
        e.preventDefault();
        onResetZoom?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onZoomIn, onZoomOut, onResetZoom]);
}
