"use client";
import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

export interface TabMeta {
  id: string;
  name: string;
}

interface EditorTabBarProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  dirtyTabIds: string[];
  rootTabId: string;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, newName: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

interface TabItemProps {
  tab: TabMeta;
  index: number;
  isActive: boolean;
  isDirty: boolean;
  isRoot: boolean;
  onSwitch: () => void;
  onClose: () => void;
  onRename: (newName: string) => void;
}

const TabItem: React.FC<TabItemProps> = ({
  tab,
  index,
  isActive,
  isDirty,
  isRoot,
  onSwitch,
  onClose,
  onRename,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.name) onRename(trimmed);
    else setDraft(tab.name);
  };

  return (
    <Draggable draggableId={tab.id} index={index} isDragDisabled={isRoot}>
      {(provided, snapshot) => (
        <Box
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onSwitch}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            py: 0.75,
            minWidth: 80,
            maxWidth: 180,
            cursor: "pointer",
            userSelect: "none",
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: isActive
              ? "background.paper"
              : snapshot.isDragging
              ? "action.selected"
              : "action.hover",
            borderBottom: isActive ? "2px solid" : "2px solid transparent",
            borderBottomColor: isActive ? "primary.main" : "transparent",
            transition: "background-color 0.15s",
            flexShrink: 0,
            "&:hover .tab-close": { opacity: 1 },
          }}
        >
          {/* Dirty indicator */}
          {isDirty && (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: "primary.main",
                flexShrink: 0,
              }}
            />
          )}

          {/* Label or inline input */}
          {editing ? (
            <Box
              component="input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraft(tab.name);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              sx={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "1px solid",
                outlineColor: "primary.main",
                borderRadius: 0.5,
                bgcolor: "background.paper",
                color: "text.primary",
                fontSize: "0.8rem",
                fontFamily: "inherit",
                px: 0.5,
                py: 0,
              }}
            />
          ) : (
            <Typography
              noWrap
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraft(tab.name);
                setEditing(true);
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: "0.8rem",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "text.primary" : "text.secondary",
              }}
            >
              {tab.name}
            </Typography>
          )}

          {/* Close button — hidden on root tab */}
          {!isRoot && (
            <Tooltip title="Delete tab">
              <IconButton
                className="tab-close"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                sx={{
                  opacity: isActive ? 1 : 0,
                  p: 0.25,
                  transition: "opacity 0.15s",
                  color: "text.secondary",
                  "&:hover": { color: "error.main" },
                }}
              >
                <Close sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Draggable>
  );
};

const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTabId,
  dirtyTabIds,
  rootTabId,
  onSwitch,
  onClose,
  onAdd,
  onRename,
  onReorder,
}) => {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const src = result.source.index;
    const dst = result.destination.index;
    if (src === dst) return;
    // Root tab is always pinned at index 0 — prevent moving anything before it
    if (dst === 0) return;

    const reordered = [...tabs];
    const [moved] = reordered.splice(src, 1);
    reordered.splice(dst, 0, moved);
    onReorder(reordered.map((t) => t.id));
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "action.hover",
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        "&::-webkit-scrollbar": { height: 3 },
        "&::-webkit-scrollbar-thumb": { bgcolor: "divider" },
      }}
    >
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="editor-tabs" direction="horizontal">
          {(provided) => (
            <Box
              ref={provided.innerRef}
              {...provided.droppableProps}
              sx={{ display: "flex", alignItems: "stretch" }}
            >
              {tabs.map((tab, index) => (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={tab.id === activeTabId}
                  isDirty={dirtyTabIds.includes(tab.id)}
                  isRoot={tab.id === rootTabId}
                  onSwitch={() => onSwitch(tab.id)}
                  onClose={() => onClose(tab.id)}
                  onRename={(name) => onRename(tab.id, name)}
                />
              ))}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      </DragDropContext>

      <Tooltip title="New sub-doc">
        <IconButton
          size="small"
          onClick={onAdd}
          sx={{ px: 1.5, borderRadius: 0, flexShrink: 0 }}
        >
          <Add fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default EditorTabBar;
