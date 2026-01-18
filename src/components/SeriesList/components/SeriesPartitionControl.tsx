import React from "react";
import {
  Box,
  FormControl,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";

interface SeriesPartitionControlProps {
  granularity: PartitionGranularity;
  onGranularityChange: (granularity: PartitionGranularity) => void;
  seriesCount?: number;
  disabled?: boolean;
}

const granularityOptions = [
  {
    value: "day" as const,
    label: "Daily",
    description: "Group series by day",
  },
  {
    value: "week" as const,
    label: "Weekly",
    description: "Group series by week",
  },
  {
    value: "month" as const,
    label: "Monthly",
    description: "Group series by month",
  },
  {
    value: "quarter" as const,
    label: "Quarterly",
    description: "Group series by 3-month periods (default)",
  },
  {
    value: "halfyear" as const,
    label: "Semi-annual",
    description: "Group series by 6-month periods",
  },
  {
    value: "year" as const,
    label: "Yearly",
    description: "Group series by year",
  },
];

/**
 * Control component for selecting series partitioning granularity
 * Allows users to switch between day, week, month, quarter, halfyear, and year grouping
 */
export const SeriesPartitionControl: React.FC<SeriesPartitionControlProps> = ({
  granularity,
  onGranularityChange,
  seriesCount = 0,
  disabled = false,
}) => {
  const handleChange = (event: SelectChangeEvent<PartitionGranularity>) => {
    onGranularityChange(event.target.value as PartitionGranularity);
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <FormControl size="small" sx={{ minWidth: 110 }}>
        <Select
          value={granularity}
          onChange={handleChange}
          disabled={disabled}
          native
          sx={{
            borderRadius: 2,
            height: 36,
            fontSize: "0.875rem",
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              py: 0,
            },
          }}
        >
          {granularityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormControl>

      {seriesCount > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: "0.8125rem",
            whiteSpace: "nowrap",
          }}
        >
          {seriesCount} {seriesCount === 1 ? "series" : "series"}
        </Typography>
      )}
    </Box>
  );
};
