import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actions, type RootState, useDispatch, useSelector } from "@/store";

export interface PostItemActions {
  renamingPostId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  handleContextMenu: (event: React.MouseEvent, postId: string) => void;
  handleDoubleClick: (
    event: React.MouseEvent,
    postId: string,
    currentName: string,
  ) => void;
  handleRenameBlur: () => void;
  handleRenameKeyDown: (event: React.KeyboardEvent) => void;
}

export interface SidebarActionsResult extends PostItemActions {
  contextMenu: { mouseX: number; mouseY: number; postId: string } | null;
  handleCloseContextMenu: () => void;
  handleEditPost: (postId: string) => void;
  handleRenameFromMenu: (postId: string) => void;
  handleDeletePost: (postId: string) => Promise<void>;
}

export function useSidebarActions(): SidebarActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const documents = useSelector((state: RootState) => state.documents);

  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    postId: string;
  } | null>(null);

  const [renamingPostId, setRenamingPostId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, postId: string) => {
      event.preventDefault();
      setContextMenu((prev) =>
        prev === null
          ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, postId }
          : null
      );
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleEditPost = useCallback(
    (postId: string) => {
      handleCloseContextMenu();
      router.push(`/edit/${postId}`);
    },
    [router, handleCloseContextMenu],
  );

  const handleRenameFromMenu = useCallback(
    (postId: string) => {
      handleCloseContextMenu();
      const doc = documents?.find((d) => d.id === postId);
      if (doc) {
        const docName = (doc.cloud || doc.local)?.name || "Untitled";
        setRenamingPostId(postId);
        setRenameValue(docName);
      }
    },
    [handleCloseContextMenu, documents],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      handleCloseContextMenu();
      if (confirm("Are you sure you want to delete this post?")) {
        const doc = documents?.find((d) => d.id === postId);
        if (doc) {
          if (doc.cloud) {
            const result = await dispatch(actions.deleteCloudDocument(postId));
            if (result.type === actions.deleteCloudDocument.fulfilled.type) {
              router.refresh();
            }
          } else if (doc.local) {
            dispatch(actions.deleteLocalDocument(postId));
          }
        }
      }
    },
    [dispatch, handleCloseContextMenu, documents, router],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent, postId: string, currentName: string) => {
      event.preventDefault();
      setRenamingPostId(postId);
      setRenameValue(currentName);
    },
    [],
  );

  const handleRenameBlur = useCallback(() => {
    if (renamingPostId && renameValue.trim()) {
      const doc = documents?.find((d) => d.id === renamingPostId);
      if (doc) {
        if (doc.cloud) {
          dispatch(
            actions.updateCloudDocument({
              id: renamingPostId,
              partial: { name: renameValue.trim() },
            }),
          );
        } else if (doc.local) {
          dispatch(
            actions.updateLocalDocument({
              id: renamingPostId,
              partial: { name: renameValue.trim() },
            }),
          );
        }
      }
    }
    setRenamingPostId(null);
    setRenameValue("");
  }, [dispatch, renamingPostId, renameValue, documents]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRenameBlur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setRenamingPostId(null);
        setRenameValue("");
      }
    },
    [handleRenameBlur],
  );

  useEffect(() => {
    if (renamingPostId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPostId]);

  return {
    contextMenu,
    renamingPostId,
    renameValue,
    setRenameValue,
    renameInputRef,
    handleContextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    handleDoubleClick,
    handleRenameBlur,
    handleRenameKeyDown,
  };
}
