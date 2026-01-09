"use client";
import { useSidebarState } from "@/components/Layout/SideBar/hooks/useSidebarState";
import { useSidebarWidth } from "@/components/Layout/SideBar/SidebarWidthContext";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export default function ViewContainerWrapper(
  { children }: { children: React.ReactNode },
) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { open } = useSidebarState();
  const { getEffectiveWidth } = useSidebarWidth();

  // Calculate sidebar width dynamically using the unified context
  const sidebarWidth = isMobile ? 0 : getEffectiveWidth(open);

  // Calculate the offset needed to center content relative to the full viewport
  // We need to shift the content left by half the sidebar width to achieve true centering
  const centerOffset = sidebarWidth;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%", // Remove width constraints to match edit pages
        // Remove centering logic to match edit pages
        mx: 0,
        px: {
          xs: 0, // Let the parent AppLayout handle padding
          sm: 0,
          md: 0,
        },
        // Remove transitions since we're not changing layout anymore
      }}
    >
      {children}
    </Box>
  );
}
