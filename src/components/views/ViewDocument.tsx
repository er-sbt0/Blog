"use client";
import { Document, User } from "@/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRef } from "react";
import ViewAttachmentEnhancer from "./ViewAttachmentEnhancer";
import SyncToCloudFab from "../shared/SyncToCloudFab";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import EditIcon from "@mui/icons-material/Edit";

const ViewDocumentInfo = dynamic(
  () => import("./ViewDocumentInfo"),
  { ssr: false },
);

const ViewDocument: React.FC<
  React.PropsWithChildren & { cloudDocument: Document; user?: User }
> = ({ cloudDocument, children }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const handle = cloudDocument.handle || cloudDocument.id;
  const isAuthor = cloudDocument.author.id === user?.id;
  const isCollab = cloudDocument.collab;
  const isEditable = isAuthor || isCollab;
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <Box sx={{ minHeight: "100vh", px: { xs: 1, sm: 2, md: 2 } }}>
      {isEditable && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 1 }}>
          <Button
            size="small"
            startIcon={<EditIcon />}
            onClick={() =>
              router.push(`/edit/${handle}`)}
          >
            Edit
          </Button>
        </Box>
      )}
      <div className="document-container" ref={containerRef}>
        {children}
        <ViewAttachmentEnhancer containerRef={containerRef} />
      </div>
      <ViewDocumentInfo cloudDocument={cloudDocument} user={user} />
      <SyncToCloudFab documentId={cloudDocument.id} />
    </Box>
  );
};

export default ViewDocument;
