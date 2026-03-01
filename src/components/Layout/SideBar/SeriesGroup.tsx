import React from "react";
import {
  Box,
  Collapse,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/components/PostsList/utils/seriesGrouping";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SafeNavigationLink } from "./SafeNavigationLink";

interface SeriesGroupProps {
  group: SeriesGroupItem & { series: Series };
  groupIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const SeriesGroup: React.FC<SeriesGroupProps> = ({
  group,
  groupIndex,
  isExpanded,
  onToggle,
  sidebarOpen,
  pathname,
  itemActions,
}) => {
  return (
    <Box sx={{ mt: groupIndex > 0 ? 0.5 : 0, mb: 0.5 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <Tooltip
          title={sidebarOpen ? "" : group.series.title}
          placement="right"
        >
          <ListItemButton
            component={SafeNavigationLink}
            href={`/series/${group.series.id}`}
            sx={{
              minHeight: 28,
              justifyContent: sidebarOpen ? "initial" : "center",
              px: 2.5,
              py: 0.25,
              "&:hover": {
                bgcolor: (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.04)",
              },
            }}
          >
            <ListItemIcon
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }}
              sx={{
                minWidth: 0,
                mr: sidebarOpen ? 1 : "auto",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {isExpanded ? (
                <ExpandLess
                  sx={{ fontSize: "0.85em", color: "text.secondary" }}
                />
              ) : (
                <ExpandMore
                  sx={{ fontSize: "0.85em", color: "text.secondary" }}
                />
              )}
            </ListItemIcon>
            {sidebarOpen && (
              <ListItemText
                primary={`${group.series.title} (${group.posts.length})`}
                primaryTypographyProps={{
                  fontSize: "0.7em",
                  fontWeight: 500,
                  color: "text.secondary",
                  sx: {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              />
            )}
          </ListItemButton>
        </Tooltip>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto">
        <Box
          sx={{
            ml: sidebarOpen ? 2.5 : 0,
            borderLeft: sidebarOpen ? "2px solid" : "none",
            borderLeftColor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(255, 255, 255, 0.2)"
                : "rgba(0, 0, 0, 0.15)",
          }}
        >
          {group.posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              inSeries
              sidebarOpen={sidebarOpen}
              pathname={pathname}
              itemActions={itemActions}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
