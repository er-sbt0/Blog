"use client";
import React, { memo } from "react";
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Delete, Edit, MoreVert } from "@mui/icons-material";
import { CompactVariantProps } from "../types";
import { UserDocument } from "@/types";
import { Series } from "@/types";
import { createCardTheme } from "../../DocumentCardNew/theme";
import { formatDate, useSeriesActions } from "../seriesCardUtils";
import DocItem from "../DocItem";
import { useCompactVariantState } from "../hooks/useCompactVariantState";

interface CollapsedViewProps {
  series: Series;
  showActions: boolean;
  isAuthor: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function CollapsedView({
  series,
  showActions,
  isAuthor,
  menuOpen,
  onToggle,
  onMenuOpen,
}: CollapsedViewProps) {
  return (
    <Box
      onClick={onToggle}
      sx={{ display: "flex", flexDirection: "column", height: "100%", cursor: "pointer" }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          p: { xs: 2, sm: 3 },
          gap: 1.5,
        }}
      >
        <Typography
          variant="h5"
          component="h2"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.25rem", sm: "1.5rem" },
            lineHeight: 1.2,
            color: "text.primary",
            textAlign: "center",
            transition: "color 0.2s ease",
            "&:hover": { color: "primary.main" },
          }}
        >
          {series.title}
        </Typography>
        {series.createdAt && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.875rem", fontWeight: 600 }}
            >
              {formatDate(series.createdAt)}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default",
          minHeight: 48,
        }}
      >
        {showActions && isAuthor && (
          <IconButton
            aria-label="Series Actions"
            aria-controls={menuOpen ? "series-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? "true" : undefined}
            size="small"
            onClick={onMenuOpen}
          >
            <MoreVert />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

interface ExpandedViewProps {
  series: Series;
  sortedPosts: UserDocument[];
  collapsible: boolean;
  showActions: boolean;
  isAuthor: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onCardClick: (e: React.MouseEvent) => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function ExpandedView({
  series,
  sortedPosts,
  collapsible,
  showActions,
  isAuthor,
  menuOpen,
  onToggle,
  onCardClick,
  onMenuOpen,
}: ExpandedViewProps) {
  return (
    <>
      <Box
        onClick={onCardClick}
        sx={{
          display: "flex",
          flexDirection: "column",
          p: { xs: 2, sm: 3 },
          height: 200,
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            overflowY: "auto",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 2 },
          }}
        >
          {sortedPosts.map((doc) => (
            <DocItem key={doc.id} document={doc} />
          ))}
        </Box>
      </Box>

      <Box
        onClick={collapsible ? onToggle : undefined}
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.default",
          minHeight: 48,
          cursor: collapsible ? "pointer" : "default",
          transition: "background-color 0.2s ease",
          ...(collapsible && {
            "&:hover": {
              bgcolor: (t) =>
                t.palette.mode === "dark"
                  ? "rgba(144, 202, 249, 0.08)"
                  : "rgba(25, 118, 210, 0.05)",
            },
          }),
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
          {series.title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {collapsible && (
            <Typography
              variant="body2"
              sx={{ color: "primary.main", fontWeight: 500, fontSize: "0.8rem" }}
            >
              Collapse
            </Typography>
          )}
          {showActions && isAuthor && (
            <IconButton
              aria-label="Series Actions"
              aria-controls={menuOpen ? "series-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={menuOpen ? "true" : undefined}
              size="small"
              onClick={onMenuOpen}
            >
              <MoreVert />
            </IconButton>
          )}
        </Box>
      </Box>
    </>
  );
}

interface SeriesContextMenuProps {
  anchorEl: HTMLElement | null;
  menuOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SeriesContextMenu({
  anchorEl,
  menuOpen,
  onClose,
  onEdit,
  onDelete,
}: SeriesContextMenuProps) {
  return (
    <Menu
      id="series-menu"
      anchorEl={anchorEl}
      open={menuOpen}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <MenuItem onClick={onEdit}>
        <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
        <ListItemText>Edit</ListItemText>
      </MenuItem>
      <MenuItem onClick={onDelete} sx={{ color: "error.main" }}>
        <ListItemIcon><Delete fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    </Menu>
  );
}

/**
 * Compact variant of SeriesCard
 *
 * Collapsible card showing:
 * - Collapsed: Series title centered with post count
 * - Expanded: Scrollable list of posts with series title in footer
 */
const CompactVariant: React.FC<CompactVariantProps> = memo(({
  series,
  posts,
  user,
  showActions = true,
  collapsible = true,
  defaultExpanded = false,
  onExpand,
  onCollapse,
  sx,
}) => {
  const theme = useTheme();
  const cardTheme = createCardTheme(theme);
  const isAuthor = !!user && user.id === series.authorId;

  const { isCollapsed, sortedPosts, handleToggle, handleCardClick } =
    useCompactVariantState(posts, defaultExpanded, series.id, onExpand, onCollapse);

  const { anchorEl, menuOpen, handleOpenMenu, handleCloseMenu, handleEdit, handleDelete } =
    useSeriesActions(series);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        borderRadius: 2,
        border: "2px solid",
        borderColor: cardTheme.colors.border,
        bgcolor: cardTheme.colors.cardBackground,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        "&:hover": {
          boxShadow: cardTheme.colors.shadow.hover,
          borderColor: "primary.light",
        },
        "&:focus-within": {
          boxShadow: "0 0 0 2px rgba(25, 118, 210, 0.2)",
          borderColor: "primary.main",
        },
        ...sx,
      }}
    >
      {isCollapsed && collapsible
        ? (
          <CollapsedView
            series={series}
            showActions={showActions}
            isAuthor={isAuthor}
            menuOpen={menuOpen}
            onToggle={handleToggle}
            onMenuOpen={handleOpenMenu}
          />
        )
        : (
          <ExpandedView
            series={series}
            sortedPosts={sortedPosts}
            collapsible={collapsible}
            showActions={showActions}
            isAuthor={isAuthor}
            menuOpen={menuOpen}
            onToggle={handleToggle}
            onCardClick={handleCardClick}
            onMenuOpen={handleOpenMenu}
          />
        )}

      <SeriesContextMenu
        anchorEl={anchorEl}
        menuOpen={menuOpen}
        onClose={handleCloseMenu}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </Box>
  );
});

CompactVariant.displayName = "CompactVariant";

export default CompactVariant;
