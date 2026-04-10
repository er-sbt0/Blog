"use client";
import { useCallback } from "react";
import { actions, useDispatch } from "@/store";

/**
 * Returns a stable `errorAnnounce` function that:
 * 1. Logs the error to the console (developer visibility).
 * 2. Dispatches a user-visible snackbar announcement.
 *
 * Usage:
 *   const errorAnnounce = useErrorAnnounce();
 *   errorAnnounce("Failed to load data", err);
 *   // optionally override the subtitle:
 *   errorAnnounce("Failed to load data", err, "Please try again later.");
 */
export function useErrorAnnounce() {
  const dispatch = useDispatch();

  return useCallback(
    (title: string, error?: unknown, subtitle?: string) => {
      console.error(title, error);

      const resolvedSubtitle = subtitle ??
        (error instanceof Error ? error.message : undefined);

      dispatch(
        actions.announce({
          message: {
            title,
            ...(resolvedSubtitle ? { subtitle: resolvedSubtitle } : {}),
          },
        }),
      );
    },
    [dispatch],
  );
}
