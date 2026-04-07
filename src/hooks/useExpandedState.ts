import { useCallback, useState } from "react";

export function useExpandedState(storageKey: string) {
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => {
    const saved = typeof window !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;
    if (saved) {
      try {
        return new Set<string>(JSON.parse(saved));
      } catch {
        // ignore parse errors
      }
    }
    return new Set<string>();
  });

  const toggleSeries = useCallback((seriesId: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      }
      return next;
    });
  }, [storageKey]);

  return { expandedSeries, toggleSeries };
}
