"use client";
import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  Link,
  Typography,
} from "@mui/material";
import { Cloud, History, MobileFriendly } from "@mui/icons-material";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { DocumentRevision, EditorDocumentRevision } from "@/types";
import RailSection from "./RailSection";

const COLLAPSE_AT = 3;

interface RevisionsSectionProps {
  rootId: string;
  activeDocId: string | null;
  isEditMode: boolean;
}

export default function RevisionsSection({
  rootId,
  activeDocId,
  isEditMode,
}: RevisionsSectionProps) {
  const [tabFilter, setTabFilter] = useState<"this" | "all">("this");
  const [showAll, setShowAll] = useState(false);

  const { tabRevisions, allRevisions } = useSelector((state: RootState) => {
    const tabIds = isEditMode ? state.ui.tabs.tabIds : [rootId];

    // Collect revisions from all tab documents
    const all: (DocumentRevision | EditorDocumentRevision)[] = [];
    for (const id of tabIds) {
      const doc = documentsSelectors.selectById(state, id);
      if (!doc) continue;
      const cloud = doc.cloud?.revisions ?? [];
      const local = (doc.local?.revisions ?? []).filter(
        (lr) => !cloud.some((cr) => cr.id === lr.id),
      );
      all.push(...cloud, ...local);
    }

    // Revisions just for the active tab
    const thisTab: (DocumentRevision | EditorDocumentRevision)[] = [];
    if (activeDocId) {
      const doc = documentsSelectors.selectById(state, activeDocId);
      if (doc) {
        const cloud = doc.cloud?.revisions ?? [];
        const local = (doc.local?.revisions ?? []).filter(
          (lr) => !cloud.some((cr) => cr.id === lr.id),
        );
        thisTab.push(...cloud, ...local);
      }
    }

    const sort = (
      list: (DocumentRevision | EditorDocumentRevision)[],
    ) =>
      [...list].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return {
      tabRevisions: sort(thisTab),
      allRevisions: sort(all),
    };
  });

  const revisions = useMemo(
    () => (tabFilter === "this" ? tabRevisions : allRevisions),
    [tabFilter, tabRevisions, allRevisions],
  );

  const visible = showAll ? revisions : revisions.slice(0, COLLAPSE_AT);
  const hiddenCount = revisions.length - COLLAPSE_AT;

  return (
    <RailSection
      title="Revisions"
      count={revisions.length || undefined}
      icon={<History fontSize="small" />}
      iconLabel="Revisions"
      defaultOpen={true}
    >
      {isEditMode && (
        <Box sx={{ display: "flex", gap: 0.5, mb: 1 }}>
          <Chip
            label="This tab"
            size="small"
            variant={tabFilter === "this" ? "filled" : "outlined"}
            onClick={() => setTabFilter("this")}
            sx={{ height: 20, fontSize: "0.68rem", cursor: "pointer" }}
          />
          <Chip
            label="All tabs"
            size="small"
            variant={tabFilter === "all" ? "filled" : "outlined"}
            onClick={() => setTabFilter("all")}
            sx={{ height: 20, fontSize: "0.68rem", cursor: "pointer" }}
          />
        </Box>
      )}

      {revisions.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No revisions yet
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {visible.map((rev) => {
            const author =
              "author" in rev && rev.author ? rev.author : undefined;
            const isCloud = "author" in rev && !!rev.author;

            return (
              <Box
                key={rev.id}
                sx={{
                  display: "flex",
                  gap: 0.75,
                  alignItems: "center",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 0.75,
                  bgcolor: "background.paper",
                }}
              >
                <Avatar
                  src={author?.image ?? undefined}
                  alt={author?.name ?? "Local"}
                  sx={{ width: 22, height: 22, flexShrink: 0 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{ display: "block", fontWeight: 600 }}
                    noWrap
                  >
                    {author?.name ?? "Local"}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.65rem" }}
                  >
                    <DateDisplay date={rev.createdAt} variant="full" />
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  icon={
                    isCloud ? (
                      <Cloud sx={{ fontSize: "0.7rem !important" }} />
                    ) : (
                      <MobileFriendly sx={{ fontSize: "0.7rem !important" }} />
                    )
                  }
                  label={isCloud ? "Cloud" : "Local"}
                  sx={{
                    height: 16,
                    fontSize: "0.62rem",
                    "& .MuiChip-label": { px: 0.5 },
                  }}
                />
              </Box>
            );
          })}

          {!showAll && hiddenCount > 0 && (
            <Link
              component="button"
              variant="caption"
              underline="hover"
              onClick={() => setShowAll(true)}
              sx={{ textAlign: "center", mt: 0.25 }}
            >
              show {hiddenCount} more ▾
            </Link>
          )}
        </Box>
      )}
    </RailSection>
  );
}
