"use client";
import { useEffect, useRef, useState } from "react";
import { documentsSelectors, useSelector } from "@/store";
import htmr from "htmr";

interface LocalDocumentViewProps {
  documentId: string;
  cloudHead: string;
  children: React.ReactNode;
}

/**
 * Renders local (IndexedDB) content when the local head is ahead of the
 * cloud head — i.e. the user has saved locally but not yet synced to cloud.
 * Falls back to `children` (the server-rendered cloud HTML) when local is
 * absent or in sync with cloud.
 */
export default function LocalDocumentView(
  { documentId, cloudHead, children }: LocalDocumentViewProps,
) {
  const localDocument = useSelector((state) => {
    const doc = documentsSelectors.selectById(state, documentId);
    return doc?.local;
  });

  const localHead = localDocument?.head;
  const localData = localDocument?.data;

  const isLocalNewer = Boolean(localDocument) && localHead !== cloudHead;

  const [localHtml, setLocalHtml] = useState<string | null>(null);
  const fetchedHeadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLocalNewer || !localData) return;
    // Avoid redundant fetches when React re-renders but the head hasn't changed.
    if (fetchedHeadRef.current === localHead) return;

    const controller = new AbortController();

    fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localData),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.text() : null))
      .then((html) => {
        if (html !== null) {
          fetchedHeadRef.current = localHead!;
          setLocalHtml(html);
        }
      })
      .catch(() => {
        // Ignore abort errors; fall back to cloud content silently.
      });

    return () => controller.abort();
  }, [isLocalNewer, localHead, localData]);

  if (isLocalNewer && localHtml !== null) {
    return <>{htmr(localHtml)}</>;
  }

  return <>{children}</>;
}
