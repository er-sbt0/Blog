"use client";
import React from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import { AccessTime, Check, Clear, Close, Search } from "@mui/icons-material";
import { PartitionGranularity } from "@/types/partitioning";
import { PostsPartitionControl } from "./PostsPartitionControl";
import { ViewToggle, type ViewType } from "./ViewToggle";
import { PendingTimeChange } from "./PostsCompactListView";

interface SeriesSearchAndControlsProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  granularity: PartitionGranularity;
  onGranularityChange: (g: PartitionGranularity) => void;
  filteredPostCount: number;
  viewType: ViewType;
  onViewChange: (v: ViewType) => void;
  canEdit: boolean;
  isTimeEditMode: boolean;
  isSavingTimeChanges: boolean;
  pendingTimeChanges: Map<string, PendingTimeChange>;
  onToggleTimeEdit: () => void;
  onSaveTimeChanges: () => void;
  onDiscardTimeChanges: () => void;
}

const SeriesSearchAndControls: React.FC<SeriesSearchAndControlsProps> = ({
  searchQuery,
  onSearchChange,
  granularity,
  onGranularityChange,
  filteredPostCount,
  viewType,
  onViewChange,
  canEdit,
  isTimeEditMode,
  isSavingTimeChanges,
  pendingTimeChanges,
  onToggleTimeEdit,
  onSaveTimeChanges,
  onDiscardTimeChanges,
}) => (
  <Box sx={{ mb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
    <TextField
      fullWidth
      size="small"
      placeholder="Search posts by title, handle, or author..."
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      sx={{
        maxWidth: { xs: "100%", md: 600 },
        "& .MuiOutlinedInput-root": {
          borderRadius: 2,
          backgroundColor: "background.paper",
          transition: "box-shadow 0.2s ease-in-out",
          "&:hover": { boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
          "&.Mui-focused": { boxShadow: "0 2px 12px rgba(0,0,0,0.12)" },
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
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              sx={{ "&:hover": { backgroundColor: "action.hover" } }}
            >
              <Clear sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />

    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <PostsPartitionControl
        granularity={granularity}
        onGranularityChange={onGranularityChange}
        postCount={filteredPostCount}
        disabled={filteredPostCount === 0}
      />

      <Box
        sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
      >
        {canEdit && viewType === "compact" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              size="small"
              variant={isTimeEditMode ? "contained" : "outlined"}
              startIcon={<AccessTime />}
              onClick={onToggleTimeEdit}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                fontSize: "0.8rem",
                borderRadius: 1.5,
                height: 32,
              }}
            >
              {isTimeEditMode ? "Editing" : "Edit"}
            </Button>

            {isTimeEditMode && (
              <>
                {pendingTimeChanges.size > 0 && (
                  <Chip
                    size="small"
                    label={`${pendingTimeChanges.size} modified`}
                    color="warning"
                    sx={{ fontSize: "0.75rem", height: 24 }}
                  />
                )}
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<Check />}
                  onClick={onSaveTimeChanges}
                  disabled={pendingTimeChanges.size === 0 ||
                    isSavingTimeChanges}
                  sx={{
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    borderRadius: 1.5,
                    minWidth: 80,
                    height: 32,
                  }}
                >
                  {isSavingTimeChanges ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<Close />}
                  onClick={onDiscardTimeChanges}
                  disabled={isSavingTimeChanges}
                  sx={{
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    borderRadius: 1.5,
                    height: 32,
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </Box>
        )}
        <ViewToggle view={viewType} onChange={onViewChange} />
      </Box>
    </Box>
  </Box>
);

export default SeriesSearchAndControls;
