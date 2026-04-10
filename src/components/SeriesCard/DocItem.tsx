"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import { UserDocument } from "@/types";

interface DocItemProps {
  document: UserDocument;
}

/** Individual document item within an expanded series card */
const DocItem: React.FC<DocItemProps> = ({ document }) => {
  const doc = document.local || document.cloud;
  const title = doc?.name || "Untitled";
  const docId = document.id;

  return (
    <Box
      component="a"
      href={`/view/${docId}`}
      onClick={(e) => e.stopPropagation()}
      sx={{
        width: "100%",
        flexShrink: 0,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "4px",
        p: 1.5,
        bgcolor: "background.paper",
        textDecoration: "none",
        transition:
          "box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        "&:hover": {
          bgcolor: "action.hover",
          borderColor: "primary.light",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        },
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: "text.primary",
          fontWeight: 500,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};

export default DocItem;
