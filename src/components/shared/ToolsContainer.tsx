"use client";
import { ReactNode } from "react";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";
import { Box, SxProps, Theme } from "@mui/material";

interface ToolsContainerProps {
  id: string;
  children: ReactNode;
  priority?: number;
  sx?: SxProps<Theme>;
}

// This component can be used to wrap tool components that need to be floating
export default function ToolsContainer(
  { id, children, priority = 15, sx }: ToolsContainerProps,
) {
  return (
    <FloatingActionButton id={id} priority={priority}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          ...sx,
        }}
      >
        {children}
      </Box>
    </FloatingActionButton>
  );
}
