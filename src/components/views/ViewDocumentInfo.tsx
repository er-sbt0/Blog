"use client";
import AttachmentDrawer from "../drawers/AttachmentDrawer";
import { Document } from "@/types";

export default function ViewDocumentInfo(
  { cloudDocument: _ }: { cloudDocument: Document },
) {
  return <AttachmentDrawer />;
}
