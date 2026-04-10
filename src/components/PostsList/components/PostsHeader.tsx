import React, { useCallback, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Add,
  CalendarMonth,
  FilterList,
  Schedule,
  Today,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { FILTER_LABELS, TimeFilterValue } from "@/hooks/usePostsTimeFilter";
import { PartitionGranularity } from "@/types/partitioning";
import { PartitionControl } from "./PartitionControl";
import { ViewToggle, ViewType } from "@/components/shared/ViewToggle";
import { SearchField } from "@/components/shared/SearchField";

interface PostsHeaderProps {
  totalCount: number;
  loading: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  timeFilter?: TimeFilterValue;
  onTimeFilterChange?: (filter: TimeFilterValue) => void;
  granularity?: PartitionGranularity;
  onGranularityChange?: (granularity: PartitionGranularity) => void;
  onNewPost?: () => void;
  onNewSeries?: () => void;
  viewType?: ViewType;
  onViewTypeChange?: (view: ViewType) => void;
  showPosts?: boolean;
  onShowPostsChange?: (show: boolean) => void;
  showSeries?: boolean;
  onShowSeriesChange?: (show: boolean) => void;
}

const toggleGroupSx = {
  backgroundColor: "background.paper",
  height: 32,
  "& .MuiToggleButton-root": {
    border: 1,
    borderColor: "divider",
    height: 32,
    px: 1.5,
    textTransform: "none",
    fontSize: "0.8125rem",
    "&.Mui-selected": {
      backgroundColor: "primary.main",
      color: "primary.contrastText",
      "&:hover": { backgroundColor: "primary.dark" },
    },
  },
};

const actionButtonSx = {
  borderRadius: 2,
  textTransform: "none",
  fontWeight: 500,
  height: 36,
  px: 2,
  borderColor: "divider",
  "&:hover": { borderColor: "text.secondary" },
} as const;

/**
 * Header component for posts management
 * Row 1: Search + post count
 * Row 2: Create actions (New Post, New Series)
 * Row 3: Filters + display options (Time, Posts/Series toggle, Group By, View)
 */
const PostsHeader: React.FC<PostsHeaderProps> = ({
  totalCount,
  loading,
  searchQuery = "",
  onSearchChange,
  timeFilter = "all",
  onTimeFilterChange,
  granularity = "quarter",
  onGranularityChange,
  onNewPost,
  onNewSeries,
  viewType = "grid",
  onViewTypeChange,
  showPosts = true,
  onShowPostsChange,
  showSeries = true,
  onShowSeriesChange,
}) => {
  const router = useRouter();

  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const filterMenuOpen = Boolean(filterAnchorEl);

  const timeFilterOptions = [
    {
      value: "all" as TimeFilterValue,
      label: FILTER_LABELS.all,
      icon: <Schedule />,
    },
    {
      value: "thisYear" as TimeFilterValue,
      label: FILTER_LABELS.thisYear,
      icon: <CalendarMonth />,
    },
    {
      value: "thisMonth" as TimeFilterValue,
      label: FILTER_LABELS.thisMonth,
      icon: <Today />,
    },
    {
      value: "lastMonth" as TimeFilterValue,
      label: FILTER_LABELS.lastMonth,
      icon: <Today />,
    },
    {
      value: "last3Months" as TimeFilterValue,
      label: FILTER_LABELS.last3Months,
      icon: <CalendarMonth />,
    },
    {
      value: "last6Months" as TimeFilterValue,
      label: FILTER_LABELS.last6Months,
      icon: <CalendarMonth />,
    },
  ];

  const handleNewPost = useCallback(() => {
    if (onNewPost) onNewPost();
    else router.push("/new");
  }, [onNewPost, router]);

  const handleFilterClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setFilterAnchorEl(event.currentTarget);
    },
    [],
  );

  const handleFilterClose = useCallback(() => setFilterAnchorEl(null), []);

  const handleTimeFilterSelect = useCallback(
    (value: string) => {
      onTimeFilterChange?.(value as TimeFilterValue);
      setFilterAnchorEl(null);
    },
    [onTimeFilterChange],
  );

  const clearSearch = useCallback(() => onSearchChange?.(""), [onSearchChange]);

  const handleClearTimeFilter = useCallback(
    () => onTimeFilterChange?.("all"),
    [onTimeFilterChange],
  );

  const handleGranularityChange = useCallback(
    (g: PartitionGranularity) => onGranularityChange?.(g),
    [onGranularityChange],
  );

  const handleViewTypeChange = useCallback(
    (v: ViewType) => onViewTypeChange?.(v),
    [onViewTypeChange],
  );

  const activeTimeFilter = timeFilterOptions.find((o) =>
    o.value === timeFilter
  );

  const contentFilterValue = [
    ...(showPosts ? ["posts"] : []),
    ...(showSeries ? ["series"] : []),
  ];

  const handleContentFilterChange = useCallback(
    (_: React.MouseEvent, newValues: string[]) => {
      onShowPostsChange?.(newValues.includes("posts"));
      onShowSeriesChange?.(newValues.includes("series"));
    },
    [onShowPostsChange, onShowSeriesChange],
  );

  return (
    <Box component="header" sx={{ mb: 4, pt: 2, pb: 3 }}>
      {/* Row 1: Search */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
        <SearchField
          value={searchQuery}
          onChange={(v) => onSearchChange?.(v)}
          placeholder="Search posts by title, content, or tags..."
          ariaLabel="Search posts"
        />
      </Box>

      {/* Row 2: Create actions */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleNewPost}
          sx={actionButtonSx}
        >
          New Post
        </Button>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={onNewSeries}
          sx={actionButtonSx}
        >
          New Series
        </Button>
      </Box>

      {/* Row 3: Filters + display options */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        {/* Time filter */}
        <Button
          variant="outlined"
          startIcon={<FilterList />}
          onClick={handleFilterClick}
          sx={{
            ...actionButtonSx,
            fontWeight: 400,
            color: timeFilter !== "all" ? "primary.main" : "text.secondary",
          }}
        >
          {activeTimeFilter?.label || "All Time"}
        </Button>

        {/* Posts / Series toggle */}
        <ToggleButtonGroup
          value={contentFilterValue}
          onChange={handleContentFilterChange}
          aria-label="content filter"
          size="small"
          sx={toggleGroupSx}
        >
          <ToggleButton value="posts" aria-label="show posts">
            Posts
          </ToggleButton>
          <ToggleButton value="series" aria-label="show series">
            Series
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Group By */}
        {totalCount > 0 && (
          <PartitionControl
            granularity={granularity}
            onGranularityChange={handleGranularityChange}
            postCount={totalCount}
          />
        )}

        {/* View layout */}
        <ViewToggle view={viewType} onChange={handleViewTypeChange} />
      </Box>

      {/* Active filter chips */}
      {(searchQuery || timeFilter !== "all") && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 500, fontSize: "0.8125rem" }}
          >
            Active filters:
          </Typography>
          {searchQuery && (
            <Chip
              label={`"${searchQuery}"`}
              onDelete={clearSearch}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ borderRadius: 1.5, "& .MuiChip-label": { px: 1 } }}
            />
          )}
          {timeFilter !== "all" && (
            <Chip
              label={activeTimeFilter?.label}
              onDelete={handleClearTimeFilter}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ borderRadius: 1.5, "& .MuiChip-label": { px: 1 } }}
            />
          )}
        </Box>
      )}

      {/* Filter menu */}
      <Menu
        anchorEl={filterAnchorEl}
        open={filterMenuOpen}
        onClose={handleFilterClose}
        PaperProps={{
          sx: { mt: 1, minWidth: 180, borderRadius: 2, boxShadow: 3 },
        }}
      >
        {timeFilterOptions.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleTimeFilterSelect(option.value)}
            selected={timeFilter === option.value}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}
          >
            {option.icon}
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default PostsHeader;
