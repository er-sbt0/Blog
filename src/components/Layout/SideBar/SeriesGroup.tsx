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
import { ChevronRight, ExpandMore } from "@mui/icons-material";
import type { Series } from "@/types";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
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
  const hasAnyDirtyChild = group.posts.some(
    (post) =>
      Boolean(post.local) &&
      Boolean(post.cloud) &&
      post.local!.head !== post.cloud!.head,
  );

  return (
    <Box sx={{ mt: groupIndex > 0 ? 0.5 : 0, mb: 0.5 }}>
      <ListItem disablePadding sx={{ display: "block" }}>
        <Tooltip
          title={sidebarOpen ? "" : group.series.title}
          placement="right"
        >
          <ListItemButton
            component={SafeNavigationLink}
            href={`/posts/${group.series.id}`}
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
              {isExpanded
                ? (
                  <ExpandMore
                    sx={{ fontSize: "0.85em", color: "text.secondary" }}
                  />
                )
                : (
                  <ChevronRight
                    sx={{ fontSize: "0.85em", color: "text.secondary" }}
                  />
                )}
            </ListItemIcon>
            {sidebarOpen && (
              <ListItemText
                primary={
                  <Box
                    component="span"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {`${group.series.title} (${group.posts.length})`}
                    </Box>
                    {hasAnyDirtyChild && (
                      <Box
                        component="span"
                        sx={{
                          flexShrink: 0,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                        }}
                      />
                    )}
                  </Box>
                }
                primaryTypographyProps={{
                  component: "span",
                  fontSize: "0.7em",
                  fontWeight: 500,
                  color: "text.secondary",
                  sx: { display: "block", minWidth: 0 },
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
            borderLeftColor: "divider",
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
