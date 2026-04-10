"use client";
import { useCallback } from "react";
import RouterLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { triggerSave } from "@/components/EditDocument/saveRegistry";

// SafeNavigationLink is a Next.js Link that triggers autosave when the editor
// is active before navigating away. It must be a stable top-level component
// (not defined inside render or useCallback) so MUI's `component` prop does not
// remount the element on every render.
type SafeNavigationLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  href: string;
};

export const SafeNavigationLink = ({
  href,
  onClick,
  children,
  ...props
}: SafeNavigationLinkProps) => {
  const pathname = usePathname();
  const router = useRouter();

  const inEditMode = pathname.startsWith("/edit/");

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (inEditMode) {
        e.preventDefault();
        triggerSave().then(() => {
          router.push(href);
        });
      }
      onClick?.(e);
    },
    [inEditMode, href, router, onClick],
  );

  return (
    <RouterLink href={href} onClick={handleClick} {...props}>
      {children}
    </RouterLink>
  );
};
