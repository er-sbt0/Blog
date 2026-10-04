"use client";
/**
 * One row of the sessions tree — a host, a project, a session or a subagent
 * run. Composes the shared tree-row vocabulary (`@/theme/treeRow`, DESIGN.md
 * §17.3) and the sidebar's square band and em ladder (`SideBar/constants`)
 * rather than restating them.
 *
 * The row's own controls (Sync, the subagent toggle, the actions menu) sit
 * *beside* the main button, not inside it: the main button can be a link, and a
 * button nested in an anchor is invalid and unreachable by keyboard.
 */
import React from "react";
import { Box, ListItemButton, Typography } from "@mui/material";
import { SafeNavigationLink } from "@/components/Layout/SideBar/SafeNavigationLink";
import { SB_FONT, SB_ITEM_RADIUS } from "@/components/Layout/SideBar/constants";
import {
  chromeFocusRingSx,
  ROW_TRANSITION,
  rowHoverRevealSx,
  rowTextSelectSx,
} from "@/theme/treeRow";

interface SessionTreeRowProps {
  depth: number;
  icon: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Shown after the label, inside the button (badges, counts). */
  trailing?: React.ReactNode;
  /** Beside the button; revealed on hover or focus unless `actionsVisible`. */
  actions?: React.ReactNode;
  actionsVisible?: boolean;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  expanded?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  title?: string;
}

export const SessionTreeRow: React.FC<SessionTreeRowProps> = ({
  depth,
  icon,
  primary,
  secondary,
  trailing,
  actions,
  actionsVisible,
  href,
  onClick,
  selected,
  expanded,
  onContextMenu,
  title,
}) => {
  const linkProps = href
    ? { component: SafeNavigationLink, href }
    : { component: "div" as const };
  return (
    <Box
      onContextMenu={onContextMenu}
      sx={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        borderRadius: SB_ITEM_RADIUS,
        transition: ROW_TRANSITION,
        bgcolor: selected ? "accent.tint" : "transparent",
        "&:hover": { bgcolor: selected ? "accent.tint" : "action.hover" },
        ...rowHoverRevealSx,
        "& .row-actions-btn": {
          opacity: actionsVisible ? 1 : 0,
          transition: ROW_TRANSITION,
        },
        "&:focus-within .row-actions-btn": { opacity: 1 },
      }}
    >
      <ListItemButton
        {...linkProps}
        onClick={onClick}
        aria-expanded={expanded}
        aria-current={selected ? "page" : undefined}
        title={title}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 26,
          pl: 2 + depth * 1.5,
          pr: 0.5,
          py: 0.25,
          gap: 0.75,
          alignItems: "center",
          borderRadius: SB_ITEM_RADIUS,
          ...rowTextSelectSx,
          "&:hover": { bgcolor: "transparent" },
          ...chromeFocusRingSx(),
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            display: "flex",
            flexShrink: 0,
            color: selected ? "accent.activeText" : "text.secondary",
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="div"
            noWrap
            sx={{
              fontSize: SB_FONT.meta,
              fontWeight: 500,
              color: selected ? "accent.activeText" : "text.primary",
            }}
          >
            {primary}
          </Typography>
          {secondary && (
            <Typography
              component="div"
              noWrap
              sx={{ fontSize: SB_FONT.meta, color: "text.disabled" }}
            >
              {secondary}
            </Typography>
          )}
        </Box>
        {trailing}
      </ListItemButton>
      {actions && (
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0, pr: 0.5 }}>
          {actions}
        </Box>
      )}
    </Box>
  );
};
