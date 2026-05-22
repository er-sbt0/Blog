"use client";
import { Box, Divider, Typography } from "@mui/material";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";
import SaveStateIndicator from "./SaveStateIndicator";

interface DocumentHeaderProps {
  docId: string;
  rootId: string;
}

export default function DocumentHeader({
  docId,
  rootId,
}: DocumentHeaderProps) {
  const { name } = useSelector(
    (state: RootState) => {
      const rootUserDoc = documentsSelectors.selectById(state, rootId);
      const activeUserDoc = documentsSelectors.selectById(state, docId);

      const cloudDoc = rootUserDoc?.cloud;
      const localDoc = activeUserDoc?.local;
      const effectiveDoc = localDoc ?? activeUserDoc?.cloud;

      return {
        name: effectiveDoc?.name ?? cloudDoc?.name ?? "Untitled",
      };
    },
    shallowEqual,
  );

  return (
    <Box sx={{ pt: 2, pb: 0 }}>
      {/* Title + save state */}
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 0.5,
          mb: 2,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 700, lineHeight: 1.1 }}
        >
          {name}
        </Typography>
        <SaveStateIndicator docId={docId} />
      </Box>

      <Divider />
    </Box>
  );
}
