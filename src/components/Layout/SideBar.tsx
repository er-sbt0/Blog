"use client";
import { usePathname, useRouter } from "next/navigation";
import RouterLink from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  Article,
  ChevronLeft,
  ChevronRight,
  Code,
  CollectionsBookmark,
  Create,
  Dashboard,
  EditNote,
  Home,
  LibraryBooks,
  StickyNote2,
} from "@mui/icons-material";
import { styles } from "./styles";
import type { DocumentStatus, User } from "@/types";
import { useSidebarState } from "./SideBar/hooks/useSidebarState";
import { useKeyboardShortcuts } from "./SideBar/hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "./SideBar/SidebarWidthContext";
import type { UserDocument } from "@/types";

// Accessibility and styling constants
const SIDEBAR_CONSTANTS = {
  DOMAIN_INDICATOR_SIZE: 8,
  DOMAIN_AVATAR_SIZE: 24,
  MIN_HEIGHT: {
    NAVIGATION_ITEM: 42,
    DOMAIN_ITEM: 36,
    USER_ITEM: 48,
  },
  COLORS: {
    DOMAIN_INDICATOR_DEFAULT: "#555",
  },
} as const;

// Types
interface NavigationItem {
  text: string;
  icon: React.ReactNode;
  path: string;
  isDomain?: boolean;
  slug?: string;
  id?: string;
}

// Helper functions - simplified for blog structure
const isEditMode = (pathname: string): boolean => pathname.startsWith("/edit/");
// Remove domain-related helpers as we don't need them for blog structure

const SideBar: React.FC = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();

  // Custom hooks for state management
  const { open, toggleSidebar, isMobile } = useSidebarState();
  const { width: sidebarWidth, isResizing, startResize, getEffectiveWidth } =
    useSidebarWidth();

  // Get the effective width based on open/closed state
  const getWidth = (isOpen: boolean) => getEffectiveWidth(isOpen);

  // Keyboard shortcuts for accessibility
  const { shortcutHint } = useKeyboardShortcuts({
    onToggleSidebar: toggleSidebar,
    enabled: true,
  });

  // Remove drag and drop handlers for blog structure

  // Redux selectors with proper typing
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const user = useSelector((state: RootState) => state.user);
  const documents = useSelector((state: RootState) => state.documents);

  // Memoized computed values
  const isInEditMode = useMemo(() => isEditMode(pathname), [pathname]);
  // Remove file browser for blog structure
  const showFileBrowser = false;

  // Get active documents (only show for authenticated users)
  const activeDocuments = useMemo(() => {
    if (!user || !documents) return [];

    return documents
      .filter((doc) => {
        const cloudDocument = doc.cloud;
        const localDocument = doc.local;

        // For cloud documents, check author and status
        if (cloudDocument) {
          return cloudDocument.status === "ACTIVE" &&
            cloudDocument.author.id === user.id;
        }

        // For local documents, assume they belong to the current user and check status
        if (localDocument) {
          return localDocument.status === "ACTIVE";
        }

        return false;
      })
      .sort((a, b) => {
        // Sort by creation time (newest first)
        const aDoc = a.cloud || a.local;
        const bDoc = b.cloud || b.local;
        const aTime = aDoc?.createdAt ? new Date(aDoc.createdAt).getTime() : 0;
        const bTime = bDoc?.createdAt ? new Date(bDoc.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((doc) => {
        const document = doc.cloud || doc.local;
        return {
          id: doc.id,
          name: document?.name || "Untitled",
          handle: document?.handle,
        };
      });
  }, [user, documents]);

  // Navigation items for blog structure
  const navigationItems = useMemo((): NavigationItem[] => {
    const items = [
      { text: "Home", icon: <Home />, path: "/" },
      // { text: "Browse Posts", icon: <LibraryBooks />, path: "/browse" },
      { text: "Posts", icon: <LibraryBooks />, path: "/posts" },
      { text: "Series", icon: <CollectionsBookmark />, path: "/series" },
    ];

    // Add user-specific navigation items if authenticated
    if (user) {
      items.push(
        // { text: "Notes", icon: <StickyNote2 />, path: "/notes" },
        // { text: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
        // { text: "New Post", icon: <Create />, path: "/new" },
      );
    }

    return items;
  }, [user]);

  // Remove domain-related items for blog structure
  const domainItems = useMemo((): NavigationItem[] => [], []);

  // Callbacks - keep only the navigation handler
  const handleNavigationClick = useCallback((targetUrl: string) => {
    if (isInEditMode) {
      // Trigger autosave before navigation
      dispatch({
        type: "TRIGGER_AUTOSAVE_BEFORE_NAVIGATION",
        payload: { targetUrl },
      });

      setTimeout(() => {
        router.push(targetUrl);
      }, 100);
    }
  }, [dispatch, router, isInEditMode]);

  // Custom Link component with proper typing
  const SafeNavigationLink = useCallback(({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: any;
  }) => {
    const handleClick = (e: React.MouseEvent) => {
      if (isInEditMode) {
        e.preventDefault();
        handleNavigationClick(href);
      }
      onClick?.();
    };

    return (
      <RouterLink href={href} onClick={handleClick} {...props}>
        {children}
      </RouterLink>
    );
  }, [isInEditMode, handleNavigationClick]);

  // Effects - Keep only the initialization effect
  useEffect(() => {
    if (!initialized) {
      dispatch(actions.load());
    }
  }, [dispatch, initialized]);

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      sx={{
        width: getWidth(open),
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          width: getWidth(open),
          boxSizing: "border-box",
          transition: isResizing
            ? "none"
            : theme.transitions.create(["width"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          padding: theme.spacing(1, 1),
          justifyContent: open ? "space-between" : "center",
          flexShrink: 0,
          minHeight: 64,
        }}
      >
        {open && (
          <Box
            component={RouterLink}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Image
              src="/logo.svg"
              alt="Editor Logo"
              width={32}
              height={32}
            />
            <Box
              sx={{
                ml: 1,
                fontWeight: "bold",
                fontSize: "1.2rem",
              }}
            >
              Blog
            </Box>
          </Box>
        )}
        {!open && (
          <Tooltip title="Blog">
            <Box
              component={RouterLink}
              href="/"
              sx={{ display: "flex", justifyContent: "center" }}
            >
              <Image
                src="/logo.svg"
                alt="Blog Logo"
                width={32}
                height={32}
              />
            </Box>
          </Tooltip>
        )}
        <Tooltip title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+Alt+S)`}>
          <IconButton
            onClick={toggleSidebar}
            aria-label={`${open ? "Collapse" : "Expand"} sidebar`}
          >
            {open ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={styles.divider} />

      {/* Top section - Main navigation */}
      <Box
        role="navigation"
        aria-label="Main navigation"
        sx={{
          ...styles.sectionBox,
          flexShrink: 0,
          pb: 0,
        }}
      >
        <List>
          {navigationItems.map((item) => (
            <ListItem
              key={item.text}
              disablePadding
              sx={{ display: "block" }}
            >
              <Tooltip
                title={open ? "" : item.text}
                placement="right"
              >
                <ListItemButton
                  component={SafeNavigationLink}
                  href={item.path}
                  selected={Boolean(
                    pathname === item.path ||
                      pathname.startsWith(`${item.path}/`),
                  )}
                  sx={{
                    minHeight: SIDEBAR_CONSTANTS.MIN_HEIGHT.NAVIGATION_ITEM,
                    justifyContent: open ? "initial" : "center",
                    px: 2.5,
                    "&.Mui-selected": {
                      bgcolor: "action.selected",
                      "&:hover": {
                        bgcolor: "rgba(0, 0, 0, 0.15)",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                      "& .MuiSvgIcon-root": {
                        fontSize: "1.2rem",
                      },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: "0.9rem",
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={styles.divider} />

      {/* Middle section - Active Documents */}
      {user && activeDocuments.length > 0 && (
        <Box
          sx={{
            ...styles.sectionBox,
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {open && (
            <Box
              sx={{
                px: 2.5,
                py: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Active Posts
              </Box>
            </Box>
          )}
          <Box sx={{ overflow: "auto", flex: "1 1 auto" }}>
            <List dense>
              {activeDocuments.map((doc, index) => {
                // Check if this document is currently being viewed or edited
                const isViewing = pathname === `/view/${doc.id}`;
                const isEditing = pathname === `/edit/${doc.id}`;
                const isSelected = isViewing || isEditing;

                return (
                  <ListItem
                    key={doc.id}
                    disablePadding
                    sx={{ display: "block" }}
                  >
                    <Tooltip
                      title={open ? "" : doc.name}
                      placement="right"
                    >
                      <ListItemButton
                        component={SafeNavigationLink}
                        href={`/view/${doc.id}`}
                        selected={isSelected}
                        sx={{
                          minHeight: 32,
                          justifyContent: open ? "initial" : "center",
                          px: open ? 3 : 2.5,
                          py: 0.5,
                          "&.Mui-selected": {
                            bgcolor: "action.selected",
                            "&:hover": {
                              bgcolor: "rgba(0, 0, 0, 0.15)",
                            },
                          },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 0,
                            mr: open ? 1.5 : "auto",
                            justifyContent: "center",
                          }}
                        >
                          <Article
                            sx={{
                              fontSize: "1rem",
                              color: "text.secondary",
                            }}
                          />
                        </ListItemIcon>
                        {open && (
                          <ListItemText
                            primary={doc.name}
                            primaryTypographyProps={{
                              fontSize: "0.8rem",
                              sx: {
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontWeight: isSelected ? 600 : 400,
                              },
                            }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        </Box>
      )}

      {/* Flexible space when no active documents or user not logged in */}
      {(!user || activeDocuments.length === 0) && (
        <Box
          sx={{
            flex: "1 1 auto",
            minHeight: 0,
          }}
        />
      )}

      <Divider sx={styles.dividerBottom} />

      {/* Bottom section - User */}
      <Box
        sx={{
          ...styles.userBox,
          flexShrink: 0,
        }}
      >
        <Box sx={{ mt: "auto" }}>
          <List>
            <ListItem disablePadding sx={{ display: "block" }}>
              <Tooltip
                title={open ? "" : (user ? user.name : "Sign In")}
                placement="right"
              >
                <ListItemButton
                  component={SafeNavigationLink}
                  href={user ? "/dashboard" : "/api/auth/signin"}
                  sx={{
                    minHeight: SIDEBAR_CONSTANTS.MIN_HEIGHT.USER_ITEM,
                    justifyContent: open ? "initial" : "center",
                    px: 2.5,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                    }}
                  >
                    <Avatar
                      alt={user?.name}
                      src={user?.image ?? undefined}
                      sx={{
                        width: 32,
                        height: 32,
                      }}
                    />
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={user ? user.name : "Sign In"}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>
        </Box>
      </Box>

      {/* Resize handle - only visible when expanded and not on mobile */}
      {open && !isMobile && (
        <Box
          onMouseDown={startResize}
          sx={{
            position: "fixed",
            top: 0,
            left: getWidth(open) - 4,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            backgroundColor: isResizing ? "primary.main" : "transparent",
            transition: isResizing ? "none" : "background-color 0.2s",
            "&:hover": {
              backgroundColor: "primary.main",
              opacity: 0.5,
            },
            "&:active": {
              backgroundColor: "primary.main",
              opacity: 1,
            },
            zIndex: 1300,
          }}
        />
      )}
    </Drawer>
  );
};

export default SideBar;
