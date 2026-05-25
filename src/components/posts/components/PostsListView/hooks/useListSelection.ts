"use client";
import { useCallback, useState } from "react";

interface UseListSelectionArgs {
  allIds: string[];
}

interface UseListSelectionReturn {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string, event: React.MouseEvent) => void;
  selectAll: () => void;
  clearAll: () => void;
}

export function useListSelection(
  { allIds }: UseListSelectionArgs,
): UseListSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [
    selectedIds,
  ]);

  const toggle = useCallback((id: string, event: React.MouseEvent) => {
    if (event.shiftKey && anchorId) {
      const anchorIndex = allIds.indexOf(anchorId);
      const targetIndex = allIds.indexOf(id);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const [start, end] = anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
        const rangeIds = allIds.slice(start, end + 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
      }
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchorId(id);
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchorId(id);
  }, [allIds, anchorId]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  return { selectedIds, isSelected, toggle, selectAll, clearAll };
}
