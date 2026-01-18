import React from "react";
import {
  Box,
  FormControl,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";

interface PostsPartitionControlProps {
  granularity: PartitionGranularity;
  onGranularityChange: (granularity: PartitionGranularity) => void;
  postCount?: number;
  disabled?: boolean;
}

const granularityOptions = [
  {
    value: "day" as const,
    label: "Daily",
    description: "Group posts by day",
  },
  {
    value: "week" as const,
    label: "Weekly",
    description: "Group posts by week",
  },
  {
    value: "month" as const,
    label: "Monthly",
    description: "Group posts by month",
  },
  {
    value: "quarter" as const,
    label: "Quarterly",
    description: "Group posts by 3-month periods (default)",
  },
  {
    value: "halfyear" as const,
    label: "Semi-annual",
    description: "Group posts by 6-month periods",
  },
  {
    value: "year" as const,
    label: "Yearly",
    description: "Group posts by year",
  },
];

/**
 * Control component for selecting post partitioning granularity in series view
 * Allows users to switch between day, week, month, quarter, halfyear, and year grouping
 */
export const PostsPartitionControl: React.FC<PostsPartitionControlProps> = ({
  granularity,
  onGranularityChange,
  postCount = 0,
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

      {postCount > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: "0.8125rem",
            whiteSpace: "nowrap",
          }}
        >
          {postCount} {postCount === 1 ? "post" : "posts"}
        </Typography>
      )}
    </Box>
  );
};
