"use client";
import React from "react";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Clear, Search } from "@mui/icons-material";
import { useRouter } from "next/navigation";

interface SeriesHeaderProps {
  totalCount: number;
  loading?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

/**
 * Header component for series list page
 * Layout matches PostsHeader: Search bar on top, action buttons below
 */
const SeriesHeader: React.FC<SeriesHeaderProps> = ({
  totalCount,
  loading = false,
  searchQuery = "",
  onSearchChange,
}) => {
  const router = useRouter();

  const handleNewSeries = () => {
    router.push("/series/new");
  };

  const clearSearch = () => {
    onSearchChange?.("");
  };

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
          placeholder="Search series by title..."
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
          aria-label="Search series"
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
        {/* Primary Action: New Series */}
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleNewSeries}
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
          New Series
        </Button>

        {/* Series count */}
        {!loading && totalCount > 0 && (
          <Typography
            variant="body2"
            sx={{
              color: "text.disabled",
              whiteSpace: "nowrap",
              fontSize: "0.8125rem",
            }}
          >
            {totalCount} series
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default SeriesHeader;
