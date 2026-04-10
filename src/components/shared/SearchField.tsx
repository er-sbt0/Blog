import React, { useCallback } from "react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Clear, Search } from "@mui/icons-material";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

const inputSx = {
  maxWidth: { xs: "100%", md: 600 },
  "& .MuiOutlinedInput-root": {
    borderRadius: 2,
    backgroundColor: "background.paper",
    transition: "box-shadow 0.2s ease-in-out",
    "&:hover": { boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
    "&.Mui-focused": { boxShadow: "0 2px 12px rgba(0,0,0,0.12)" },
  },
} as const;

/**
 * Shared full-width search input with a Search prefix icon and an
 * inline Clear button that appears when the field is non-empty.
 *
 * Calls `onChange` with the current string value (not the raw event).
 */
export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  );
  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <TextField
      fullWidth
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      sx={inputSx}
      aria-label={ariaLabel}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search sx={{ color: "text.secondary", fontSize: 22 }} />
          </InputAdornment>
        ),
        endAdornment: value && (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={handleClear}
              aria-label="Clear search"
              sx={{ "&:hover": { backgroundColor: "action.hover" } }}
            >
              <Clear sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};
