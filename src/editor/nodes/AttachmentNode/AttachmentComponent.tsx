"use client";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  NodeKey,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import { $isAttachmentNode } from ".";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Typography,
} from "@mui/material";
import {
  Archive,
  AttachFile,
  Code,
  Delete,
  Description,
  Download,
  InsertDriveFile,
  PictureAsPdf,
} from "@mui/icons-material";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function getFileIcon(mimetype: string) {
  if (mimetype.startsWith("application/pdf")) return <PictureAsPdf />;
  if (
    mimetype.includes("zip") || mimetype.includes("tar") ||
    mimetype.includes("rar")
  ) {
    return <Archive />;
  }
  if (mimetype.startsWith("text/") || mimetype.includes("script")) {
    return <Code />;
  }
  if (mimetype.includes("document") || mimetype.includes("word")) {
    return <Description />;
  }
  return <InsertDriveFile />;
}

function getFileType(mimetype: string, filename: string): string {
  // Get extension from filename
  const ext = filename.split(".").pop()?.toUpperCase();

  if (mimetype.startsWith("application/pdf")) return "PDF";
  if (mimetype.includes("zip")) return "ZIP";
  if (mimetype.includes("tar")) return "TAR";
  if (mimetype.includes("shell") || ext === "SH") return "Shell Script";
  if (mimetype.includes("javascript") || ext === "JS") return "JavaScript";
  if (mimetype.includes("typescript") || ext === "TS") return "TypeScript";
  if (mimetype.includes("python") || ext === "PY") return "Python";
  if (ext) return ext;

  return "File";
}

export default function AttachmentComponent({
  url,
  filename,
  mimetype,
  size,
  nodeKey,
}: {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(
    nodeKey,
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isAttachmentNode(node)) {
          node.remove();
        }
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const onClick = useCallback(
    (event: MouseEvent) => {
      // Don't select if clicking on download button
      if ((event.target as HTMLElement).closest("a")) {
        return false;
      }
      return false;
    },
    [],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [clearSelection, editor, isSelected, nodeKey, $onDelete, onClick]);

  const handleDelete = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAttachmentNode(node)) {
        node.remove();
      }
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDownloading(true);

    try {
      // Use XMLHttpRequest instead of fetch to avoid Next.js router interception
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "blob";

      xhr.onload = function () {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
          setIsDownloading(false);
        } else {
          console.error("Download failed:", xhr.status);
          setIsDownloading(false);
        }
      };

      xhr.onerror = function () {
        console.error("Download error");
        setIsDownloading(false);
      };

      xhr.send();
    } catch (error) {
      console.error("Download error:", error);
      setIsDownloading(false);
    }
  };

  return (
    <Card
      sx={{
        display: "inline-flex",
        maxWidth: 400,
        my: 1,
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? "primary.main" : "divider",
        cursor: "pointer",
        userSelect: "none",
      }}
      onClick={(e) => {
        // Only select if clicking on the card itself, not buttons
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        if (!isSelected) {
          setSelected(true);
        }
      }}
    >
      <CardContent
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2,
          "&:last-child": { pb: 2 },
        }}
      >
        <Box
          sx={{ color: "primary.main", display: "flex", alignItems: "center" }}
        >
          {getFileIcon(mimetype)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" noWrap sx={{ fontWeight: 500 }}>
            {filename}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {getFileType(mimetype, filename)} • {formatFileSize(size)}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            size="small"
            onClick={handleDownload}
            color="primary"
            title="Download file"
            disabled={isDownloading}
          >
            {isDownloading ? <CircularProgress size={20} /> : <Download />}
          </IconButton>
          {isSelected && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              color="error"
              title="Delete attachment"
            >
              <Delete />
            </IconButton>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
