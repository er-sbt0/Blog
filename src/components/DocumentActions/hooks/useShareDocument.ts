"use client";
import { useState, useRef } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { DocumentUpdateInput, User, UserDocument } from "@/types";
import { useSearchParams } from "next/navigation";

export function useShareDocument(userDocument: UserDocument) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isCloud = !!cloudDocument;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const isCollab = isCloud && cloudDocument.collab;
  const isPrivate = isCloud && cloudDocument.private;
  const id = userDocument.id;
  const name = cloudDocument?.name ?? localDocument?.name ?? "Untitled Document";
  const handle = cloudDocument?.handle ?? localDocument?.handle ?? null;

  const formats = ["view", "embed", "pdf", "docx"];
  if (isAuthor || isCollab) formats.push("edit");

  const [format, setFormat] = useState("view");
  const [revision, setRevision] = useState(cloudDocument?.head ?? null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const shareFormRef = useRef<HTMLFormElement>(null);
  const searchParams = useSearchParams();

  const openShareDialog = () => {
    setFormat(cloudDocument?.collab ? "edit" : "view");
    const v = searchParams.get("v");
    setRevision(v || (cloudDocument?.head ?? null));
    setShareDialogOpen(true);
  };

  const closeShareDialog = (closeMenu?: () => void) => {
    setShareDialogOpen(false);
    if (closeMenu) closeMenu();
  };

  function getShareUrl(formdata: FormData) {
    const url = new URL(window.location.origin);
    url.pathname = `/${format}/${handle || id}`;
    if (revision && revision !== cloudDocument?.head) {
      url.searchParams.append("v", revision);
    }
    if (format === "pdf") {
      url.pathname += ".pdf";
      const scale = formdata.get("scale") as string;
      const landscape = formdata.get("landscape") as string;
      const fmt = formdata.get("format") as string;
      scale !== "1" && url.searchParams.append("scale", scale);
      landscape !== "false" && url.searchParams.append("landscape", landscape);
      fmt !== "a4" && url.searchParams.append("format", fmt);
    }
    if (format === "docx") url.pathname += ".docx";
    return url;
  }

  const copyLink = async () => {
    const shareForm = shareFormRef.current;
    if (!shareForm) return;
    const url = getShareUrl(new FormData(shareForm));
    try {
      await navigator.clipboard.writeText(url.toString());
      dispatch(actions.announce({ message: { title: "Link Copied to Clipboard" } }));
    } catch {
      dispatch(actions.announce({ message: { title: "Failed to Copy Link to Clipboard" } }));
    }
  };

  const handleShare = async (
    event: React.FormEvent<HTMLFormElement>,
    closeMenu?: () => void,
  ) => {
    event.preventDefault();
    const formdata = new FormData(event.currentTarget);
    if (!isCloud) {
      return dispatch(actions.announce({
        message: {
          title: "Document is not saved to the cloud",
          subtitle: "Please save document to the cloud first",
        },
      }));
    }
    const url = getShareUrl(formdata);
    closeShareDialog(closeMenu);
    await navigator.share({ title: name, url: url.toString() });
  };

  const togglePrivate = async () => {
    if (!isCloud) {
      return dispatch(actions.announce({
        message: {
          title: "Document is not saved to the cloud",
          subtitle: "Please save document to the cloud first",
        },
      }));
    }
    const payload: { id: string; partial: DocumentUpdateInput } = {
      id,
      partial: { private: !isPrivate },
    };
    if (isPrivate === false) {
      if (cloudDocument?.published) payload.partial.published = false;
      if (cloudDocument?.collab) payload.partial.collab = false;
    }
    const response = await dispatch(actions.updateCloudDocument(payload));
    if (response.type === actions.updateCloudDocument.fulfilled.type) {
      dispatch(actions.announce({
        message: {
          title: "Document Privacy Updated",
          subtitle: `Document is now ${payload.partial.private ? "private" : "shared by link"}`,
        },
      }));
    }
  };

  const toggleCollab = async () => {
    if (!isCloud) {
      return dispatch(actions.announce({
        message: {
          title: "Document is not saved to the cloud",
          subtitle: "Please save document to the cloud first",
        },
      }));
    }
    const payload = { id, partial: { collab: !isCollab } };
    const response = await dispatch(actions.updateCloudDocument(payload));
    if (response.type === actions.updateCloudDocument.fulfilled.type) {
      dispatch(actions.announce({
        message: {
          title: "Document Collaboration Updated",
          subtitle: `Document is now ${payload.partial.collab ? "collaborative" : "shared by link"}`,
        },
      }));
    }
  };

  const updateCoauthors = (users: (User | string)[]) => {
    if (!cloudDocument) {
      return dispatch(actions.announce({
        message: {
          title: "Document is not saved to the cloud",
          subtitle: "Please save document to the cloud first",
        },
      }));
    }
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    dispatch(actions.updateCloudDocument({ id: cloudDocument.id, partial: { coauthors } }));
  };

  return {
    cloudDocument,
    isCloud,
    isAuthor,
    isCollab,
    isPrivate,
    isPublished: isCloud && cloudDocument.published,
    name,
    formats,
    format,
    setFormat,
    revision,
    setRevision,
    shareDialogOpen,
    shareFormRef,
    openShareDialog,
    closeShareDialog,
    copyLink,
    handleShare,
    togglePrivate,
    toggleCollab,
    updateCoauthors,
  };
}
