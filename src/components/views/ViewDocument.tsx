"use client";
import { Document, User } from "@/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import ViewAttachmentEnhancer from "./ViewAttachmentEnhancer";
import SyncToCloudFab from "../shared/SyncToCloudFab";
import LocalDocumentView from "./LocalDocumentView";
import ChildDocumentView from "./ChildDocumentView";
import ViewTabBar from "./ViewTabBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import EditIcon from "@mui/icons-material/Edit";
import { apiClient } from "@/api";
import type { TabMeta } from "@/components/EditDocument/EditorTabBar";

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

  // Determine root: this doc is root when it has no parent.
  const isChild = !!cloudDocument.parentId;
  const rootId = isChild ? cloudDocument.parentId! : cloudDocument.id;

  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState(cloudDocument.id);

  // Fetch root metadata + all children to populate the tab strip.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiClient.documents.get(rootId),
      apiClient.documents.children(rootId),
    ]).then(([rootDoc, childDocs]) => {
      if (cancelled) return;
      const metas: TabMeta[] = [
        { id: rootId, name: rootDoc?.name ?? "Document" },
        ...(childDocs ?? []).map((c) => ({ id: c.id, name: c.name })),
      ];
      setTabs(metas);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [rootId]);

  const handleTabSwitch = (tabId: string) => {
    setActiveTabId(tabId);
  };

  // The "Edit" button should always point to the root doc's edit page.
  const editHandle = isChild
    ? rootId
    : handle;

  return (
    <Box sx={{ minHeight: "100vh", px: { xs: 1, sm: 2, md: 2 } }}>
      {isEditable && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", pt: 1 }}>
          <Button
            size="small"
            startIcon={<EditIcon />}
            onClick={() => router.push(`/edit/${editHandle}`)}
          >
            Edit
          </Button>
        </Box>
      )}

      <ViewTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={handleTabSwitch}
      />

      <div className="document-container" ref={containerRef}>
        {/* Root tab: use SSR-rendered children + local-override logic */}
        {activeTabId === cloudDocument.id && (
          <LocalDocumentView
            documentId={cloudDocument.id}
            cloudHead={cloudDocument.head}
          >
            {children}
          </LocalDocumentView>
        )}

        {/* Child tabs: fetch content client-side */}
        {activeTabId !== cloudDocument.id && (
          <ChildDocumentView key={activeTabId} docId={activeTabId} />
        )}

        <ViewAttachmentEnhancer containerRef={containerRef} />
      </div>

      <ViewDocumentInfo cloudDocument={cloudDocument} user={user} />
      <SyncToCloudFab documentId={cloudDocument.id} />
    </Box>
  );
};

export default ViewDocument;
