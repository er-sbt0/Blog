"use client";
import { useCallback, useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { actions, selectIsDirty, useDispatch, useSelector } from "@/store";
import { apiClient } from "@/api";
import { triggerSave } from "./saveRegistry";
import SaveDiscardActions from "./SaveDiscardActions";
import EditorTabBar, { type TabMeta } from "./EditorTabBar";
import EditorTabPanel from "./EditorTabPanel";
import type { DocumentCreateInput } from "@/types";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";

interface TabbedDocumentEditorProps {
  rootId: string;
}

const EMPTY_EDITOR_STATE = {
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
};

const TabbedDocumentEditor: React.FC<TabbedDocumentEditorProps> = ({
  rootId,
}) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const isDirty = useSelector(selectIsDirty);
  const tabs = useSelector((state) => state.ui.tabs);
  const user = useSelector((state) => state.user);

  // Which tab panels have been mounted at least once (lazy-mount pattern).
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(
    () => new Set([rootId]),
  );

  // Local tab metadata (name + order) mirrors Redux tab IDs.
  const [tabMetas, setTabMetas] = useState<TabMeta[]>([]);

  // Confirm-delete dialog state.
  const [deleteTarget, setDeleteTarget] = useState<TabMeta | null>(null);

  // Load root metadata + children on mount.
  useAsyncEffect(async (isCancelled) => {
    dispatch(actions.clearTabs());

    const [rootDoc, children] = await Promise.all([
      apiClient.documents.get(rootId),
      apiClient.documents.children(rootId),
    ]);

    if (isCancelled()) return;

    const childIds = (children ?? []).map((c) => c.id);
    dispatch(actions.initTabs({ rootId, childIds }));

    const metas: TabMeta[] = [
      { id: rootId, name: rootDoc?.name ?? "Document" },
      ...(children ?? []).map((c) => ({ id: c.id, name: c.name })),
    ];
    setTabMetas(metas);
    setMountedTabIds(new Set([rootId]));
  }, [rootId]);

  const handleSwitch = useCallback((tabId: string) => {
    setMountedTabIds((prev) => new Set([...prev, tabId]));
    dispatch(actions.setActiveTab(tabId));
  }, [dispatch]);

  const handleAdd = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const id = uuidv4();
    const revisionId = uuidv4();

    const newDoc: DocumentCreateInput = {
      id,
      name: "Untitled",
      head: revisionId,
      createdAt: now,
      updatedAt: now,
      type: "DOCUMENT",
      parentId: rootId,
      sort_order: tabMetas.length,
      data: EMPTY_EDITOR_STATE as DocumentCreateInput["data"],
      revisions: [{ id: revisionId, documentId: id, createdAt: now, data: EMPTY_EDITOR_STATE as DocumentCreateInput["data"] }],
    };

    const created = await apiClient.documents.create(newDoc);
    if (!created) return;

    await dispatch(actions.createLocalDocument(newDoc));

    const newMeta: TabMeta = { id, name: "Untitled" };
    setTabMetas((prev) => [...prev, newMeta]);
    setMountedTabIds((prev) => new Set([...prev, id]));
    dispatch(actions.addTab(id));
  }, [user, rootId, tabMetas.length, dispatch]);

  const handleCloseRequest = useCallback((tabId: string) => {
    const meta = tabMetas.find((t) => t.id === tabId);
    if (meta) setDeleteTarget(meta);
  }, [tabMetas]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);

    await apiClient.documents.delete(id);
    await dispatch(actions.deleteLocalDocument(id));

    setTabMetas((prev) => prev.filter((t) => t.id !== id));
    setMountedTabIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    dispatch(actions.removeTab(id));
  }, [deleteTarget, dispatch]);

  const handleRename = useCallback(async (tabId: string, newName: string) => {
    setTabMetas((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: newName } : t))
    );
    await apiClient.documents.update(tabId, { name: newName });
  }, []);

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    dispatch(actions.reorderTabs(orderedIds));
    setTabMetas((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      return orderedIds.map((id) => map.get(id)!).filter(Boolean);
    });

    // Persist new sort_order for child tabs (skip root at index 0).
    const updates = orderedIds
      .slice(1)
      .map((id, i) => apiClient.documents.update(id, { sort_order: i }));
    await Promise.all(updates);
  }, [dispatch]);

  const handleSave = useCallback(async () => {
    const ok = await triggerSave();
    if (ok) router.push(`/view/${rootId}`);
  }, [router, rootId]);

  const handleDiscard = useCallback(() => {
    // Navigate to the root doc's view page.
    router.push(`/view/${rootId}`);
  }, [router, rootId]);

  // Build the ordered tab list from Redux tabIds + local metadata.
  const orderedTabs: TabMeta[] = tabs.tabIds
    .map((id) => tabMetas.find((m) => m.id === id))
    .filter((m): m is TabMeta => !!m);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {orderedTabs.length > 0 && (
        <EditorTabBar
          tabs={orderedTabs}
          activeTabId={tabs.activeTabId}
          dirtyTabIds={tabs.dirtyTabIds}
          rootTabId={rootId}
          onSwitch={handleSwitch}
          onClose={handleCloseRequest}
          onAdd={handleAdd}
          onRename={handleRename}
          onReorder={handleReorder}
        />
      )}

      {tabs.tabIds.map((tabId) => (
        <EditorTabPanel
          key={tabId}
          docId={tabId}
          isActive={tabId === tabs.activeTabId}
          onDiscard={handleDiscard}
        />
      ))}

      <SaveDiscardActions
        onSave={handleSave}
        onDiscard={handleDiscard}
        isDirty={isDirty}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogTitle>Delete tab?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`Delete "${deleteTarget?.name}"? This cannot be undone.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TabbedDocumentEditor;
