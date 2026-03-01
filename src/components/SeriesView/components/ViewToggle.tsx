import React from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { ViewList, ViewModule } from "@mui/icons-material";

export type ViewType = "grid" | "compact";

interface ViewToggleProps {
  view: ViewType;
  onChange: (view: ViewType) => void;
}

/**
 * Toggle component for switching between different post view layouts
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({ view, onChange }) => {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newView: ViewType | null,
  ) => {
    if (newView !== null) {
      onChange(newView);
    }
  };

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      aria-label="view toggle"
      size="small"
      sx={{
        backgroundColor: "background.paper",
        height: 32,
        "& .MuiToggleButton-root": {
          border: 1,
          borderColor: "divider",
          height: 32,
          "&.Mui-selected": {
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            "&:hover": {
              backgroundColor: "primary.dark",
            },
          },
        },
      }}
    >
      <ToggleButton value="grid" aria-label="grid view">
        <Tooltip title="Grid View">
          <ViewModule />
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="compact" aria-label="compact list view">
        <Tooltip title="Compact List">
          <ViewList />
        </Tooltip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
};
