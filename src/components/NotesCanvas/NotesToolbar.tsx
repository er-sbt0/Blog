"use client";
import { Box, SpeedDial, SpeedDialAction, SpeedDialIcon } from "@mui/material";
import { Add, Palette } from "@mui/icons-material";
import { useState } from "react";

interface NotesToolbarProps {
  onAddNote: (color: string) => void;
  onClearAll?: () => void;
}

const NOTE_COLORS = [
  { name: "Yellow", value: "yellow", icon: "🟡" },
  { name: "Pink", value: "pink", icon: "🩷" },
  { name: "Blue", value: "blue", icon: "🔵" },
  { name: "Green", value: "green", icon: "🟢" },
  { name: "Orange", value: "orange", icon: "🟠" },
  { name: "Purple", value: "purple", icon: "🟣" },
  { name: "Mint", value: "mint", icon: "🟢" },
  { name: "Peach", value: "peach", icon: "🔴" },
];

const COLOR_GRADIENTS = {
  yellow: "linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)",
  pink: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
  blue: "linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)",
  green: "linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)",
  orange: "linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)",
  purple: "linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)",
  mint: "linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 100%)",
  peach: "linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)",
};

export default function NotesToolbar(
  { onAddNote, onClearAll }: NotesToolbarProps,
) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
      }}
    >
      {/* Speed Dial for Color Selection */}
      <SpeedDial
        ariaLabel="Add note"
        icon={<SpeedDialIcon icon={<Add />} openIcon={<Palette />} />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        direction="up"
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
        {NOTE_COLORS.map((color) => (
          <SpeedDialAction
            key={color.value}
            icon={
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: COLOR_GRADIENTS[
                    color.value as keyof typeof COLOR_GRADIENTS
                  ],
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
