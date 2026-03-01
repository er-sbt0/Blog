"use client";
import React, { useEffect } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from "@mui/material";
import { UserDocument } from "@/types";
import { useDirectoryBrowser } from "./hooks/useDirectoryBrowser";
import DirectoryBrowserContent from "./DirectoryBrowserContent";

interface MoveToDialogProps {
  open: boolean;
  onClose: () => void;
  userDocument: UserDocument;
}

const MoveToDialog: React.FC<MoveToDialogProps> = ({ open, onClose, userDocument }) => {
  const {
    documents,
    documentName,
    currentParentId,
    loading,
    currentDirectoryId,
    directories,
    breadcrumbs,
    loadDirectories,
    handleMove,
  } = useDirectoryBrowser(userDocument);

  useEffect(() => {
    if (open) loadDirectories(null);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        onClose();
      }}
      maxWidth="sm"
      fullWidth
      aria-labelledby="move-dialog-title"
      disableEscapeKeyDown
      keepMounted
      data-testid="move-dialog"
    >
      <DialogTitle id="move-dialog-title">Move Document: {documentName}</DialogTitle>

      <DialogContent dividers>
        <DirectoryBrowserContent
          documentName={documentName}
          currentParentId={currentParentId}
          currentDirectoryId={currentDirectoryId}
          directories={directories}
          breadcrumbs={breadcrumbs}
          loading={loading}
          documents={documents}
          onMove={() => handleMove(onClose)}
          onDirectoryClick={loadDirectories}
          onBreadcrumbClick={loadDirectories}
        />

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="body2" color="text.secondary">
            Current location:{" "}
            {currentParentId
              ? documents.find((d) => d.id === currentParentId)?.local?.name ||
                documents.find((d) => d.id === currentParentId)?.cloud?.name ||
                "Unknown"
              : "Root"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            New location:{" "}
            {currentDirectoryId
              ? documents.find((d) => d.id === currentDirectoryId)?.local?.name ||
                documents.find((d) => d.id === currentDirectoryId)?.cloud?.name ||
                "Unknown"
              : "Root"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} data-testid="move-cancel-button">
          Cancel
        </Button>
        <Button
          onClick={() => handleMove(onClose)}
          variant="contained"
          color="primary"
          disabled={loading || currentDirectoryId === currentParentId}
          data-testid="move-confirm-button"
        >
          {loading ? "Moving..." : "Move"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MoveToDialog;
