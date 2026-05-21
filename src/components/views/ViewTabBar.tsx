"use client";
import { Box, Typography } from "@mui/material";
import type { TabMeta } from "@/components/EditDocument/EditorTabBar";

interface ViewTabBarProps {
  tabs: TabMeta[];
  activeTabId: string;
  onSwitch: (tabId: string) => void;
}

const ViewTabBar: React.FC<ViewTabBarProps> = ({ tabs, activeTabId, onSwitch }) => {
  if (tabs.length <= 1) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid",
        borderColor: "divider",
        mb: 2,
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        "&::-webkit-scrollbar": { height: 3 },
        "&::-webkit-scrollbar-thumb": { bgcolor: "divider" },
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <Box
            key={tab.id}
            onClick={() => onSwitch(tab.id)}
            sx={{
              display: "flex",
              alignItems: "center",
              px: 2,
              py: 1,
              minWidth: 80,
              maxWidth: 200,
              cursor: "pointer",
              userSelect: "none",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: isActive ? "background.paper" : "action.hover",
              borderBottom: "2px solid",
              borderBottomColor: isActive ? "primary.main" : "transparent",
              transition: "background-color 0.15s",
              flexShrink: 0,
              "&:hover": {
                bgcolor: isActive ? "background.paper" : "action.selected",
              },
            }}
          >
            <Typography
              noWrap
              sx={{
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "text.primary" : "text.secondary",
              }}
            >
              {tab.name}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default ViewTabBar;
