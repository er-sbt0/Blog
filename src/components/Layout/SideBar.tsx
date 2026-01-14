"use client";
import { usePathname, useRouter } from "next/navigation";
import RouterLink from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import {
  Avatar,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  Add,
  Article,
  ChevronLeft,
  ChevronRight,
  Clear,
  Code,
  CollectionsBookmark,
  Create,
  Dashboard,
  EditNote,
  ExpandLess,
  ExpandMore,
  Home,
  LibraryBooks,
  Remove,
  Search,
  StickyNote2,
} from "@mui/icons-material";
import { styles } from "./styles";
import type { DocumentStatus, Series, User } from "@/types";
import { useSidebarState } from "./SideBar/hooks/useSidebarState";
import { useKeyboardShortcuts } from "./SideBar/hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "./SideBar/SidebarWidthContext";
import type { UserDocument } from "@/types";
import {
  buildSeriesMap,
  groupPostsBySeries,
  type SeriesGroupItem,
} from "@/components/PostsList/utils/seriesGrouping";

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

  // Active posts search state
  const [activePostsSearch, setActivePostsSearch] = useState("");

  // Track collapsed series in sidebar (series NOT in this set are expanded)
  // This way new series default to expanded automatically
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(() => {
    console.log("[Sidebar] Initializing collapsed series state");

    // Try to load saved state from localStorage
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebarSeriesCollapsedState");
      console.log("[Sidebar] Saved state from localStorage:", savedState);

      if (savedState) {
        try {
          const parsed: string[] = JSON.parse(savedState);
          const savedSet = new Set<string>(parsed);
          console.log("[Sidebar] Loaded collapsed series from localStorage:", [
            ...savedSet,
          ]);
          return savedSet;
        } catch (e) {
          console.error("Failed to parse sidebar series collapsed state:", e);
        }
      }
    }
    // Default: empty set (no series collapsed = all expanded by default)
    console.log("[Sidebar] No saved state, all series will be expanded");
    return new Set();
  });

  // Sidebar font size control (in pixels, persisted to localStorage)
  const [sidebarFontSize, setSidebarFontSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebarFontSize");
      return saved ? parseInt(saved, 10) : 16;
    }
    return 16;
  });

  // Save to localStorage when font size changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarFontSize", sidebarFontSize.toString());
    }
  }, [sidebarFontSize]);

  // Handlers for font size adjustment
  const increaseFontSize = useCallback(() => {
    setSidebarFontSize((prev) => Math.min(prev + 1, 24)); // Max 24px
  }, []);

  const decreaseFontSize = useCallback(() => {
    setSidebarFontSize((prev) => Math.max(prev - 1, 10)); // Min 10px
  }, []);

  const resetFontSize = useCallback(() => {
    setSidebarFontSize(16); // Reset to default
  }, []);

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
  const seriesList = useSelector((state: RootState) => state.series);

  // Memoized computed values
  const isInEditMode = useMemo(() => isEditMode(pathname), [pathname]);
  // Remove file browser for blog structure
  const showFileBrowser = false;

  // Get active documents (only show for authenticated users)
  const activeDocuments = useMemo((): UserDocument[] => {
    if (!user || !documents) return [];

    return documents.filter((doc) => {
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
    });
  }, [user, documents]);

  // Build series map for grouping
  const seriesMap = useMemo(() => buildSeriesMap(seriesList || []), [
    seriesList,
  ]);

  // Group active documents by series
  const groupedActivePosts = useMemo((): SeriesGroupItem[] => {
    return groupPostsBySeries(activeDocuments, seriesMap);
  }, [activeDocuments, seriesMap]);

  // Filter grouped posts based on search query
  const filteredGroupedPosts = useMemo((): SeriesGroupItem[] => {
    if (!activePostsSearch.trim()) return groupedActivePosts;

    const searchLower = activePostsSearch.toLowerCase();

    return groupedActivePosts
      .map((group) => {
        if (group.type === "series") {
          // For series, check if series title matches or filter posts
          const seriesMatches = group.series?.title.toLowerCase().includes(
            searchLower,
          );
          if (seriesMatches) return group; // Return whole series if title matches

          // Otherwise filter posts within series
          const filteredPosts = group.posts.filter((post) => {
            const doc = post.cloud || post.local;
            return doc?.name?.toLowerCase().includes(searchLower);
          });

          if (filteredPosts.length === 0) return null;
          return { ...group, posts: filteredPosts };
        } else {
          // For standalone posts, filter by name
          const doc = group.posts[0]?.cloud || group.posts[0]?.local;
          if (doc?.name?.toLowerCase().includes(searchLower)) return group;
          return null;
        }
      })
      .filter((group): group is SeriesGroupItem => group !== null);
  }, [groupedActivePosts, activePostsSearch]);

  // Show search bar when there are 5 or more posts
  const showActivePostsSearch = activeDocuments.length >= 5;

  // No useEffect needed! New series automatically default to expanded
  // since they're not in the collapsedSeries set

  // Toggle series expanded/collapsed state
  const toggleSeriesExpanded = useCallback((seriesId: string) => {
    console.log("[Sidebar] Toggling series:", seriesId);
    setCollapsedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
        console.log(
          "[Sidebar] Expanded series (removed from collapsed):",
          seriesId,
        );
      } else {
        next.add(seriesId);
        console.log(
          "[Sidebar] Collapsed series (added to collapsed):",
          seriesId,
        );
      }

      const stateArray = [...next];
      console.log("[Sidebar] New collapsed state:", stateArray);

      // Save to localStorage
      if (typeof window !== "undefined") {
        const jsonState = JSON.stringify(stateArray);
        localStorage.setItem("sidebarSeriesCollapsedState", jsonState);
        console.log("[Sidebar] Saved to localStorage:", jsonState);

        // Verify it was saved
        const verification = localStorage.getItem(
          "sidebarSeriesCollapsedState",
        );
        console.log("[Sidebar] Verification read:", verification);
      }

      return next;
    });
  }, []);

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
          fontSize: `${sidebarFontSize}px`,
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
                fontSize: "1.2em",
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {open && (
            <>
              <Tooltip title="Decrease font size">
                <IconButton
                  size="small"
                  onClick={decreaseFontSize}
                  disabled={sidebarFontSize <= 10}
                  aria-label="Decrease sidebar font size"
                >
                  <Remove fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip
                title={`Font size: ${sidebarFontSize}px (click to reset)`}
              >
                <IconButton
                  size="small"
                  onClick={resetFontSize}
                  aria-label="Reset sidebar font size"
                  sx={{
                    fontSize: "0.7em",
                    minWidth: "32px",
                    fontWeight: sidebarFontSize !== 16 ? "bold" : "normal",
                  }}
                >
                  {sidebarFontSize}
                </IconButton>
              </Tooltip>
              <Tooltip title="Increase font size">
                <IconButton
                  size="small"
                  onClick={increaseFontSize}
                  disabled={sidebarFontSize >= 24}
                  aria-label="Increase sidebar font size"
                >
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip
            title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+Alt+S)`}
          >
            <IconButton
              onClick={toggleSidebar}
              aria-label={`${open ? "Collapse" : "Expand"} sidebar`}
            >
              {open ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
          </Tooltip>
        </Box>
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
                        fontSize: "1.2em",
                      },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: "0.9em",
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
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  fontSize: "0.75em",
                  fontWeight: 600,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Active Posts
              </Box>
              {showActivePostsSearch && (
                <TextField
                  size="small"
                  placeholder="Search posts..."
                  value={activePostsSearch}
                  onChange={(e) => setActivePostsSearch(e.target.value)}
                  variant="standard"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search
                          sx={{ fontSize: "0.9em", color: "text.disabled" }}
                        />
                      </InputAdornment>
                    ),
                    endAdornment: activePostsSearch && (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setActivePostsSearch("")}
                          edge="end"
                          sx={{
                            padding: 0.25,
                            opacity: 0.6,
                            "&:hover": { opacity: 1 },
                          }}
                        >
                          <Clear sx={{ fontSize: "0.9em" }} />
                        </IconButton>
                      </InputAdornment>
                    ),
                    disableUnderline: false,
                  }}
                  sx={{
                    width: "100%",
                    "& .MuiInput-root": {
                      fontSize: "0.75em",
                      "&:before": {
                        borderBottomColor: "divider",
                      },
                      "&:hover:not(.Mui-disabled):before": {
                        borderBottomColor: "text.secondary",
                      },
                      "&:after": {
                        borderBottomColor: "primary.main",
                      },
                    },
                    "& .MuiInput-input": {
                      padding: "4px 0 4px 0",
                      "&::placeholder": {
                        fontSize: "0.75em",
                        opacity: 0.5,
                      },
                    },
                  }}
                />
              )}
            </Box>
          )}
          <Box sx={{ overflow: "auto", flex: "1 1 auto" }}>
            <List dense>
              {filteredGroupedPosts.map((group, groupIndex) => {
                if (group.type === "series" && group.series) {
                  const isExpanded = !collapsedSeries.has(group.series.id);
                  // Render series with minimal left border accent
                  return (
                    <Box
                      key={`series-${group.series.id}`}
                      sx={{
                        mt: groupIndex > 0 ? 0.5 : 0,
                        mb: 0.5,
                      }}
                    >
                      {/* Series Header - Collapsible, minimal style */}
                      <ListItem disablePadding sx={{ display: "block" }}>
                        <Tooltip
                          title={open ? "" : group.series.title}
                          placement="right"
                        >
                          <ListItemButton
                            onClick={(e) => {
                              e.preventDefault();
                              toggleSeriesExpanded(group.series!.id);
                            }}
                            sx={{
                              minHeight: 28,
                              justifyContent: open ? "initial" : "center",
                              px: 2.5,
                              py: 0.25,
                              "&:hover": {
                                bgcolor: (theme) =>
                                  theme.palette.mode === "dark"
                                    ? "rgba(255, 255, 255, 0.05)"
                                    : "rgba(0, 0, 0, 0.04)",
                              },
                            }}
                          >
                            <ListItemIcon
                              sx={{
                                minWidth: 0,
                                mr: open ? 1 : "auto",
                                justifyContent: "center",
                              }}
                            >
                              {isExpanded
                                ? (
                                  <ExpandLess
                                    sx={{
                                      fontSize: "0.85em",
                                      color: "text.secondary",
                                    }}
                                  />
                                )
                                : (
                                  <ExpandMore
                                    sx={{
                                      fontSize: "0.85em",
                                      color: "text.secondary",
                                    }}
                                  />
                                )}
                            </ListItemIcon>
                            {open && (
                              <ListItemText
                                primary={`${group.series.title} (${group.posts.length})`}
                                primaryTypographyProps={{
                                  fontSize: "0.7em",
                                  fontWeight: 500,
                                  color: "text.secondary",
                                  sx: {
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  },
                                }}
                              />
                            )}
                          </ListItemButton>
                        </Tooltip>
                      </ListItem>
                      {/* Series Posts - with left border accent */}
                      <Collapse in={isExpanded} timeout="auto">
                        <Box
                          sx={{
                            ml: open ? 2.5 : 0,
                            borderLeft: open ? "2px solid" : "none",
                            borderLeftColor: (theme) =>
                              theme.palette.mode === "dark"
                                ? "rgba(255, 255, 255, 0.2)"
                                : "rgba(0, 0, 0, 0.15)",
                          }}
                        >
                          {group.posts.map((post, postIndex) => {
                            const doc = post.cloud || post.local;
                            const docName = doc?.name || "Untitled";
                            const isViewing = pathname === `/view/${post.id}`;
                            const isEditing = pathname === `/edit/${post.id}`;
                            const isSelected = isViewing || isEditing;

                            return (
                              <ListItem
                                key={post.id}
                                disablePadding
                                sx={{ display: "block" }}
                              >
                                <Tooltip
                                  title={open ? "" : docName}
                                  placement="right"
                                >
                                  <ListItemButton
                                    component={SafeNavigationLink}
                                    href={`/view/${post.id}`}
                                    selected={isSelected}
                                    sx={{
                                      minHeight: 30,
                                      justifyContent: open
                                        ? "initial"
                                        : "center",
                                      pl: open ? 2 : 2,
                                      pr: 2.5,
                                      py: 0.25,
                                      "&.Mui-selected": {
                                        bgcolor: "action.selected",
                                        "&:hover": {
                                          bgcolor: "rgba(0, 0, 0, 0.12)",
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
                                          fontSize: "0.85em",
                                          color: "text.secondary",
                                        }}
                                      />
                                    </ListItemIcon>
                                    {open && (
                                      <ListItemText
                                        primary={docName}
                                        primaryTypographyProps={{
                                          fontSize: "0.78em",
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
                        </Box>
                      </Collapse>
                    </Box>
                  );
                } else {
                  // Render standalone post
                  const post = group.posts[0];
                  const doc = post.cloud || post.local;
                  const docName = doc?.name || "Untitled";
                  const isViewing = pathname === `/view/${post.id}`;
                  const isEditing = pathname === `/edit/${post.id}`;
                  const isSelected = isViewing || isEditing;

                  return (
                    <ListItem
                      key={post.id}
                      disablePadding
                      sx={{ display: "block" }}
                    >
                      <Tooltip
                        title={open ? "" : docName}
                        placement="right"
                      >
                        <ListItemButton
                          component={SafeNavigationLink}
                          href={`/view/${post.id}`}
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
                                fontSize: "1em",
                                color: "text.secondary",
                              }}
                            />
                          </ListItemIcon>
                          {open && (
                            <ListItemText
                              primary={docName}
                              primaryTypographyProps={{
                                fontSize: "0.8em",
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
                }
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
