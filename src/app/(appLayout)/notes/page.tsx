"use client";
import NotesCanvas from "@/components/NotesCanvas";
import { Box } from "@mui/material";

export default function NotesPage() {
  return (
    <Box sx={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <NotesCanvas />
    </Box>
  );
}
