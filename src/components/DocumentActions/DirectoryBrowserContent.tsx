"use client";
import React from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Divider,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  ArrowForward,
  Folder,
  Home as HomeIcon,
} from "@mui/icons-material";
import { UserDocument } from "@/types";
import { BreadcrumbEntry } from "./hooks/useDirectoryBrowser";

interface DirectoryBrowserContentProps {
  documentName: string;
  currentParentId: string | null;
  currentDirectoryId: string | null;
  directories: UserDocument[];
  breadcrumbs: BreadcrumbEntry[];
  loading: boolean;
  documents: UserDocument[];
  onMove: () => void;
  onDirectoryClick: (id: string) => void;
  onBreadcrumbClick: (id: string | null) => void;
  /** Compact mode — used inside a Popover with limited height */
  compact?: boolean;
}

const DirectoryBrowserContent: React.FC<DirectoryBrowserContentProps> = ({
  documentName,
  currentParentId,
  currentDirectoryId,
  directories,
  breadcrumbs,
  loading,
  documents,
  onMove,
  onDirectoryClick,
  onBreadcrumbClick,
  compact = false,
}) => {
  return (
    <Box sx={{ mb: 2, overflow: "auto", maxHeight: compact ? 350 : undefined }}>
      <Typography variant={compact ? "h6" : "subtitle1"} gutterBottom>
        {compact
          ? `Move Document: ${documentName}`
          : "Select destination folder:"}
      </Typography>

      <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
        <Breadcrumbs
          aria-label="directory navigation breadcrumbs"
          maxItems={compact ? 3 : undefined}
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const icon = crumb.id === null
              ? (
                <HomeIcon
                  sx={{ mr: 0.5, fontSize: compact ? "0.875rem" : "1rem" }}
                />
              )
              : (
                <Folder
                  sx={{ mr: 0.5, fontSize: compact ? "0.875rem" : "1rem" }}
                />
              );

            if (isLast) {
              return (
                <Typography
                  key={crumb.id || "root"}
                  color="text.primary"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: "medium",
                    fontSize: compact ? "0.875rem" : undefined,
                  }}
                >
                  {icon}
                  {crumb.name}
                </Typography>
              );
            }
            return (
              <Link
                key={crumb.id || "root"}
                component={compact ? "span" : "button"}
                underline="hover"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.primary",
                  fontSize: compact ? "0.875rem" : undefined,
                  cursor: "pointer",
                }}
                onClick={() => onBreadcrumbClick(crumb.id)}
              >
                {icon}
                {crumb.name}
              </Link>
            );
          })}
        </Breadcrumbs>
      </Paper>

      {loading
        ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              p: compact ? 2 : 3,
            }}
          >
            <CircularProgress size={compact ? 32 : 40} />
          </Box>
        )
        : (
          <>
            {/* Move-to-current-directory shortcut (compact only) */}
            {compact && (
              <ListItem
                disablePadding
                sx={{
                  mb: 2,
                  border: "2px solid",
                  borderColor: "primary.main",
                  borderRadius: 1,
                  bgcolor: "action.selected",
                }}
              >
                <ListItemButton
                  onClick={onMove}
                  sx={{ borderRadius: 1, py: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Folder color="primary" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={`Move to: ${
                      breadcrumbs[breadcrumbs.length - 1]?.name || "Root"
                    }`}
                    primaryTypographyProps={{
                      fontWeight: "medium",
                      fontSize: "0.875rem",
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )}

            {compact && directories.length > 0 && <Divider sx={{ my: 1 }} />}

            {directories.length > 0
              ? (
                <List dense={compact} disablePadding={compact}>
                  {directories.map((directory) => {
                    const dirName = directory.local?.name ||
                      directory.cloud?.name || "Directory";
                    const isCurrentParent = directory.id === currentParentId;
                    return (
                      <ListItem key={directory.id} disablePadding>
                        <ListItemButton
                          onClick={() => onDirectoryClick(directory.id)}
                          sx={{
                            borderRadius: 1,
                            py: compact ? 0.5 : undefined,
                            "&:hover": compact
                              ? { bgcolor: "action.hover" }
                              : undefined,
                            ...(isCurrentParent &&
                              { bgcolor: "action.selected" }),
                          }}
                        >
                          <ListItemIcon
                            sx={compact ? { minWidth: 36 } : undefined}
                          >
                            <Folder
                              color={isCurrentParent ? "primary" : "inherit"}
                              fontSize="small"
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={dirName}
                            primaryTypographyProps={{
                              fontWeight: isCurrentParent
                                ? "medium"
                                : "regular",
                              fontSize: compact ? "0.875rem" : undefined,
                            }}
                          />
                          <ArrowForward fontSize="small" color="action" />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              )
              : (
                <Box sx={{ p: 2, textAlign: "center" }}>
                  <Typography
                    color="text.secondary"
                    variant={compact ? "body2" : "body1"}
                  >
                    {compact
                      ? "No subfolders found"
                      : "No folders found at this level"}
                  </Typography>
                </Box>
              )}

            {currentDirectoryId && (
              <Box sx={{ mt: compact ? 1 : 2 }}>
                <Button
                  startIcon={<ArrowBack />}
                  onClick={() => {
                    const parentIndex = breadcrumbs.length - 2;
                    if (parentIndex >= 0) {
                      onBreadcrumbClick(breadcrumbs[parentIndex].id);
                    }
                  }}
                  size="small"
                >
                  {compact ? "Back" : "Back to parent folder"}
                </Button>
              </Box>
            )}
          </>
        )}
    </Box>
  );
};

export default DirectoryBrowserContent;
