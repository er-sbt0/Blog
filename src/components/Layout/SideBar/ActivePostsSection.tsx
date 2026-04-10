import React, { useMemo, useState } from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  List,
  TextField,
} from "@mui/material";
import { Clear, Search } from "@mui/icons-material";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import type { PostItemActions } from "./hooks/useSidebarActions";
import { PostItem } from "./PostItem";
import { SeriesGroup } from "./SeriesGroup";
import { styles } from "../styles";
import { useExpandedState } from "@/hooks/useExpandedState";

interface ActivePostsSectionProps {
  groupedActivePosts: SeriesGroupItem[];
  sidebarOpen: boolean;
  pathname: string;
  itemActions: PostItemActions;
}

export const ActivePostsSection: React.FC<ActivePostsSectionProps> = ({
  groupedActivePosts,
  sidebarOpen,
  pathname,
  itemActions,
}) => {
  const [activePostsSearch, setActivePostsSearch] = useState("");
  const {
    expandedSeries,
    toggleSeries: toggleSeriesExpanded,
  } = useExpandedState("sidebarSeriesCollapsedState");

  const totalPosts = groupedActivePosts.reduce(
    (sum, g) => sum + g.posts.length,
    0,
  );
  const showSearch = totalPosts >= 5;

  const filteredGroups = useMemo((): SeriesGroupItem[] => {
    if (!activePostsSearch.trim()) return groupedActivePosts;
    const searchLower = activePostsSearch.toLowerCase();
    return groupedActivePosts
      .map((group) => {
        if (group.type === "series") {
          const seriesMatches = group.series?.title
            .toLowerCase()
            .includes(searchLower);
          if (seriesMatches) return group;
          const filteredPosts = group.posts.filter((post) => {
            const doc = post.cloud || post.local;
            return doc?.name?.toLowerCase().includes(searchLower);
          });
          if (filteredPosts.length === 0) return null;
          return { ...group, posts: filteredPosts };
        } else {
          const doc = group.posts[0]?.cloud || group.posts[0]?.local;
          if (doc?.name?.toLowerCase().includes(searchLower)) return group;
          return null;
        }
      })
      .filter((group): group is SeriesGroupItem => group !== null);
  }, [groupedActivePosts, activePostsSearch]);

  return (
    <Box
      sx={{
        ...styles.sectionBox,
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {sidebarOpen && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box
            sx={{
              fontSize: "0.75em",
              fontWeight: 600,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Active Posts
          </Box>
          {showSearch && (
            <TextField
              size="small"
              placeholder="Search posts..."
              value={activePostsSearch}
              onChange={(e) => setActivePostsSearch(e.target.value)}
              variant="standard"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search
                      sx={{ fontSize: "0.9em", color: "text.disabled" }}
                    />
                  </InputAdornment>
                ),
                endAdornment: activePostsSearch && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setActivePostsSearch("")}
                      edge="end"
                      sx={{
                        padding: 0.25,
                        opacity: 0.6,
                        "&:hover": { opacity: 1 },
                      }}
                    >
                      <Clear sx={{ fontSize: "0.9em" }} />
                    </IconButton>
                  </InputAdornment>
                ),
                disableUnderline: false,
              }}
              sx={{
                width: "100%",
                "& .MuiInput-root": {
                  fontSize: "0.75em",
                  "&:before": { borderBottomColor: "divider" },
                  "&:hover:not(.Mui-disabled):before": {
                    borderBottomColor: "text.secondary",
                  },
                  "&:after": { borderBottomColor: "primary.main" },
                },
                "& .MuiInput-input": {
                  padding: "4px 0 4px 0",
                  "&::placeholder": { fontSize: "0.75em", opacity: 0.5 },
                },
              }}
            />
          )}
        </Box>
      )}

      <Box sx={{ overflow: "auto", flex: "1 1 auto" }}>
        <List dense>
          {filteredGroups.map((group, groupIndex) => {
            if (group.type === "series" && group.series) {
              return (
                <SeriesGroup
                  key={`series-${group.series.id}`}
                  group={group as SeriesGroupItem & {
                    series: NonNullable<SeriesGroupItem["series"]>;
                  }}
                  groupIndex={groupIndex}
                  isExpanded={expandedSeries.has(group.series.id)}
                  onToggle={() => toggleSeriesExpanded(group.series!.id)}
                  sidebarOpen={sidebarOpen}
                  pathname={pathname}
                  itemActions={itemActions}
                />
              );
            }
            return (
              <PostItem
                key={group.posts[0].id}
                post={group.posts[0]}
                inSeries={false}
                sidebarOpen={sidebarOpen}
                pathname={pathname}
                itemActions={itemActions}
              />
            );
          })}
        </List>
      </Box>
    </Box>
  );
};
