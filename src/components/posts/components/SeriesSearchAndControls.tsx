import React from "react";
import { Box, Button, Chip } from "@mui/material";
import { AccessTime, Check, Close } from "@mui/icons-material";
import { ViewToggle, type ViewType } from "@/components/shared/ViewToggle";
import { PendingTimeChange } from "@/types/posts";

const timeEditBtnSx = {
  textTransform: "none",
  fontWeight: 500,
  fontSize: "0.8rem",
  borderRadius: 1.5,
  height: 32,
} as const;

interface SeriesSearchAndControlsProps {
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
  <Box
    sx={{
      mb: 3,
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 2,
    }}
  >
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
            sx={timeEditBtnSx}
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
                disabled={pendingTimeChanges.size === 0 || isSavingTimeChanges}
                sx={{ ...timeEditBtnSx, minWidth: 80 }}
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
                sx={timeEditBtnSx}
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
);

export default SeriesSearchAndControls;
