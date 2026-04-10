"use client";
import { Box, CircularProgress, IconButton } from "@mui/material";
import { ContentCopy, Download, Edit, Refresh } from "@mui/icons-material";

interface AttachmentToolbarProps {
  canEdit: boolean;
  hasContent: boolean;
  isEditing: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onRefresh: () => void;
  onEdit: () => void;
}

export default function AttachmentToolbar({
  canEdit,
  hasContent,
  isEditing,
  isLoading,
  isDownloading,
  copied,
  onCopy,
  onDownload,
  onRefresh,
  onEdit,
}: AttachmentToolbarProps) {
  return (
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
        onClick={onCopy}
        disabled={!hasContent || isEditing}
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        <ContentCopy fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={onDownload}
        disabled={isDownloading || isEditing}
        title="Download file"
      >
        {isDownloading
          ? <CircularProgress size={18} />
          : <Download fontSize="small" />}
      </IconButton>
      <IconButton
        size="small"
        onClick={onRefresh}
        disabled={isLoading || isEditing}
        title="Refresh content"
      >
        <Refresh fontSize="small" />
      </IconButton>
      {canEdit && (
        <IconButton
          size="small"
          onClick={onEdit}
          disabled={!hasContent || isEditing}
          title="Edit file"
          color={isEditing ? "primary" : "default"}
        >
          <Edit fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
