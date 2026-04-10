"use client";

import NProgress from "nprogress";
import { usePathname, useSearchParams } from "next/navigation";
import { memo, useEffect } from "react";

export default memo(function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    NProgress.configure({ showSpinner: false });

    const boundAnchors = new Set<HTMLAnchorElement>();

    const handleAnchorClick = (event: MouseEvent) => {
      if (
        !navigator.onLine ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      const targetElement = event.currentTarget as HTMLAnchorElement;
      if (window.location.origin !== targetElement.origin) return;
      if (window.location.href === targetElement.href) return;
      if (targetElement.target === "_blank") return;
      if (targetElement.hash) return;
      setTimeout(() => {
        if (!event.defaultPrevented) NProgress.start();
      }, 0);
    };

    const bindAnchors = () => {
      document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(
        (anchor) => {
          if (!boundAnchors.has(anchor)) {
            anchor.addEventListener("click", handleAnchorClick);
            boundAnchors.add(anchor);
          }
        },
      );
    };

    const mutationObserver = new MutationObserver(bindAnchors);
    mutationObserver.observe(document, { childList: true, subtree: true });

    // Bind anchors already present in the DOM at mount time.
    bindAnchors();

    return () => {
      mutationObserver.disconnect();
      boundAnchors.forEach((anchor) =>
        anchor.removeEventListener("click", handleAnchorClick)
      );
      boundAnchors.clear();
    };
  }, []);

  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);

  return null;
});
