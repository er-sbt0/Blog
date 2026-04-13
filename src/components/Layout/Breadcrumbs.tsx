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
import { shallowEqual } from "react-redux";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const Breadcrumbs: React.FC = () => {
  const pathname = usePathname();
  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  // Extract IDs from the current route so we can select only the data we need
  const docId = React.useMemo(() => {
    if (
      (segments[0] === "edit" || segments[0] === "view") &&
      segments[1]
    ) {
      return segments[1];
    }
    return undefined;
  }, [segments]);

  const urlSeriesId = React.useMemo(() => {
    if (
      (segments[0] === "posts" || segments[0] === "series") &&
      segments[1]
    ) {
      return segments[1];
    }
    return undefined;
  }, [segments]);

  // Single targeted selector – only re-renders when these specific primitive
  // values change, not on every unrelated document / series mutation.
  const { docName, docSeriesId, seriesTitle, docSeriesTitle } = useSelector(
    (state: RootState) => {
      const doc = docId
        ? documentsSelectors.selectById(state, docId)
        : undefined;
      const dSeriesId = doc?.cloud?.seriesId || doc?.local?.seriesId;
      return {
        docName: doc?.cloud?.name || doc?.local?.name,
        docSeriesId: dSeriesId,
        seriesTitle: urlSeriesId
          ? state.series.find((s) => s.id === urlSeriesId)?.title
          : undefined,
        docSeriesTitle: dSeriesId
          ? state.series.find((s) => s.id === dSeriesId)?.title
          : undefined,
      };
    },
    shallowEqual,
  );

  const breadcrumbs = React.useMemo((): BreadcrumbItem[] => {
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
          items.push({
            label: seriesTitle || "Series",
            href: `/series/${segments[1]}`,
            icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
          });
        }
        break;

      case "series":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (segments.length > 1) {
          const sId = segments[1];
          if (segments.length > 2 && segments[2] === "edit") {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
            });
            items.push({
              label: "Edit",
              href: `/series/${sId}/edit`,
            });
          } else {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
            });
          }
        } else {
          items.push({
            label: "Series",
            href: "/posts",
            icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
          });
        }
        break;

      case "dashboard":
        items.push({
          label: "Dashboard",
          href: "/dashboard",
          icon: <Dashboard sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "new":
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        items.push({
          label: "New Post",
          href: "/new",
          icon: <Create sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "edit": {
        const editId = segments[1];
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (docSeriesId) {
          items.push({
            label: docSeriesTitle || "Series",
            href: `/series/${docSeriesId}`,
            icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
          });
        }
        items.push({
          label: editId ? docName || "Edit Post" : "Edit Post",
          href: editId ? `/edit/${editId}` : "/edit",
          icon: <Edit sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;
      }

      case "view": {
        const viewId = segments[1];
        items.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (docSeriesId) {
          items.push({
            label: docSeriesTitle || "Series",
            href: `/series/${docSeriesId}`,
            icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
          });
        }
        items.push({
          label: viewId ? docName || "Post" : "Post",
          href: viewId ? `/view/${viewId}` : "/posts",
        });
        break;
      }

      case "user":
        items.push({
          label: "User Profile",
          href: segments[1] ? `/user/${segments[1]}` : "/",
        });
        break;

      case "notes":
        items.push({
          label: "Notes",
          href: "/notes",
          icon: <StickyNote2 sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      default:
        items.push({
          label: segments[0],
          href: `/${segments[0]}`,
        });
        break;
    }

    return items;
  }, [segments, seriesTitle, docSeriesId, docSeriesTitle, docName]);

  // Don't show breadcrumbs on home page
  if (pathname === "/") {
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: 65,
        px: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
      }}
    >
      <MuiBreadcrumbs aria-label="breadcrumb" separator="›">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (item.href) {
            return (
              <Link
                key={index}
                component={RouterLink}
                href={item.href}
                underline="hover"
                color={isLast ? "text.primary" : "inherit"}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "0.875rem",
                  fontWeight: isLast ? 600 : 400,
                  "&:hover": {
                    color: "primary.main",
                  },
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          }

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
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default Breadcrumbs;
