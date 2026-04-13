"use client";
import React from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { CheckCircle, PlayArrow } from "@mui/icons-material";
import { actions, useDispatch } from "@/store";
import { DocumentStatus, UserDocument } from "@/types";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import { useMenuState } from "@/hooks/useMenuState";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";

const STATUS_CONFIG: Record<
  DocumentStatus,
  { Icon: typeof PlayArrow; label: string; color: string }
> = {
  [DocumentStatus.ACTIVE]: {
    Icon: PlayArrow,
    label: "Mark as Active",
    color: "#1976d2",
  },
  [DocumentStatus.DONE]: {
    Icon: CheckCircle,
    label: "Mark as Done",
    color: "#2e7d32",
  },
};

interface StatusActionsProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}

const StatusActions: React.FC<StatusActionsProps> = ({
  userDocument,
  variant = "menuitem",
  closeMenu,
}) => {
  const dispatch = useDispatch();
  const isOnline = useOnlineStatus();
  const errorAnnounce = useErrorAnnounce();
  const { anchorEl, menuOpen: open, openMenu, closeMenu: closeStatusMenu } =
    useMenuState();

  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const document = cloudDocument || localDocument;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;
  const isAuthor = cloudDocument ? cloudDocument.author : true;

  // Only show status actions if user is the author
  if (!isAuthor) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (variant === "iconbutton") {
      openMenu(event);
    }
  };

  const handleClose = closeStatusMenu;

  const updateStatus = async (newStatus: DocumentStatus) => {
    closeStatusMenu();
    if (closeMenu) closeMenu();

    try {
      // Update both local and cloud documents if they exist
      if (localDocument) {
        await dispatch(actions.updateLocalDocument({
          id: userDocument.id,
          partial: { status: newStatus },
        }));
      }

      if (cloudDocument && isOnline) {
        // Update cloud document only if online
        await dispatch(actions.updateCloudDocument({
          id: userDocument.id,
          partial: { status: newStatus },
        }));
      } else if (cloudDocument && !isOnline) {
        // Show warning if trying to update cloud document while offline
        dispatch(actions.announce({
          message: {
            title: "Status updated locally",
            subtitle: "Will sync to cloud when back online",
          },
        }));
      }
    } catch (error) {
      errorAnnounce("Failed to update document status", error);
    }
  };

  const { Icon: CurrentIcon, color } = STATUS_CONFIG[currentStatus];

  if (variant === "iconbutton") {
    return (
      <>
        <IconButton
          onClick={handleClick}
          size="small"
          aria-label="Change status"
          sx={{ color }}
        >
          <CurrentIcon sx={{ color }} />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
        >
          {Object.values(DocumentStatus).map((status) => {
            const { Icon, label, color: itemColor } = STATUS_CONFIG[status];
            return (
              <MenuItem
                key={status}
                onClick={() => updateStatus(status)}
                selected={currentStatus === status}
              >
                <ListItemIcon>
                  <Icon sx={{ color: itemColor }} />
                </ListItemIcon>
                <ListItemText primary={label} />
              </MenuItem>
            );
          })}
        </Menu>
      </>
    );
  }

  // Menu item variant
  return (
    <>
      {Object.values(DocumentStatus).map((status) => {
        if (status === currentStatus) return null; // Don't show current status
        const { Icon, label, color: itemColor } = STATUS_CONFIG[status];
        return (
          <MenuItem
            key={status}
            onClick={() => updateStatus(status)}
          >
            <ListItemIcon>
              <Icon sx={{ color: itemColor }} />
            </ListItemIcon>
            <ListItemText primary={label} />
          </MenuItem>
        );
      })}
    </>
  );
};

export default StatusActions;
