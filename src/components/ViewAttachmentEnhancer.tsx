"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ViewAttachment from "./ViewAttachment";

interface AttachmentData {
  element: HTMLElement;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  expanded: boolean;
}

/**
 * Component that enhances attachment elements in view mode by replacing
 * them with interactive ViewAttachment components using React portals.
 */
const ViewAttachmentEnhancer: React.FC<
  { containerRef: React.RefObject<HTMLElement | null> }
> = ({ containerRef }) => {
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const isScanning = useRef(false);

  const scanForAttachments = useCallback(() => {
    if (!containerRef.current || isScanning.current) return;

    isScanning.current = true;

    try {
      const elements = containerRef.current.querySelectorAll(
        '[data-attachment="true"]',
      );
      const foundAttachments: AttachmentData[] = [];

      elements.forEach((el) => {
        const element = el as HTMLElement;
        const url = element.dataset.url;
        const filename = element.dataset.filename;
        const mimetype = element.dataset.mimetype || "application/octet-stream";
        const size = parseInt(element.dataset.size || "0", 10);
        const expanded = element.dataset.expanded === "true";

        if (url && filename) {
          // Check if already processed
          if (element.dataset.enhanced === "true") {
            // Already has a portal container, find it
            const portalContainer = element.nextElementSibling as HTMLElement | null;
            if (portalContainer?.classList.contains("attachment-portal")) {
              foundAttachments.push({
                element: portalContainer,
                url,
                filename,
                mimetype,
                size,
                expanded,
              });
            }
            return;
          }

          // Mark as processed
          element.dataset.enhanced = "true";

          // Hide the original element
          element.style.display = "none";

          // Create a container for the portal
          const portalContainer = document.createElement("div");
          portalContainer.className = "attachment-portal";
          element.parentNode?.insertBefore(
            portalContainer,
            element.nextSibling,
          );

          foundAttachments.push({
            element: portalContainer,
            url,
            filename,
            mimetype,
            size,
            expanded,
          });
        }
      });

      setAttachments(foundAttachments);
    } finally {
      isScanning.current = false;
    }
  }, [containerRef]);

  useEffect(() => {
    // Initial scan after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(scanForAttachments, 100);
    return () => clearTimeout(timeoutId);
  }, [scanForAttachments]);

  return (
    <>
      {attachments.map((attachment, index) =>
        createPortal(
          <ViewAttachment
            key={`${attachment.url}-${index}`}
            url={attachment.url}
            filename={attachment.filename}
            mimetype={attachment.mimetype}
            size={attachment.size}
            initialExpanded={attachment.expanded}
          />,
          attachment.element,
        )
      )}
    </>
  );
};

export default ViewAttachmentEnhancer;
