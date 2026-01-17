"use client";
import NotesCanvas from "@/components/NotesCanvas";
import { Box } from "@mui/material";

export default function NotesPage() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <NotesCanvas />
    </Box>
  );
}
