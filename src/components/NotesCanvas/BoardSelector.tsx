"use client";
import { useRef, useState } from "react";
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

interface BoardSelectorProps {
  boards: CanvasSummary[];
  activeCanvasId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (name: string) => void;
  onRenameBoard: (id: string, name: string) => void;
  onDeleteBoard: (id: string) => void;
  // Zoom controls
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
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
  const { anchorEl: menuAnchor, menuOpen, openMenu, closeMenu } =
    useMenuState();
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardError, setNewBoardError] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleMenuOpen = (
    e: React.MouseEvent<HTMLElement>,
    boardId: string,
  ) => {
    e.stopPropagation();
    openMenu(e);
    setMenuBoardId(boardId);
  };

  const handleMenuClose = () => {
    closeMenu();
    setMenuBoardId(null);
  };

  const handleRenameClick = () => {
    const board = boards.find((b) => b.id === menuBoardId);
    if (board) {
      setRenamingId(board.id);
      setRenameValue(board.name);
    }
    handleMenuClose();
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameBoard(renamingId, trimmed);
    }
    setRenamingId(null);
    setRenameValue("");
  };

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

  const handleAddClick = () => {
    setAddingBoard(true);
    setNewBoardName("");
    setNewBoardError("");
    setTimeout(() => addInputRef.current?.focus(), 50);
  };

  const handleAddSubmit = () => {
    const trimmed = newBoardName.trim();
    if (!trimmed) {
      setNewBoardError("Name cannot be empty");
      return;
    }
    onCreateBoard(trimmed);
    setAddingBoard(false);
    setNewBoardName("");
    setNewBoardError("");
  };

  const handleAddCancel = () => {
    setAddingBoard(false);
    setNewBoardName("");
    setNewBoardError("");
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
                    if (e.key === "Escape") {
                      setRenamingId(null);
                      setRenameValue("");
                    }
                    e.stopPropagation();
                  }}
                  onBlur={handleRenameSubmit}
                  InputProps={{
                    disableUnderline: false,
                    sx: {
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      width: 100,
                    },
                  }}
                />
              )
              : (
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 0.25 }}
                >
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

      {/* Add board inline */}
      {addingBoard
        ? (
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
                setNewBoardName(e.target.value);
                if (newBoardError) setNewBoardError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSubmit();
                if (e.key === "Escape") handleAddCancel();
              }}
              sx={{
                width: 140,
                "& .MuiInputBase-input": {
                  py: 0.5,
                  fontSize: "0.8125rem",
                },
              }}
            />
            <Button
              size="small"
              variant="contained"
              disableElevation
              onClick={handleAddSubmit}
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
              onClick={handleAddCancel}
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
        )
        : (
          <Tooltip title="New board">
            <IconButton
              size="small"
              onClick={handleAddClick}
              sx={{ flexShrink: 0 }}
            >
              <Add sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}

      {/* Zoom controls pill — shown when zoom props are provided */}
      {(onZoomIn || onZoomOut) && (
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
      )}

      {/* Context menu for active board */}
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        slotProps={{ paper: { elevation: 2 } }}
      >
        <MenuItem onClick={handleRenameClick} dense>
          <DriveFileRenameOutline sx={{ fontSize: 16, mr: 1 }} />
          Rename
        </MenuItem>
        <MenuItem
          onClick={handleDeleteClick}
          dense
          disabled={boards.length <= 1}
          sx={{ color: boards.length > 1 ? "error.main" : undefined }}
        >
          <Delete sx={{ fontSize: 16, mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
}
