"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  MenuItem,
  Popover,
  Typography,
} from "@mui/material";
import { DriveFileMove } from "@mui/icons-material";
import { ListItemIcon, ListItemText } from "@mui/material";
import { UserDocument } from "@/types";
import { useDirectoryBrowser } from "./hooks/useDirectoryBrowser";
import DirectoryBrowserContent from "./DirectoryBrowserContent";

interface MoveProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "button";
  closeMenu?: () => void;
}

const Move: React.FC<MoveProps> = ({ userDocument, variant = "menuitem", closeMenu }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuItemRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

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

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    if (closeMenu) closeMenu();
  };

  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem onClick={handleOpen} data-testid="move-menu-item" ref={menuItemRef}>
            <ListItemIcon>
              <DriveFileMove fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move to...</ListItemText>
          </MenuItem>
        )
        : (
          <Button
            startIcon={<DriveFileMove />}
            onClick={handleOpen}
            variant="outlined"
            size="small"
            data-testid="move-button"
            ref={buttonRef}
          >
            Move to
          </Button>
        )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "center", horizontal: "right" }}
        transformOrigin={{ vertical: "center", horizontal: "left" }}
        PaperProps={{
          sx: { width: 400, maxHeight: 500, p: 2, overflow: "hidden" },
          onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation(),
        }}
        data-testid="move-popover"
        disableRestoreFocus
      >
        <DirectoryBrowserContent
          documentName={documentName}
          currentParentId={currentParentId}
          currentDirectoryId={currentDirectoryId}
          directories={directories}
          breadcrumbs={breadcrumbs}
          loading={loading}
          documents={documents}
          onMove={() => handleMove(handleClose)}
          onDirectoryClick={loadDirectories}
          onBreadcrumbClick={loadDirectories}
          compact
        />

        <Divider sx={{ my: 1 }} />

        <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between" }}>
          <Button onClick={handleClose} size="small" data-testid="move-cancel-button">
            Cancel
          </Button>
          <Button
            onClick={() => handleMove(handleClose)}
            variant="contained"
            color="primary"
            size="small"
            disabled={loading}
            data-testid="move-confirm-button"
          >
            {loading ? "Moving..." : "Move Here"}
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default Move;
