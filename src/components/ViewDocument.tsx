"use client";
import { CloudDocument, User } from "@/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import ViewAttachmentEnhancer from "./ViewAttachmentEnhancer";
import SyncToCloudFab from "./SyncToCloudFab";

const ViewDocumentInfo = dynamic(
  () => import("@/components/ViewDocumentInfo"),
  { ssr: false },
);

const ViewDocument: React.FC<
  React.PropsWithChildren & { cloudDocument: CloudDocument; user?: User }
> = ({ cloudDocument, children }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const handle = cloudDocument.handle || cloudDocument.id;
  const isAuthor = cloudDocument.author.id === user?.id;
  const isCollab = cloudDocument.collab;
  const isEditable = isAuthor || isCollab;
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditable) {
      router.push(`/edit/${handle}`);
    }
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        minHeight: "100vh",
        paddingLeft: "5px",
        paddingRight: "80px",
        cursor: isEditable ? "pointer" : undefined,
      }}
      title={isEditable ? "Double-click to edit document" : undefined}
    >
      <div className="document-container" ref={containerRef}>
        {children}
        <ViewAttachmentEnhancer containerRef={containerRef} />
      </div>
      <ViewDocumentInfo cloudDocument={cloudDocument} user={user} />
      <SyncToCloudFab documentId={cloudDocument.id} />
    </div>
  );
};

export default ViewDocument;
