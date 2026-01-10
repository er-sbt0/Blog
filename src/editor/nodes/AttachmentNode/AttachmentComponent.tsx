"use client";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
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
  Code,
  Delete,
  Description,
  Download,
  ExpandLess,
  ExpandMore,
  InsertDriveFile,
  OpenInNew,
  PictureAsPdf,
} from "@mui/icons-material";
import { downloadFile } from "@/utils/downloadFile";
import { formatSize } from "@/utils/formatSize";
import AttachmentPreview from "./AttachmentPreview";
import { actions, useDispatch } from "@/store";

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
  expanded,
  editing,
}: {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  nodeKey: NodeKey;
  expanded: boolean;
  editing: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const dispatch = useDispatch();
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

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isAttachmentNode(node)) {
          node.toggleExpanded();
        }
        return true;
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
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $onEnter,
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [
    clearSelection,
    editor,
    isSelected,
    nodeKey,
    $onDelete,
    $onEnter,
    onClick,
  ]);

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
      await downloadFile(url, filename);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAttachmentNode(node)) {
        node.toggleExpanded();
      }
    });
  }, [editor, nodeKey]);

  const handleOpenInSidebar = useCallback(() => {
    dispatch(actions.openAttachmentPreview({
      nodeKey,
      url,
      filename,
      mimetype,
    }));
  }, [dispatch, nodeKey, url, filename, mimetype]);

  return (
    <Card
      sx={{
        display: "flex",
        flexDirection: "column",
        maxWidth: expanded ? 600 : 400,
        width: expanded ? "100%" : "auto",
        my: 1,
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? "primary.main" : "divider",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.2s ease-in-out",
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
          "&:last-child": { pb: expanded ? 1 : 2 },
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
            {getFileType(mimetype, filename)} • {formatSize(size)}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={handleToggleExpand}
            title={expanded ? "Collapse preview" : "Expand preview"}
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
          <IconButton
            size="small"
            onClick={handleDownload}
            color="primary"
            title="Download file"
            disabled={isDownloading}
          >
            {isDownloading ? <CircularProgress size={20} /> : <Download />}
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenInSidebar();
            }}
            title="Open in sidebar"
          >
            <OpenInNew />
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

      {/* Preview section */}
      <AttachmentPreview
        url={url}
        filename={filename}
        mimetype={mimetype}
        size={size}
        expanded={expanded}
        nodeKey={nodeKey}
        onOpenInSidebar={handleOpenInSidebar}
      />
    </Card>
  );
}
