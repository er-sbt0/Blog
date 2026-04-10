import React from "react";
import { Box, Button, Chip } from "@mui/material";
import { AccessTime, Check, Close } from "@mui/icons-material";
import { PartitionGranularity } from "@/types/partitioning";
import { PartitionControl } from "@/components/PostsList/components/PartitionControl";
import { ViewToggle, type ViewType } from "./ViewToggle";
import { PendingTimeChange } from "./PostsCompactListView";
import { SearchField } from "@/components/shared/SearchField";

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
    <SearchField
      value={searchQuery}
      onChange={onSearchChange}
      placeholder="Search posts by title, handle, or author..."
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
      <PartitionControl
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
