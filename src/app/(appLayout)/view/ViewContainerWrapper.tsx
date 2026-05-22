"use client";
import { Box } from "@mui/material";

export default function ViewContainerWrapper(
  { children }: { children: React.ReactNode },
) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
        mx: 0,
      }}
    >
      {children}
    </Box>
  );
}
