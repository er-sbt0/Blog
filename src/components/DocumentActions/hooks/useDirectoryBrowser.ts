"use client";
import { useEffect, useState } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { UserDocument } from "@/types";

export type BreadcrumbEntry = { id: string | null; name: string };

export function useDirectoryBrowser(userDocument: UserDocument) {
  const dispatch = useDispatch();
  const documents = useSelector((state) => state.documents);

  const doc = userDocument?.local || userDocument?.cloud;
  const documentId = userDocument.id;
  const documentName = doc?.name || "Document";
  const currentParentId = doc?.parentId || null;

  const [loading, setLoading] = useState(false);
  const [currentDirectoryId, setCurrentDirectoryId] = useState<string | null>(
    null,
  );
  const [directories, setDirectories] = useState<UserDocument[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);

  const isRootLevel = (d: UserDocument) => {
    const localParentId = d.local?.parentId;
    const cloudParentId = d.cloud?.parentId;
    return (
      localParentId === null ||
      localParentId === undefined ||
      cloudParentId === null ||
      cloudParentId === undefined
    );
  };

  const isChildOf = (
    directoryId: string,
    potentialParentId: string,
  ): boolean => {
    try {
      if (!Array.isArray(documents)) return false;
      const directory = documents.find((d) => d && d.id === directoryId);
      if (!directory) return false;
      const parentId = directory.local?.parentId || directory.cloud?.parentId;
      if (!parentId) return false;
      if (parentId === potentialParentId) return true;

      const MAX_DEPTH = 10;
      const check = (
        dirId: string,
        potParentId: string,
        depth: number,
      ): boolean => {
        if (depth >= MAX_DEPTH) return false;
        const d = documents.find((x) => x && x.id === dirId);
        if (!d) return false;
        const pId = d.local?.parentId || d.cloud?.parentId;
        if (!pId) return false;
        if (pId === potParentId) return true;
        return check(pId, potParentId, depth + 1);
      };
      return check(parentId, potentialParentId, 0);
    } catch {
      return false;
    }
  };

  const buildBreadcrumbs = (
    dirId: string | null,
    trail: BreadcrumbEntry[] = [],
  ): BreadcrumbEntry[] => {
    if (dirId === null) return [{ id: null, name: "Root" }];
    const dir = documents.find((d) => d.id === dirId);
    if (!dir) return [{ id: null, name: "Root" }];
    const name = dir.local?.name || dir.cloud?.name || "Directory";
    const parentId = dir.local?.parentId || dir.cloud?.parentId;
    const newTrail = [{ id: dirId, name }, ...trail];
    if (parentId) return buildBreadcrumbs(parentId, newTrail);
    return [{ id: null, name: "Root" }, ...newTrail];
  };

  const loadDirectories = (directoryId: string | null) => {
    try {
      setLoading(true);
      setCurrentDirectoryId(directoryId);

      if (!Array.isArray(documents)) {
        setDirectories([]);
        setBreadcrumbs([{ id: null, name: "Root" }]);
        setLoading(false);
        return;
      }

      // No real directories in blog structure — always empty
      const allDirectories = documents.filter((d) => {
        if (!d) return false;
        // isDirectory is always false in blog mode; still apply self/child guards
        return false && d.id !== documentId && !isChildOf(d.id, documentId);
      });

      const directoriesAtLevel = allDirectories.filter((dir) => {
        const parentId = dir.local?.parentId || dir.cloud?.parentId;
        return directoryId === null
          ? isRootLevel(dir)
          : parentId === directoryId;
      });

      setDirectories(directoriesAtLevel);
      setBreadcrumbs(
        directoryId
          ? buildBreadcrumbs(directoryId)
          : [{ id: null, name: "Root" }],
      );
    } catch {
      setDirectories([]);
      setBreadcrumbs([{ id: null, name: "Root" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleMove = async (onDone: () => void) => {
    if (currentDirectoryId === currentParentId) {
      onDone();
      return;
    }
    setLoading(true);
    try {
      if (userDocument.local) {
        await dispatch(
          actions.updateLocalDocument({
            id: documentId,
            partial: { parentId: currentDirectoryId },
          }),
        );
      }
      if (userDocument.cloud) {
        await dispatch(
          actions.updateCloudDocument({
            id: documentId,
            partial: { parentId: currentDirectoryId },
          }),
        );
      }
      const targetDir = currentDirectoryId
        ? documents.find((d) => d.id === currentDirectoryId)
        : null;
      const targetDirName = targetDir
        ? targetDir.local?.name || targetDir.cloud?.name || "directory"
        : "Root";
      dispatch(
        actions.announce({
          message: { title: `Moved ${documentName} to ${targetDirName}` },
          timeout: 3000,
        }),
      );
      onDone();
    } catch {
      dispatch(
        actions.announce({
          message: {
            title: "Failed to move item",
            subtitle: "An error occurred while moving the item",
          },
          timeout: 3000,
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    documents,
    documentName,
    currentParentId,
    loading,
    currentDirectoryId,
    directories,
    breadcrumbs,
    loadDirectories,
    handleMove,
  };
}
