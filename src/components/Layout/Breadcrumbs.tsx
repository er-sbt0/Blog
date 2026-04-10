"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  Link,
  Typography,
} from "@mui/material";
import {
  CollectionsBookmark,
  Create,
  Dashboard,
  Edit,
  LibraryBooks,
  StickyNote2,
} from "@mui/icons-material";
import RouterLink from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const Breadcrumbs: React.FC = () => {
  const pathname = usePathname();

  const breadcrumbs = React.useMemo((): BreadcrumbItem[] => {
    const segments = pathname.split("/").filter(Boolean);
    const items: BreadcrumbItem[] = [];

    if (segments.length === 0) {
      return items;
    }

    // Handle different routes
    switch (segments[0]) {
      case "browse":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "posts":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (segments.length > 1) {
          items.push({ label: "Series" });
        }
        break;

      case "series":
        items.push({
          label: "Series",
          icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (segments.length > 1) {
          if (segments.length > 2 && segments[2] === "edit") {
            items.push({
              label: "Series Details",
              href: `/series/${segments[1]}`,
            });
            items.push({ label: "Edit" });
          } else {
            items.push({ label: "Series Details" });
          }
        }
        break;

      case "dashboard":
        items.push({
          label: "Dashboard",
          icon: <Dashboard sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "new":
        items.push({
          label: "New Post",
          icon: <Create sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "edit":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        items.push({
          label: "Edit Post",
          icon: <Edit sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "view":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        items.push({ label: "View Post" });
        break;

      case "user":
        items.push({ label: "User Profile" });
        break;

      case "notes":
        items.push({
          label: "Notes",
          icon: <StickyNote2 sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      default:
        // For other routes, just show the segment
        items.push({ label: segments[0] });
        break;
    }

    return items;
  }, [pathname]);

  // Don't show breadcrumbs on home page
  if (pathname === "/") {
    return null;
  }

  return (
    <Box
      sx={{ py: 1, px: 2, borderBottom: "1px solid", borderColor: "divider" }}
    >
      <MuiBreadcrumbs aria-label="breadcrumb" separator="›">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (isLast || !item.href) {
            return (
              <Typography
                key={index}
                color="text.primary"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "0.875rem",
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </Typography>
            );
          }

          return (
            <Link
              key={index}
              component={RouterLink}
              href={item.href}
              underline="hover"
              color="inherit"
              sx={{
                display: "flex",
                alignItems: "center",
                fontSize: "0.875rem",
                "&:hover": {
                  color: "primary.main",
                },
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default Breadcrumbs;
