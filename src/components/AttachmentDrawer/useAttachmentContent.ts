"use client";
import { useCallback, useEffect, useState } from "react";
import { actions, useDispatch } from "@/store";
import { downloadFile } from "@/utils/downloadFile";
import { detectLanguage } from "@/utils/languageDetection";
import { AttachmentContentCache, attachmentContentDB } from "@/indexeddb";
import { extractFilename } from "./attachmentUtils";
import Prism from "prismjs";

import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";

interface ContentState {
  content: string | null;
  loading: boolean;
  error: string | null;
}

interface UseAttachmentContentParams {
  open: boolean;
  url: string | undefined;
  filename: string | undefined;
  mimetype: string | undefined;
}

export function useAttachmentContent({ open, url, filename, mimetype }: UseAttachmentContentParams) {
  const dispatch = useDispatch();
  const language = filename && mimetype ? detectLanguage(filename, mimetype) : "text";
  const cacheKey = url ? extractFilename(url) : null;

  const [contentState, setContentState] = useState<ContentState>({
    content: null,
    loading: false,
    error: null,
  });
  const [highlightedContent, setHighlightedContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const fetchContent = useCallback(async () => {
    if (!url || !cacheKey) return;
    setContentState({ content: null, loading: true, error: null });
    try {
      const cached = await attachmentContentDB.getByID(cacheKey);
      if (cached) {
        setContentState({ content: cached.content, loading: false, error: null });
        setFileSize(cached.size);
        return;
      }
      const response = await fetch(`${url}/content`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load content: ${response.status}`);
      }
      const data = await response.json();
      setFileSize(data.size);
      const cacheEntry: AttachmentContentCache = {
        id: cacheKey,
        url,
        content: data.content,
        mimetype: data.mimetype,
        size: data.size,
        cachedAt: Date.now(),
      };
      await attachmentContentDB.add(cacheEntry).catch(() => {});
      setContentState({ content: data.content, loading: false, error: null });
    } catch (error) {
      setContentState({
        content: null,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load content",
      });
    }
  }, [url, cacheKey]);

  useEffect(() => {
    if (open && url) fetchContent();
  }, [open, url, fetchContent]);

  useEffect(() => {
    if (!open) {
      setContentState({ content: null, loading: false, error: null });
      setHighlightedContent(null);
      setFileSize(null);
      setIsEditing(false);
    }
  }, [open]);

  useEffect(() => {
    if (contentState.content && language !== "text") {
      try {
        const grammar = Prism.languages[language];
        if (grammar) {
          setHighlightedContent(Prism.highlight(contentState.content, grammar, language));
        } else {
          setHighlightedContent(null);
        }
      } catch {
        setHighlightedContent(null);
      }
    } else {
      setHighlightedContent(null);
    }
  }, [contentState.content, language]);

  const handleCopy = useCallback(async () => {
    if (contentState.content) {
      await navigator.clipboard.writeText(contentState.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [contentState.content]);

  const handleRefresh = useCallback(async () => {
    if (cacheKey) {
      await attachmentContentDB.deleteByID(cacheKey).catch(() => {});
      fetchContent();
    }
  }, [cacheKey, fetchContent]);

  const handleDownload = useCallback(async () => {
    if (!url || !filename) return;
    setIsDownloading(true);
    try {
      await downloadFile(url, filename);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  }, [url, filename]);

  const handleSave = useCallback(async (newContent: string) => {
    if (!url) return;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to save");
    }
    const data = await response.json();
    setContentState({ content: newContent, loading: false, error: null });
    setFileSize(data.size);
    setIsEditing(false);
    if (cacheKey) await attachmentContentDB.deleteByID(cacheKey).catch(() => {});
    dispatch(actions.notifyAttachmentModified({ url }));
  }, [url, cacheKey, dispatch]);

  return {
    language,
    contentState,
    highlightedContent,
    copied,
    isDownloading,
    fileSize,
    isEditing,
    setIsEditing,
    handleCopy,
    handleRefresh,
    handleDownload,
    handleSave,
    handleCancelEdit: () => setIsEditing(false),
  };
}
