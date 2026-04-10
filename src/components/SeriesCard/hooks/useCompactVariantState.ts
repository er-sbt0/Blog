"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserDocument } from "@/types";

export function useCompactVariantState(
  posts: UserDocument[],
  defaultExpanded: boolean,
  seriesId: string,
  onExpand?: () => void,
  onCollapse?: () => void,
) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const dateA = new Date(a.cloud?.createdAt || a.local?.createdAt || 0)
          .getTime();
        const dateB = new Date(b.cloud?.createdAt || b.local?.createdAt || 0)
          .getTime();
        return dateB - dateA; // Newest first
      }),
    [posts],
  );

  const handleToggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (newState) {
      onCollapse?.();
    } else {
      onExpand?.();
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isLinkClick = target.closest("a");
    if (!isLinkClick) {
      router.push(`/series/${seriesId}`);
    }
  };

  return { isCollapsed, sortedPosts, handleToggle, handleCardClick };
}
