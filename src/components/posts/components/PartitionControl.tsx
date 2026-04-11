import React from "react";
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";
import { granularityOptions } from "@/components/shared/granularityOptions";

interface PartitionControlProps {
  granularity: PartitionGranularity;
  onGranularityChange: (granularity: PartitionGranularity) => void;
  postCount?: number;
  disabled?: boolean;
}

/**
 * Control component for selecting post partitioning granularity
 * Allows users to switch between day, week, month, and year grouping
 */
export const PartitionControl: React.FC<PartitionControlProps> = ({
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
          sx={{
            borderRadius: 2,
            height: 36,
            fontSize: "0.875rem",
            "& .MuiSelect-select": {
              display: "flex",
              alignItems: "center",
              py: 0,
              px: 1.5,
            },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "divider",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "text.secondary",
            },
          }}
        >
          {granularityOptions.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Typography variant="body2">{option.label}</Typography>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {postCount > 0 && (
        <Typography
          variant="body2"
          sx={{
            color: "text.disabled",
            whiteSpace: "nowrap",
            fontSize: "0.8125rem",
          }}
        >
          {postCount} posts
        </Typography>
      )}
    </Box>
  );
};
