"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  SwipeableDrawer,
  Typography,
} from "@mui/material";
import {
  AttachFile,
  Close,
  ContentCopy,
  Download,
  Edit,
  Refresh,
} from "@mui/icons-material";
import { actions, RootState, useDispatch, useSelector } from "@/store";
import { downloadFile } from "@/utils/downloadFile";
import {
  detectLanguage,
  getLanguageDisplayName,
} from "@/utils/languageDetection";
import { AttachmentContentCache, attachmentContentDB } from "@/indexeddb";
import AttachmentEditor from "@/editor/nodes/AttachmentNode/AttachmentEditor";
import Prism from "prismjs";

// Import common Prism languages
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

// File extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

function isEditable(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (EDITABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  const baseName = filename.toLowerCase();
  const configFiles = [
    "dockerfile",
    "makefile",
    "gemfile",
    "rakefile",
    "procfile",
  ];
  return configFiles.includes(baseName);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function extractFilename(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}

export default function AttachmentDrawer() {
  const dispatch = useDispatch();
  const attachmentPreview = useSelector((state: RootState) =>
    state.ui.attachmentPreview
  );
  const [contentState, setContentState] = useState<ContentState>({
    content: null,
    loading: false,
    error: null,
  });
  const [highlightedContent, setHighlightedContent] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const open = attachmentPreview?.open ?? false;
  const url = attachmentPreview?.url;
  const filename = attachmentPreview?.filename;
  const mimetype = attachmentPreview?.mimetype;

  const language = filename && mimetype
    ? detectLanguage(filename, mimetype)
    : "text";
  const languageDisplayName = getLanguageDisplayName(language);
  const cacheKey = url ? extractFilename(url) : null;
  const canEdit = filename ? isEditable(filename) : false;

  const handleClose = useCallback(() => {
    dispatch(actions.closeAttachmentPreview());
  }, [dispatch]);

  const fetchContent = useCallback(async () => {
    if (!url || !cacheKey) return;

    setContentState({ content: null, loading: true, error: null });

    try {
      // Check cache first
      const cached = await attachmentContentDB.getByID(cacheKey);
      if (cached) {
        setContentState({
          content: cached.content,
          loading: false,
          error: null,
        });
        setFileSize(cached.size);
        return;
      }

      // Fetch from API
      const response = await fetch(`${url}/content`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to load content: ${response.status}`,
        );
      }

      const data = await response.json();
      const content = data.content;
      setFileSize(data.size);

      // Cache the content
      const cacheEntry: AttachmentContentCache = {
        id: cacheKey,
        url,
        content,
        mimetype: data.mimetype,
        size: data.size,
        cachedAt: Date.now(),
      };
      await attachmentContentDB.add(cacheEntry).catch(() => {
        // Ignore cache errors
      });

      setContentState({ content, loading: false, error: null });
    } catch (error) {
      setContentState({
        content: null,
        loading: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load content",
      });
    }
  }, [url, cacheKey]);

  // Fetch content when drawer opens
  useEffect(() => {
    if (open && url) {
      fetchContent();
    }
  }, [open, url, fetchContent]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setContentState({ content: null, loading: false, error: null });
      setHighlightedContent(null);
      setFileSize(null);
      setIsEditing(false);
    }
  }, [open]);

  // Syntax highlighting
  useEffect(() => {
    if (contentState.content && language !== "text") {
      try {
        const grammar = Prism.languages[language];
        if (grammar) {
          const highlighted = Prism.highlight(
            contentState.content,
            grammar,
            language,
          );
          setHighlightedContent(highlighted);
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

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

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

    // Update content state
    setContentState({ content: newContent, loading: false, error: null });
    setFileSize(data.size);
    setIsEditing(false);

    // Invalidate cache
    if (cacheKey) {
      await attachmentContentDB.deleteByID(cacheKey).catch(() => {});
    }

    // Notify inline preview to refresh
    dispatch(actions.notifyAttachmentModified({ url }));
  }, [url, cacheKey, dispatch]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <SwipeableDrawer
      anchor="right"
      open={open}
      onOpen={() => {}}
      onClose={handleClose}
      sx={{ displayPrint: "none" }}
    >
      <Box
        sx={{
          width: { xs: "100vw", sm: 500, md: 600 },
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <AttachFile />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {filename || "Attachment"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {languageDisplayName}
              {fileSize !== null && ` • ${formatFileSize(fileSize)}`}
            </Typography>
          </Box>
          <IconButton onClick={handleClose}>
            <Close />
          </IconButton>
        </Box>

        {/* Toolbar */}
        <Box
          sx={{
            p: 1,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            gap: 1,
          }}
        >
          <IconButton
            size="small"
            onClick={handleCopy}
            disabled={!contentState.content || isEditing}
            title={copied ? "Copied!" : "Copy to clipboard"}
          >
            <ContentCopy fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleDownload}
            disabled={isDownloading || isEditing}
            title="Download file"
          >
            {isDownloading
              ? <CircularProgress size={18} />
              : <Download fontSize="small" />}
          </IconButton>
          <IconButton
            size="small"
            onClick={handleRefresh}
            disabled={contentState.loading || isEditing}
            title="Refresh content"
          >
            <Refresh fontSize="small" />
          </IconButton>
          {canEdit && (
            <IconButton
              size="small"
              onClick={handleEdit}
              disabled={contentState.content === null || isEditing}
              title="Edit file"
              color={isEditing ? "primary" : "default"}
            >
              <Edit fontSize="small" />
            </IconButton>
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto", p: 0 }}>
          {/* Loading state */}
          {contentState.loading && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                p: 4,
              }}
            >
              <CircularProgress />
            </Box>
          )}

          {/* Error state */}
          {contentState.error && (
            <Box sx={{ p: 2 }}>
              <Alert
                severity="error"
                action={
                  <IconButton size="small" onClick={handleRefresh}>
                    <Refresh fontSize="small" />
                  </IconButton>
                }
              >
                {contentState.error}
              </Alert>
            </Box>
          )}

          {/* Editor mode */}
          {isEditing && contentState.content !== null && filename && mimetype &&
            (
              <AttachmentEditor
                initialContent={contentState.content}
                filename={filename}
                mimetype={mimetype}
                language={language}
                onSave={handleSave}
                onCancel={handleCancelEdit}
              />
            )}

          {/* View mode - Content */}
          {!isEditing && contentState.content && (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                bgcolor: "grey.50",
                minHeight: "100%",
                fontSize: "0.85rem",
                fontFamily: "monospace",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                "& .token.comment, & .token.prolog, & .token.doctype, & .token.cdata":
                  {
                    color: "#6a737d",
                  },
                "& .token.punctuation": {
                  color: "#24292e",
                },
                "& .token.property, & .token.tag, & .token.boolean, & .token.number, & .token.constant, & .token.symbol, & .token.deleted":
                  {
                    color: "#005cc5",
                  },
                "& .token.selector, & .token.attr-name, & .token.string, & .token.char, & .token.builtin, & .token.inserted":
                  {
                    color: "#22863a",
                  },
                "& .token.operator, & .token.entity, & .token.url": {
                  color: "#d73a49",
                },
                "& .token.atrule, & .token.attr-value, & .token.keyword": {
                  color: "#d73a49",
                },
                "& .token.function, & .token.class-name": {
                  color: "#6f42c1",
                },
                "& .token.regex, & .token.important, & .token.variable": {
                  color: "#e36209",
                },
              }}
            >
              {highlightedContent
                ? (
                  <code
                    className={`language-${language}`}
                    dangerouslySetInnerHTML={{ __html: highlightedContent }}
                  />
                )
                : <code>{contentState.content}</code>}
            </Box>
          )}

          {/* PDF preview */}
          {!isEditing && mimetype === "application/pdf" && url && (
            <iframe
              src={url}
              style={{ width: "100%", height: "100%", border: "none" }}
              title={filename || "PDF Preview"}
            />
          )}
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}
