"use client";
import { useEffect, useState } from "react";

/**
 * Returns `true` once the component has mounted on the client,
 * which signals that React hydration is complete.
 * Use this to guard client-only rendering and avoid hydration mismatches.
 */
export default function useIsHydrated(): boolean {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  return isHydrated;
}
