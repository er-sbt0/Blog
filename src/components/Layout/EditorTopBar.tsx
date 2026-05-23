"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  Button,
  IconButton,
  Link,
  Menu,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CenterFocusWeak,
  CollectionsBookmark,
  Create,
  Dashboard,
  Edit,
  LibraryBooks,
  Menu as MenuIcon,
  MoreHoriz,
  Save,
  Search,
  StickyNote2,
  ViewSidebar,
} from "@mui/icons-material";
import RouterLink from "next/link";
import { shallowEqual } from "react-redux";
import { documentsSelectors, selectIsDirty, useSelector } from "@/store";
import type { RootState } from "@/store";
import { triggerSave } from "@/components/EditDocument/saveRegistry";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import ShareDocument from "@/components/DocumentActions/Share";
import DownloadDocument from "@/components/DocumentActions/Download";
import ForkDocument from "@/components/DocumentActions/Fork";

const RAIL_MODE_LABELS: Record<string, string> = {
  full: "Collapse rail to icons",
  compact: "Hide rail",
  hidden: "Show rail",
};

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const EditorTopBar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { railMode, toggleRail, viewMode, setFocus, setRead } = useLayoutMode();
  const { toggleSidebarCompact, sidebarMode } = useSidebarWidth();
  const isFocus = viewMode === "focus";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;
      if (e.key === "f" || e.key === "F") {
        if (isFocus) setRead();
        else setFocus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFocus, setFocus, setRead]);

  const [moreAnchor, setMoreAnchor] = React.useState<null | HTMLElement>(null);

  const segments = React.useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );

  const isEditPage = segments[0] === "edit";
  const isViewPage = segments[0] === "view";
  const isDocPage = isEditPage || isViewPage;
  const docId = isDocPage ? segments[1] : undefined;

  const urlSeriesId = React.useMemo(() => {
    if (
      (segments[0] === "posts" || segments[0] === "series") &&
      segments[1]
    ) {
      return segments[1];
    }
    return undefined;
  }, [segments]);

  const isDirty = useSelector(selectIsDirty);

  const {
    docName,
    docSeriesId,
    seriesTitle,
    docSeriesTitle,
    activeTabName,
    userDocument,
  } = useSelector(
    (state: RootState) => {
      const doc = docId
        ? documentsSelectors.selectById(state, docId)
        : undefined;
      const dSeriesId = doc?.cloud?.seriesId || doc?.local?.seriesId;

      const { activeTabId, tabIds } = state.ui.tabs;
      const isMultiTab = tabIds.length > 1;
      const activeDoc = isMultiTab && activeTabId && activeTabId !== docId
        ? documentsSelectors.selectById(state, activeTabId)
        : undefined;
      const activeTabName = isMultiTab && activeDoc
        ? activeDoc.local?.name ?? activeDoc.cloud?.name
        : undefined;

      return {
        docName: doc?.cloud?.name || doc?.local?.name,
        docSeriesId: dSeriesId,
        seriesTitle: urlSeriesId
          ? state.series.find((s) => s.id === urlSeriesId)?.title
          : undefined,
        docSeriesTitle: dSeriesId
          ? state.series.find((s) => s.id === dSeriesId)?.title
          : undefined,
        activeTabName,
        userDocument: doc,
      };
    },
    shallowEqual,
  );

  const breadcrumbs = React.useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [];
    if (segments.length === 0) return items;

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
            items.push({ label: "Edit", href: `/series/${sId}/edit` });
          } else {
            items.push({
              label: seriesTitle || "Series",
              href: `/series/${sId}`,
              icon: <CollectionsBookmark sx={{ fontSize: 16, mr: 0.5 }} />,
            });
          }
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
        if (activeTabName) {
          items.push({ label: activeTabName });
        }
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
        if (activeTabName) {
          items.push({ label: activeTabName });
        }
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
        items.push({ label: segments[0], href: `/${segments[0]}` });
        break;
    }

    return items;
  }, [
    segments,
    seriesTitle,
    docSeriesId,
    docSeriesTitle,
    docName,
    activeTabName,
  ]);

  const handleMoreClose = React.useCallback(() => setMoreAnchor(null), []);

  if (pathname === "/") return null;

  return (
    <Box
      sx={{
        minHeight: 64,
        px: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        gap: 1,
        ...(isFocus && {
          position: "sticky",
          top: 0,
          zIndex: "appBar",
          bgcolor: "background.paper",
          backdropFilter: "blur(8px)",
        }),
      }}
    >
      {/* Hamburger */}
      <Tooltip
        title={sidebarMode === "full" ? "Collapse sidebar" : "Expand sidebar"}
      >
        <IconButton
          size="small"
          onClick={toggleSidebarCompact}
          aria-label={sidebarMode === "full"
            ? "Collapse sidebar"
            : "Expand sidebar"}
          sx={{ flexShrink: 0, color: "text.secondary" }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Breadcrumbs */}
      <MuiBreadcrumbs
        aria-label="breadcrumb"
        separator="/"
        sx={{ flex: 1, minWidth: 0 }}
      >
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
                  "&:hover": { color: "primary.main" },
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

      {/* Right cluster — doc actions (edit/view pages only) */}
      {isDocPage && userDocument && (
        <>
          <Tooltip title="Search">
            <IconButton
              size="small"
              aria-label="Search"
              sx={{ color: "text.secondary" }}
            >
              <Search fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* More menu */}
          <Tooltip title="More options">
            <IconButton
              size="small"
              onClick={(e) => setMoreAnchor(e.currentTarget)}
              aria-label="More options"
              sx={{ color: "text.secondary" }}
            >
              <MoreHoriz fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={moreAnchor}
            open={Boolean(moreAnchor)}
            onClose={handleMoreClose}
          >
            <ShareDocument
              userDocument={userDocument}
              variant="menuitem"
              closeMenu={handleMoreClose}
            />
            <DownloadDocument
              userDocument={userDocument}
              variant="menuitem"
              closeMenu={handleMoreClose}
            />
            <ForkDocument
              userDocument={userDocument}
              variant="menuitem"
              closeMenu={handleMoreClose}
            />
          </Menu>

          {/* Edit / Done primary button */}
          {isEditPage
            ? (
              <>
                <Tooltip title="Save changes">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={triggerSave}
                    startIcon={<Save fontSize="small" />}
                    sx={{
                      flexShrink: 0,
                      ...(isDirty && {
                        borderColor: "primary.main",
                        color: "primary.main",
                      }),
                    }}
                  >
                    Save
                  </Button>
                </Tooltip>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => router.push(`/view/${docId}`)}
                  sx={{ flexShrink: 0 }}
                >
                  Done
                </Button>
              </>
            )
            : (
              <IconButton
                size="small"
                onClick={() => router.push(`/edit/${docId}`)}
                aria-label="Edit document"
              >
                <Edit fontSize="small" />
              </IconButton>
            )}
        </>
      )}

      {/* Focus mode toggle */}
      <Tooltip title={isFocus ? "Exit focus mode (F)" : "Focus mode (F)"}>
        <IconButton
          size="small"
          onClick={isFocus ? setRead : setFocus}
          aria-label={isFocus ? "Exit focus mode" : "Enter focus mode"}
          sx={{
            color: isFocus ? "primary.main" : "text.secondary",
            flexShrink: 0,
          }}
        >
          <CenterFocusWeak fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Rail toggle */}
      <Tooltip title={RAIL_MODE_LABELS[railMode]}>
        <IconButton
          size="small"
          onClick={toggleRail}
          aria-label={RAIL_MODE_LABELS[railMode]}
          sx={{
            color: railMode === "hidden" ? "text.disabled" : "text.secondary",
            flexShrink: 0,
          }}
        >
          <ViewSidebar
            fontSize="small"
            sx={{ transform: "scaleX(-1)" }}
          />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default EditorTopBar;
