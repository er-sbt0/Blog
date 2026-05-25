"use client";
import React, { useCallback } from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  InputBase,
  Typography,
} from "@mui/material";
import { ChevronRight } from "@mui/icons-material";
import { GripVertical } from "lucide-react";
import { Series, User, UserDocument } from "@/types";
import { formatRelativeDate } from "@/utils/dateFormat";
import { ListDensity, TagStyle } from "../types";
import { PostRow } from "./PostRow";
import { PostRowContextMenu } from "./PostRowContextMenu";

const SERIES_INLINE_LIMIT = 20;
const SERIES_PREVIEW_COUNT = 3;

interface SeriesRowProps {
  series: Series;
  posts: UserDocument[];
  user?: User;
  density: ListDensity;
  tagStyle: TagStyle;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: (seriesId: string) => void;
  onToggleSelect: (id: string, event: React.MouseEvent) => void;
  /** Current rename value if the series title is being edited. */
  editingSeriesName?: string;
  onSeriesRenameStart: (seriesId: string, currentName: string) => void;
  onSeriesRenameChange: (seriesId: string, value: string) => void;
  onSeriesRenameCommit: (seriesId: string) => Promise<void>;
  onSeriesRenameCancel: (seriesId: string) => void;
  editingPostNames: Map<string, string>;
  onPostRenameStart: (postId: string, currentName: string) => void;
  onPostRenameChange: (postId: string, value: string) => void;
  onPostRenameCommit: (
    postId: string,
    documentId: string,
    originalName: string,
  ) => Promise<void>;
  onPostRenameCancel: (postId: string) => void;
  onDeleteSeries: (seriesId: string, seriesTitle: string) => void;
  onDeletePost: (post: UserDocument) => void;
  onDragStart: (e: React.DragEvent, postId: string) => void;
  onDragEnd: () => void;
  onDropPost: (seriesId: string, postId: string) => void;
  dragOverSeriesId: string | null;
  onDragOverSeries: (seriesId: string | null) => void;
}

export const SeriesRow = React.memo(function SeriesRow({
  series,
  posts,
  user: _user,
  density,
  tagStyle,
  isSelected,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  editingSeriesName,
  onSeriesRenameStart,
  onSeriesRenameChange,
  onSeriesRenameCommit,
  onSeriesRenameCancel,
  editingPostNames,
  onPostRenameStart,
  onPostRenameChange,
  onPostRenameCommit,
  onPostRenameCancel,
  onDeleteSeries,
  onDeletePost,
  onDragStart,
  onDragEnd,
  onDropPost,
  dragOverSeriesId,
  onDragOverSeries,
}: SeriesRowProps) {
  const postCount = posts.length;
  const seriesRowHeight = density === "compact" ? 36 : 44;
  const isDragOver = dragOverSeriesId === series.id;

  const mostRecentDate = posts.reduce<string | undefined>((latest, p) => {
    const d = p.cloud?.updatedAt || p.cloud?.createdAt;
    if (!d) return latest;
    if (!latest) return String(d);
    return new Date(d) > new Date(latest) ? String(d) : latest;
  }, undefined);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect(series.id, e);
    } else {
      onToggleExpand(series.id);
    }
  }, [series.id, onToggleExpand, onToggleSelect]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(series.id, e);
  }, [series.id, onToggleSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/matheditor-document")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onDragOverSeries(series.id);
    }
  }, [series.id, onDragOverSeries]);

  const handleDragLeave = useCallback(() => {
    onDragOverSeries(null);
  }, [onDragOverSeries]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onDragOverSeries(null);
    try {
      const data = JSON.parse(
        e.dataTransfer.getData("application/matheditor-document"),
      ) as { id: string };
      if (data.id) onDropPost(series.id, data.id);
    } catch {
      // ignore malformed drag data
    }
  }, [series.id, onDropPost, onDragOverSeries]);

  // Determine which child posts to show
  const inlineAll = postCount <= SERIES_INLINE_LIMIT;
  const visiblePosts = inlineAll ? posts : [...posts]
    .sort((a, b) => {
      const da = new Date(a.cloud?.updatedAt || a.cloud?.createdAt || 0)
        .getTime();
      const db = new Date(b.cloud?.updatedAt || b.cloud?.createdAt || 0)
        .getTime();
      return db - da;
    })
    .slice(0, SERIES_PREVIEW_COUNT);

  return (
    <Box>
      {/* Series header row */}
      <Box
        className="post-list-row series-row"
        onClick={handleRowClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: seriesRowHeight,
          pl: 1,
          pr: 1,
          borderRadius: 0.5,
          position: "relative",
          cursor: "pointer",
          bgcolor: isSelected
            ? "action.selected"
            : isDragOver
            ? "action.selected"
            : "transparent",
          outline: isDragOver ? "2px solid" : "none",
          outlineColor: "primary.main",
          transition: "background-color 0.15s, outline 0.1s",
          "&:hover": {
            bgcolor: isSelected || isDragOver
              ? "action.selected"
              : "action.hover",
          },
          "&:hover .row-checkbox-grip": { visibility: "visible" },
          "&:hover .row-actions-btn": { opacity: 1 },
          "&:hover .row-date": { opacity: 0.45 },
        }}
      >
        {/* Gutter */}
        <Box
          className="row-checkbox-grip"
          sx={{
            visibility: isSelected ? "visible" : "hidden",
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
            mr: 0.5,
            width: 36,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Box
            sx={{
              cursor: "default",
              color: "text.disabled",
              display: "flex",
              alignItems: "center",
            }}
          >
            <GripVertical size={14} />
          </Box>
          <Checkbox
            size="small"
            checked={isSelected}
            onClick={handleCheckboxClick}
            sx={{ p: 0, width: 18, height: 18 }}
          />
        </Box>

        {/* Chevron + Title area */}
        <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <ChevronRight
              sx={{
                fontSize: 18,
                color: "text.secondary",
                flexShrink: 0,
                transition: "transform 0.2s ease",
                transform: isExpanded ? "rotate(90deg)" : "none",
              }}
            />
            {editingSeriesName !== undefined
              ? (
                <InputBase
                  autoFocus
                  value={editingSeriesName}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSeriesRenameChange(series.id, e.target.value);
                  }}
                  onBlur={() => onSeriesRenameCommit(series.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSeriesRenameCommit(series.id);
                    }
                    if (e.key === "Escape") onSeriesRenameCancel(series.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    flex: 1,
                    minWidth: 0,
                    borderBottom: "1px solid",
                    borderColor: "primary.main",
                    "& input": { p: 0 },
                  }}
                />
              )
              : (
                <Typography
                  noWrap
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "text.primary",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {series.title}
                </Typography>
              )}
          </Box>
          {/* Sub-line */}
          <Typography
            variant="caption"
            sx={{
              color: "text.disabled",
              fontSize: "0.6875rem",
              pl: "26px",
              display: "block",
            }}
          >
            series · {postCount} {postCount === 1 ? "post" : "posts"}
            {mostRecentDate &&
              ` · updated ${formatRelativeDate(mostRecentDate)}`}
          </Typography>
        </Box>

        {/* Tags placeholder */}
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            flexShrink: 0,
            mr: 1.5,
            minWidth: 0,
            maxWidth: 160,
          }}
        />

        {/* Date */}
        <Typography
          variant="caption"
          className="row-date"
          sx={{
            color: "text.secondary",
            width: 70,
            textAlign: "right",
            flexShrink: 0,
            mr: 0.5,
            fontSize: "0.6875rem",
            transition: "opacity 0.15s",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {mostRecentDate ? formatRelativeDate(mostRecentDate) : ""}
        </Typography>

        {/* ⋯ Actions */}
        <Box
          sx={{
            flexShrink: 0,
            width: 28,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PostRowContextMenu
            mode="series"
            onRename={() => onSeriesRenameStart(series.id, series.title)}
            onDelete={() => onDeleteSeries(series.id, series.title)}
          />
        </Box>
      </Box>

      {/* Inline children */}
      <Collapse in={isExpanded} unmountOnExit>
        <Box
          sx={{
            borderLeft: "2px solid",
            borderColor: "divider",
            ml: 2.5,
            mb: 0.5,
          }}
        >
          {visiblePosts.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              density={density}
              tagStyle={tagStyle}
              isSelected={false}
              editingName={editingPostNames.get(p.id)}
              onToggleSelect={onToggleSelect}
              onRenameStart={onPostRenameStart}
              onRenameChange={onPostRenameChange}
              onRenameCommit={onPostRenameCommit}
              onRenameCancel={onPostRenameCancel}
              onDelete={onDeletePost}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              indent={8}
            />
          ))}
          {!inlineAll && (
            <Box sx={{ px: 1, py: 0.5 }}>
              <Button
                variant="text"
                size="small"
                href={`/posts/${series.id}`}
                sx={{
                  fontSize: "0.75rem",
                  color: "text.secondary",
                  textTransform: "none",
                  p: 0.5,
                  "&:hover": {
                    color: "primary.main",
                    bgcolor: "transparent",
                    textDecoration: "underline",
                  },
                }}
              >
                View all {postCount} posts →
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
});
