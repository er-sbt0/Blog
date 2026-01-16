import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add,
  CalendarMonth,
  Clear,
  FilterList,
  Schedule,
  Search,
  Today,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { TimeFilterValue } from "../hooks/usePostsTimeFilter";
import { PartitionGranularity } from "@/types/partitioning";
import { PartitionControl } from "./PartitionControl";

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
}

/**
 * Header component displaying search, filters, and actions for posts management
 * Layout: Search bar on top, action buttons below (following standard content management patterns)
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
}) => {
  const router = useRouter();

  // Filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const filterMenuOpen = Boolean(filterAnchorEl);

  // Time filter options
  const timeFilterOptions = [
    { value: "all", label: "All Time", icon: <Schedule /> },
    { value: "thisYear", label: "This Year", icon: <CalendarMonth /> },
    { value: "thisMonth", label: "This Month", icon: <Today /> },
    { value: "lastMonth", label: "Last Month", icon: <Today /> },
    { value: "last3Months", label: "Last 3 Months", icon: <CalendarMonth /> },
    { value: "last6Months", label: "Last 6 Months", icon: <CalendarMonth /> },
  ];

  const handleNewPost = () => {
    if (onNewPost) {
      onNewPost();
    } else {
      router.push("/new");
    }
  };

  const handleFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setFilterAnchorEl(event.currentTarget);
  };

  const handleFilterClose = () => {
    setFilterAnchorEl(null);
  };

  const handleTimeFilterSelect = (value: string) => {
    onTimeFilterChange?.(value as TimeFilterValue);
    handleFilterClose();
  };

  const clearSearch = () => {
    onSearchChange?.("");
  };

  const activeTimeFilter = timeFilterOptions.find((option) =>
    option.value === timeFilter
  );

  return (
    <Box
      component="header"
      sx={{
        mb: 4,
        pt: 2,
        pb: 3,
      }}
    >
      {/* Search Section - Full width search bar */}
      <Box sx={{ mb: 2.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search posts by title, content, or tags..."
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          sx={{
            maxWidth: { xs: "100%", md: 600 },
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              backgroundColor: "background.paper",
              transition: "box-shadow 0.2s ease-in-out",
              "&:hover": {
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              },
              "&.Mui-focused": {
                boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
              },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: "text.secondary", fontSize: 22 }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  sx={{
                    "&:hover": {
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  <Clear sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          aria-label="Search posts"
        />
      </Box>

      {/* Actions Toolbar - Below search */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        {/* Primary Action: New Post */}
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleNewPost}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 500,
            height: 36,
            px: 2,
            borderColor: "divider",
            "&:hover": {
              borderColor: "text.secondary",
            },
          }}
        >
          New Post
        </Button>

        {/* Time Filter Button */}
        <Button
          variant="outlined"
          startIcon={<FilterList />}
          onClick={handleFilterClick}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 400,
            height: 36,
            px: 2,
            color: timeFilter !== "all" ? "primary.main" : "text.secondary",
            borderColor: "divider",
            "&:hover": {
              borderColor: "text.secondary",
            },
          }}
        >
          {activeTimeFilter?.label || "All Time"}
        </Button>

        {/* Partition Control - Group By */}
        {totalCount > 0 && (
          <PartitionControl
            granularity={granularity}
            onGranularityChange={onGranularityChange || (() => {})}
            postCount={totalCount}
          />
        )}
      </Box>

      {/* Active Filters Chips - Show when filters are active */}
      {(searchQuery || timeFilter !== "all") && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontWeight: 500,
              fontSize: "0.8125rem",
            }}
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
              sx={{
                borderRadius: 1.5,
                "& .MuiChip-label": {
                  px: 1,
                },
              }}
            />
          )}
          {timeFilter !== "all" && (
            <Chip
              label={activeTimeFilter?.label}
              onDelete={() => onTimeFilterChange?.("all")}
              size="small"
              color="primary"
              variant="outlined"
              sx={{
                borderRadius: 1.5,
                "& .MuiChip-label": {
                  px: 1,
                },
              }}
            />
          )}
        </Box>
      )}

      {/* Filter Menu */}
      <Menu
        anchorEl={filterAnchorEl}
        open={filterMenuOpen}
        onClose={handleFilterClose}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 180,
            borderRadius: 2,
            boxShadow: 3,
          },
        }}
      >
        {timeFilterOptions.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleTimeFilterSelect(option.value)}
            selected={timeFilter === option.value}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              py: 1,
            }}
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
