"use client";

import { IconButton, Tooltip } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";

export default function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Tooltip title="Print or Save as PDF">
      <IconButton
        onClick={handlePrint}
        className="print-button"
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          bgcolor: "primary.main",
          color: "white",
          "&:hover": {
            bgcolor: "primary.dark",
          },
          boxShadow: 3,
          zIndex: 1000,
          "@media print": {
            display: "none",
          },
        }}
        size="large"
      >
        <PrintIcon />
      </IconButton>
    </Tooltip>
  );
}
