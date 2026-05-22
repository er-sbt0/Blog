"use client";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import {
  CallSplit,
  ContentCopy,
  Delete,
  DriveFileMove,
  DriveFileRenameOutline,
  PushPin,
  SwapVert,
} from "@mui/icons-material";

interface TabContextMenuProps {
  anchorEl: HTMLElement | null;
  tabId: string | null;
  isRoot: boolean;
  onClose: () => void;
  onRename: (tabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onMove: (tabId: string) => void;
  onSplitOff: (tabId: string) => void;
  onDelete: (tabId: string) => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  anchorEl,
  tabId,
  isRoot,
  onClose,
  onRename,
  onDuplicate,
  onMove,
  onSplitOff,
  onDelete,
}) => {
  const wrap = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (!tabId) return null;

  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 210 } } }}
    >
      <MenuItem onClick={wrap(() => onRename(tabId))}>
        <ListItemIcon>
          <DriveFileRenameOutline fontSize="small" />
        </ListItemIcon>
        <ListItemText>Rename</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          F2
        </Typography>
      </MenuItem>

      <MenuItem onClick={wrap(() => onDuplicate(tabId))}>
        <ListItemIcon>
          <ContentCopy fontSize="small" />
        </ListItemIcon>
        <ListItemText>Duplicate tab</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          ⌘D
        </Typography>
      </MenuItem>

      {!isRoot && (
        <MenuItem onClick={wrap(() => onMove(tabId))}>
          <ListItemIcon>
            <DriveFileMove fontSize="small" />
          </ListItemIcon>
          <ListItemText>Move to other post…</ListItemText>
        </MenuItem>
      )}

      {!isRoot && (
        <MenuItem onClick={wrap(() => onSplitOff(tabId))}>
          <ListItemIcon>
            <CallSplit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Split off as new post</ListItemText>
        </MenuItem>
      )}

      <Divider />

      <MenuItem disabled>
        <ListItemIcon>
          <PushPin fontSize="small" />
        </ListItemIcon>
        <ListItemText>Pin tab</ListItemText>
      </MenuItem>

      <MenuItem disabled>
        <ListItemIcon>
          <SwapVert fontSize="small" />
        </ListItemIcon>
        <ListItemText>Reorder…</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem
        disabled={isRoot}
        onClick={wrap(() => onDelete(tabId))}
        sx={{ color: isRoot ? undefined : "error.main" }}
      >
        <ListItemIcon>
          <Delete fontSize="small" color={isRoot ? "disabled" : "error"} />
        </ListItemIcon>
        <ListItemText>Delete tab</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          ⌘⌫
        </Typography>
      </MenuItem>
    </Menu>
  );
};

export default TabContextMenu;
