import React from "react";
import RouterLink from "next/link";
import Image from "next/image";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarHeaderProps {
  open: boolean;
  toggleSidebarCompact: () => void;
  shortcutHint: string;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  open,
  toggleSidebarCompact,
  shortcutHint,
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
        borderBottom: "1px solid",
        borderColor: "divider",
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
        <Tooltip
          title={`${open ? "Collapse" : "Expand"} sidebar (${shortcutHint})`}
        >
          <IconButton
            size="small"
            onClick={toggleSidebarCompact}
            aria-label={`${open ? "Collapse" : "Expand"} sidebar`}
          >
            {open
              ? <ChevronLeft size={18} strokeWidth={2} />
              : <ChevronRight size={18} strokeWidth={2} />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
