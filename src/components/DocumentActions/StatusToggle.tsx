"use client";
import React from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { CheckCircle, PlayArrow } from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { DocumentStatus, UserDocument } from "@/types";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";

interface StatusToggleProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}

const STATUS_CONFIG: Record<
  DocumentStatus,
  { Icon: typeof PlayArrow; label: string; next: DocumentStatus; color: string }
> = {
  [DocumentStatus.ACTIVE]: {
    Icon: PlayArrow,
    label: "Active",
    next: DocumentStatus.DONE,
    color: "info.main",
  },
  [DocumentStatus.DONE]: {
    Icon: CheckCircle,
    label: "Done",
    next: DocumentStatus.ACTIVE,
    color: "text.secondary",
  },
};

const StatusToggle: React.FC<StatusToggleProps> = ({
  userDocument,
  variant = "iconbutton",
  closeMenu,
}) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const isOnline = useOnlineStatus();
  const errorAnnounce = useErrorAnnounce();

  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;

  // Only show for authors
  if (!isAuthor) return null;

  const document = isLocal ? localDocument : cloudDocument;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;
  const currentConfig = STATUS_CONFIG[currentStatus];

  const handleToggleStatus = async () => {
    if (closeMenu) closeMenu();

    const nextStatus = currentConfig.next;

    try {
      if (isLocal) {
        // Update local document
        await dispatch(actions.updateLocalDocument({
          id: userDocument.id,
          partial: { status: nextStatus },
        }));
      }

      if (isCloud && isOnline) {
        // Update cloud document only if online
        await dispatch(actions.updateCloudDocument({
          id: userDocument.id,
          partial: { status: nextStatus },
        }));
      } else if (isCloud && !isOnline) {
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

  const { Icon: CurrentIcon, label, color } = currentConfig;
  const nextConfig = STATUS_CONFIG[currentConfig.next];

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleToggleStatus}>
        <ListItemIcon>
          <CurrentIcon />
        </ListItemIcon>
        <ListItemText>
          Mark as {nextConfig.label}
        </ListItemText>
      </MenuItem>
    );
  }

  return (
    <Tooltip
      title={`Currently ${label} - Click to mark as ${nextConfig.label}`}
      placement="top"
    >
      <IconButton
        onClick={handleToggleStatus}
        size="small"
        aria-label={`Toggle status - currently ${label}`}
        sx={{ color }}
      >
        <CurrentIcon />
      </IconButton>
    </Tooltip>
  );
};

export default StatusToggle;
