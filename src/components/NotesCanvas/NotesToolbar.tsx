"use client";
import {
  Box,
  IconButton,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Palette, ZoomIn, ZoomOut } from "@mui/icons-material";
import { useState } from "react";
import { NOTE_COLOR_LIST, NOTE_COLORS } from "./noteColors";

interface NotesToolbarProps {
  onAddNote: (color: string) => void;
  onClearAll?: () => void;
  scale?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
}

export default function NotesToolbar({
  onAddNote,
  onClearAll,
  scale = 1,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canZoomIn = true,
  canZoomOut = true,
}: NotesToolbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 1,
      }}
    >
      {/* Zoom controls pill */}
      {(onZoomIn || onZoomOut) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            overflow: "hidden",
            height: 40,
            mb: "0px",
          }}
        >
          <Tooltip title="Zoom out (Ctrl + −)">
            <span>
              <IconButton
                size="small"
                onClick={onZoomOut}
                disabled={!canZoomOut}
                sx={{ borderRadius: 0, px: 0.75, height: "100%" }}
              >
                <ZoomOut sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset zoom (Ctrl + 0)">
            <Typography
              variant="caption"
              onClick={onResetZoom}
              sx={{
                px: 0.5,
                minWidth: 36,
                textAlign: "center",
                fontWeight: 600,
                fontSize: "11px",
                color: "text.secondary",
                cursor: "pointer",
                userSelect: "none",
                "&:hover": { color: "text.primary" },
              }}
            >
              {Math.round(scale * 100)}%
            </Typography>
          </Tooltip>
          <Tooltip title="Zoom in (Ctrl + =)">
            <span>
              <IconButton
                size="small"
                onClick={onZoomIn}
                disabled={!canZoomIn}
                sx={{ borderRadius: 0, px: 0.75, height: "100%" }}
              >
                <ZoomIn sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      {/* Speed Dial for Color Selection */}
      <SpeedDial
        ariaLabel="Add note"
        icon={<SpeedDialIcon icon={<Add />} openIcon={<Palette />} />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        direction="up"
        FabProps={{ size: "small" }}
        sx={{
          "& .MuiFab-primary": {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)",
            "&:hover": {
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 6px 30px rgba(102, 126, 234, 0.5)",
            },
          },
        }}
      >
        {NOTE_COLOR_LIST.map((color) => (
          <SpeedDialAction
            key={color.value}
            icon={
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: NOTE_COLORS[color.value],
                  border: "2px solid white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              />
            }
            tooltipTitle={color.name}
            onClick={() => {
              onAddNote(color.value);
              setOpen(false);
            }}
            sx={{
              "& .MuiSpeedDialAction-fab": {
                background: "white",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                "&:hover": {
                  background: "white",
                  transform: "scale(1.1)",
                },
              },
            }}
          />
        ))}
      </SpeedDial>
    </Box>
  );
}
