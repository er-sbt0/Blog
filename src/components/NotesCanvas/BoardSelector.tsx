"use client";
import { useState } from "react";
import { useMenuState } from "@/hooks/useMenuState";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Delete,
  DriveFileRenameOutline,
  MoreHoriz,
  ZoomIn,
  ZoomOut,
} from "@mui/icons-material";
import { CanvasSummary } from "@/types/notes";
import { useRenameBoardState } from "./hooks/useRenameBoardState";
import { useAddBoardState } from "./hooks/useAddBoardState";

interface BoardSelectorProps {
  boards: CanvasSummary[];
  activeCanvasId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (name: string) => void;
  onRenameBoard: (id: string, name: string) => void;
  onDeleteBoard: (id: string) => void;
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
}

interface ZoomControlsProps {
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
}

function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canZoomIn = true,
  canZoomOut = true,
}: ZoomControlsProps) {
  return (
    <>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "14px",
          overflow: "hidden",
          height: 28,
          flexShrink: 0,
        }}
      >
        <Tooltip title="Zoom out (Ctrl + −)">
          <span>
            <IconButton
              size="small"
              onClick={onZoomOut}
              disabled={!canZoomOut}
              sx={{ borderRadius: 0, px: 0.5, height: "100%" }}
            >
              <ZoomOut sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Reset zoom (Ctrl + 0)">
          <Typography
            variant="caption"
            onClick={onResetZoom}
            sx={{
              px: 0.25,
              minWidth: 32,
              textAlign: "center",
              fontWeight: 600,
              fontSize: "11px",
              color: "text.secondary",
              cursor: "pointer",
              userSelect: "none",
              lineHeight: 1,
              "&:hover": { color: "text.primary" },
            }}
          >
            {Math.round((scale ?? 1) * 100)}%
          </Typography>
        </Tooltip>
        <Tooltip title="Zoom in (Ctrl + =)">
          <span>
            <IconButton
              size="small"
              onClick={onZoomIn}
              disabled={!canZoomIn}
              sx={{ borderRadius: 0, px: 0.5, height: "100%" }}
            >
              <ZoomIn sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </>
  );
}

interface BoardContextMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onRenameClick: () => void;
  onDeleteClick: () => void;
  canDelete: boolean;
}

function BoardContextMenu({
  anchorEl,
  open,
  onClose,
  onRenameClick,
  onDeleteClick,
  canDelete,
}: BoardContextMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{ paper: { elevation: 2 } }}
    >
      <MenuItem onClick={onRenameClick} dense>
        <DriveFileRenameOutline sx={{ fontSize: 16, mr: 1 }} />
        Rename
      </MenuItem>
      <MenuItem
        onClick={onDeleteClick}
        dense
        disabled={!canDelete}
        sx={{ color: canDelete ? "error.main" : undefined }}
      >
        <Delete sx={{ fontSize: 16, mr: 1 }} />
        Delete
      </MenuItem>
    </Menu>
  );
}

interface AddBoardSectionProps {
  addingBoard: boolean;
  newBoardName: string;
  newBoardError: string;
  addInputRef: React.RefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onErrorClear: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onAddClick: () => void;
}

function AddBoardSection({
  addingBoard,
  newBoardName,
  newBoardError,
  addInputRef,
  onNameChange,
  onErrorClear,
  onSubmit,
  onCancel,
  onAddClick,
}: AddBoardSectionProps) {
  if (addingBoard) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          flexShrink: 0,
          ml: 0.5,
        }}
      >
        <TextField
          inputRef={addInputRef}
          value={newBoardName}
          size="small"
          placeholder="Board name"
          error={!!newBoardError}
          autoFocus
          onChange={(e) => {
            onNameChange(e.target.value);
            if (newBoardError) onErrorClear();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          sx={{
            width: 140,
            "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8125rem" },
          }}
        />
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={onSubmit}
          sx={{
            minWidth: "auto",
            px: 1.5,
            py: 0.5,
            fontSize: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          Add
        </Button>
        <Button
          size="small"
          onClick={onCancel}
          sx={{
            minWidth: "auto",
            px: 1,
            py: 0.5,
            fontSize: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          Cancel
        </Button>
      </Box>
    );
  }
  return (
    <Tooltip title="New board">
      <IconButton size="small" onClick={onAddClick} sx={{ flexShrink: 0 }}>
        <Add sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

export default function BoardSelector({
  boards,
  activeCanvasId,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canZoomIn = true,
  canZoomOut = true,
}: BoardSelectorProps) {
  const { anchorEl: menuAnchor, menuOpen, openMenu, closeMenu } = useMenuState();
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, boardId: string) => {
    e.stopPropagation();
    openMenu(e);
    setMenuBoardId(boardId);
  };

  const handleMenuClose = () => {
    closeMenu();
    setMenuBoardId(null);
  };

  const {
    renamingId,
    renameValue,
    renameInputRef,
    setRenameValue,
    handleRenameClick,
    handleRenameSubmit,
    cancelRename,
  } = useRenameBoardState(onRenameBoard, handleMenuClose);

  const {
    addingBoard,
    newBoardName,
    newBoardError,
    addInputRef,
    setNewBoardName,
    setNewBoardError,
    handleAddClick,
    handleAddSubmit,
    handleAddCancel,
  } = useAddBoardState(onCreateBoard);

  const handleDeleteClick = () => {
    if (menuBoardId && boards.length > 1) {
      const board = boards.find((b) => b.id === menuBoardId);
      if (
        board &&
        window.confirm(
          `Delete board "${board.name}"? All notes on this board will be permanently lost.`,
        )
      ) {
        onDeleteBoard(menuBoardId);
      }
    }
    handleMenuClose();
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Tabs
        value={activeCanvasId ?? false}
        onChange={(_e, v) => v && onSelectBoard(v as string)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          minHeight: 32,
          flex: 1,
          minWidth: 0,
          "& .MuiTabs-indicator": { height: 2, borderRadius: "2px 2px 0 0" },
          "& .MuiTabs-flexContainer": { gap: 0.25 },
          "& .MuiTab-root": {
            minHeight: 32,
            px: 1.5,
            py: 0,
            fontSize: "0.8125rem",
            fontWeight: 500,
            textTransform: "none",
            letterSpacing: 0,
            minWidth: "auto",
          },
        }}
      >
        {boards.map((board) => (
          <Tab
            key={board.id}
            value={board.id}
            label={renamingId === board.id
              ? (
                <TextField
                  inputRef={renameInputRef}
                  value={renameValue}
                  size="small"
                  variant="standard"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                    if (e.key === "Escape") cancelRename();
                    e.stopPropagation();
                  }}
                  onBlur={handleRenameSubmit}
                  InputProps={{
                    disableUnderline: false,
                    sx: { fontSize: "0.8125rem", fontWeight: 500, width: 100 },
                  }}
                />
              )
              : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                  <span>{board.name}</span>
                  {activeCanvasId === board.id && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, board.id)}
                      sx={{
                        p: "2px",
                        ml: 0.25,
                        opacity: 0.5,
                        "&:hover": { opacity: 1 },
                      }}
                    >
                      <MoreHoriz sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              )}
          />
        ))}
      </Tabs>

      <AddBoardSection
        addingBoard={addingBoard}
        newBoardName={newBoardName}
        newBoardError={newBoardError}
        addInputRef={addInputRef}
        onNameChange={setNewBoardName}
        onErrorClear={() => setNewBoardError("")}
        onSubmit={handleAddSubmit}
        onCancel={handleAddCancel}
        onAddClick={handleAddClick}
      />

      {(onZoomIn || onZoomOut) && (
        <ZoomControls
          scale={scale}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
        />
      )}

      <BoardContextMenu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        onRenameClick={() => handleRenameClick(boards, menuBoardId)}
        onDeleteClick={handleDeleteClick}
        canDelete={boards.length > 1}
      />
    </Box>
  );
}
