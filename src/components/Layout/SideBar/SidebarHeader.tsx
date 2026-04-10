import React from "react";
import RouterLink from "next/link";
import Image from "next/image";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Add, ChevronLeft, ChevronRight, Remove } from "@mui/icons-material";

interface SidebarHeaderProps {
  open: boolean;
  sidebarFontSize: number;
  toggleSidebar: () => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  open,
  sidebarFontSize,
  toggleSidebar,
  increaseFontSize,
  decreaseFontSize,
  resetFontSize,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        padding: theme.spacing(1, 1),
        justifyContent: open ? "space-between" : "center",
        flexShrink: 0,
        minHeight: 64,
      }}
    >
      {open && (
        <Box
          component={RouterLink}
          href="/"
          sx={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Image src="/logo.svg" alt="Editor Logo" width={32} height={32} />
          <Box sx={{ ml: 1, fontWeight: "bold", fontSize: "1.2em" }}>Blog</Box>
        </Box>
      )}
      {!open && (
        <Tooltip title="Blog">
          <Box
            component={RouterLink}
            href="/"
            sx={{ display: "flex", justifyContent: "center" }}
          >
            <Image src="/logo.svg" alt="Blog Logo" width={32} height={32} />
          </Box>
        </Tooltip>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {open && (
          <>
            <Tooltip title="Decrease font size">
              <IconButton
                size="small"
                onClick={decreaseFontSize}
                disabled={sidebarFontSize <= 10}
                aria-label="Decrease sidebar font size"
              >
                <Remove fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={`Font size: ${sidebarFontSize}px (click to reset)`}
            >
              <IconButton
                size="small"
                onClick={resetFontSize}
                aria-label="Reset sidebar font size"
                sx={{
                  fontSize: "0.7em",
                  minWidth: "32px",
                  fontWeight: sidebarFontSize !== 16 ? "bold" : "normal",
                }}
              >
                {sidebarFontSize}
              </IconButton>
            </Tooltip>
            <Tooltip title="Increase font size">
              <IconButton
                size="small"
                onClick={increaseFontSize}
                disabled={sidebarFontSize >= 24}
                aria-label="Increase sidebar font size"
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip
          title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+\\)`}
        >
          <IconButton
            onClick={toggleSidebar}
            aria-label={`${open ? "Collapse" : "Expand"} sidebar`}
          >
            {open ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
