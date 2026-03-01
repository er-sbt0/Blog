"use client";
import { useCallback, useEffect, useState } from "react";
import { debounce } from "@mui/material/utils";
import { validate } from "uuid";
import { actions, useDispatch, useSelector } from "@/store";
import {
  CheckHandleResponse,
  DocumentStatus,
  DocumentUpdateInput,
  User,
  UserDocument,
} from "@/types";

export function useEditDocumentForm(userDocument: UserDocument) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isUploaded = isLocal && isCloud;
  const isPublished = isCloud && cloudDocument.published;
  const isCollab = isCloud && cloudDocument.collab;
  const isPrivate = isCloud && cloudDocument.private;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const id = userDocument.id;
  const name = cloudDocument?.name ?? localDocument?.name ??
    "Untitled Document";
  const handle = cloudDocument?.handle ?? localDocument?.handle ?? null;
  const isCloudOnly = !isLocal && isCloud;
  const document = isCloudOnly ? cloudDocument : localDocument;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;

  const [input, setInput] = useState<Partial<DocumentUpdateInput>>({
    name,
    handle,
    coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
    private: isPrivate,
    published: isPublished,
    collab: isCollab,
    background_image: document?.background_image || null,
    sort_order: document?.sort_order || null,
    createdAt: document?.createdAt || new Date().toISOString(),
    status: currentStatus,
  });
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const hasErrors = Object.keys(validationErrors).length > 0;

  useEffect(() => {
    setInput({
      name,
      handle,
      description: document?.description || "",
      coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
      private: isPrivate,
      published: isPublished,
      collab: isCollab,
      background_image: document?.background_image || null,
      sort_order: document?.sort_order || null,
      createdAt: document?.createdAt || new Date().toISOString(),
      status: currentStatus,
    });
    setValidating(false);
    setValidationErrors({});
  }, [userDocument, editDialogOpen]);

  const openEditDialog = (closeMenu?: () => void) => {
    if (closeMenu) closeMenu();
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => setEditDialogOpen(false);

  const updateInput = (partial: Partial<DocumentUpdateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    updateInput({ coauthors });
  };

  const updateBackgroundImage = (imagePath: string | null) => {
    updateInput({ background_image: imagePath });
  };

  const checkHandle = useCallback(
    debounce(async (handle: string) => {
      try {
        const response = await fetch(`/api/documents/check?handle=${handle}`);
        const { error } = (await response.json()) as CheckHandleResponse;
        if (error) {
          setValidationErrors({ handle: `${error.title}: ${error.subtitle}` });
        } else setValidationErrors({});
      } catch {
        setValidationErrors({
          handle: "Something went wrong: Please try again later",
        });
      }
      setValidating(false);
    }, 500),
    [],
  );

  const updateHandle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim().toLowerCase().replace(
      /[^A-Za-z0-9]/g,
      "-",
    );
    updateInput({ handle: value });
    if (!value || value === handle) return setValidationErrors({});
    if (value.length < 3) {
      return setValidationErrors({
        handle:
          "Handle is too short: Handle must be at least 3 characters long",
      });
    }
    if (!/^[a-zA-Z0-9-]+$/.test(value)) {
      return setValidationErrors({
        handle:
          "Invalid Handle: Handle must only contain letters, numbers, and hyphens",
      });
    }
    if (validate(value)) {
      return setValidationErrors({
        handle: "Invalid Handle: Handle must not be a UUID",
      });
    }
    setValidating(true);
    checkHandle(value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeEditDialog();
    const partial: Partial<DocumentUpdateInput> = {};
    if (input.name !== name) {
      partial.name = input.name;
      partial.updatedAt = new Date().toISOString();
    }
    if (input.handle !== handle) partial.handle = input.handle || null;
    if (input.description !== document?.description) {
      partial.description = input.description || null;
    }
    if (
      input.coauthors?.join(",") !==
        cloudDocument?.coauthors.map((u) => u.email).join(",")
    ) {
      partial.coauthors = input.coauthors;
    }
    if (input.private !== isPrivate) partial.private = input.private;
    if (input.published !== isPublished) partial.published = input.published;
    if (input.collab !== isCollab) partial.collab = input.collab;
    if (input.background_image !== document?.background_image) {
      partial.background_image = input.background_image;
    }
    if (input.sort_order !== document?.sort_order) {
      partial.sort_order = input.sort_order;
    }
    if (input.createdAt && input.createdAt !== document?.createdAt) {
      partial.createdAt = input.createdAt;
    }
    if (input.status !== currentStatus) partial.status = input.status;
    if (document?.parentId) partial.parentId = document.parentId;

    if (Object.keys(partial).length === 0) return;
    if (isLocal) {
      try {
        dispatch(actions.updateLocalDocument({ id, partial }));
      } catch {
        dispatch(actions.announce({
          message: {
            title: "Error Updating Document",
            subtitle: "An error occurred while updating local document",
          },
        }));
      }
    }
    if (isUploaded || isCloud) {
      await dispatch(actions.updateCloudDocument({ id, partial }));
    }
  };

  return {
    cloudDocument,
    document,
    isLocal,
    isCloud,
    isAuthor,
    isPublished,
    isCollab,
    isPrivate,
    input,
    validating,
    validationErrors,
    hasErrors,
    editDialogOpen,
    updateInput,
    updateCoauthors,
    updateBackgroundImage,
    updateHandle,
    openEditDialog,
    closeEditDialog,
    handleSubmit,
  };
}
