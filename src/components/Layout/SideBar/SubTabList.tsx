"use client";
import React from "react";
import { Box } from "@mui/material";
import { actions, useDispatch } from "@/store";

export interface SubTabEntry {
  id: string;
  name: string;
  dirty: boolean;
}

interface SubTabListProps {
  tabs: SubTabEntry[];
  activeTabId: string | null;
}

export const SubTabList: React.FC<SubTabListProps> = (
  { tabs, activeTabId },
) => {
  const dispatch = useDispatch();

  return (
    <Box
      component="ul"
      aria-label="Sub-document tabs"
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        pl: "22px",
        ml: "20px",
        mb: 0.5,
        borderLeft: "1.5px dashed",
        borderLeftColor: "info.main",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <Box
            key={tab.id}
            component="li"
            role="button"
            tabIndex={0}
            onClick={() => dispatch(actions.setActiveTab(tab.id))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dispatch(actions.setActiveTab(tab.id));
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              py: "3px",
              px: "7px",
              borderRadius: "5px",
              fontSize: "0.72em",
              cursor: "pointer",
              color: isActive ? "info.main" : "text.secondary",
              fontWeight: isActive ? 700 : 400,
              bgcolor: isActive
                ? "rgba(var(--mui-palette-info-mainChannel) / 0.12)"
                : "transparent",
              "&:hover": {
                bgcolor: isActive
                  ? "rgba(var(--mui-palette-info-mainChannel) / 0.18)"
                  : "action.hover",
              },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 6,
                height: 6,
                borderRadius: "2px",
                flexShrink: 0,
                bgcolor: isActive ? "info.main" : "info.light",
              }}
            />
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {tab.name}
            </Box>
            {tab.dirty && (
              <Box
                component="span"
                aria-label="Unsaved"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "info.main",
                  flexShrink: 0,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
};
