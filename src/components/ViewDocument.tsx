"use client";
import { CloudDocument, User } from "@/types";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

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

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditable) {
      router.push(`/edit/${handle}`);
    }
  };

  // Add event listener for attachment downloads
  useEffect(() => {
    const handleAttachmentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const attachment = target.closest(
        '[data-attachment="true"]',
      ) as HTMLElement;

      if (attachment) {
        e.preventDefault();
        e.stopPropagation();

        const url = attachment.dataset.url;
        const filename = attachment.dataset.filename;

        if (url && filename) {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "blob";
          xhr.onload = function () {
            if (xhr.status === 200) {
              const blob = xhr.response;
              const downloadUrl = window.URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = downloadUrl;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(downloadUrl);
            }
          };
          xhr.send();
        }
      }
    };

    document.addEventListener("click", handleAttachmentClick, true);
    return () => {
      document.removeEventListener("click", handleAttachmentClick, true);
    };
  }, []);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        minHeight: "100vh",
        paddingLeft: "5px",
        paddingRight: "80px",
      }}
      title={isEditable ? "Double-click to edit document" : undefined}
    >
      <div className="document-container">
        {children}
      </div>
      <ViewDocumentInfo cloudDocument={cloudDocument} user={user} />
    </div>
  );
};

export default ViewDocument;
