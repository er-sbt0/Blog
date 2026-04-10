"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { documentsSelectors, type RootState, useSelector } from "@/store";
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Home, LibraryBooks, StickyNote2 } from "@mui/icons-material";
import { styles } from "../styles";
import { DocumentStatus, type UserDocument } from "@/types";
import { useSidebarState } from "./hooks/useSidebarState";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useSidebarFontSize } from "./hooks/useSidebarFontSize";
import { useSidebarActions } from "./hooks/useSidebarActions";
import { SidebarHeader } from "./SidebarHeader";
import { ActivePostsSection } from "./ActivePostsSection";
import { PostContextMenu } from "./PostContextMenu";
import { SafeNavigationLink } from "./SafeNavigationLink";
import {
  buildSeriesMap,
  groupPostsBySeries,
} from "@/utils/posts/seriesGrouping";

const NAV_ITEM_MIN_HEIGHT = 42;
const USER_ITEM_MIN_HEIGHT = 48;

const navigationItems = [
  { text: "Home", icon: <Home />, path: "/" },
  { text: "Posts", icon: <LibraryBooks />, path: "/posts" },
  { text: "Notes", icon: <StickyNote2 />, path: "/notes" },
];

const SideBar: React.FC = () => {
  const pathname = usePathname();
  const theme = useTheme();

  const { open, toggleSidebar, isMobile } = useSidebarState();
  const { isResizing, startResize, getEffectiveWidth } = useSidebarWidth();
  const { sidebarFontSize, increaseFontSize, decreaseFontSize, resetFontSize } =
    useSidebarFontSize();
  const {
    contextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    ...postItemActions
  } = useSidebarActions();

  const { shortcutHint } = useKeyboardShortcuts({
    onToggleSidebar: toggleSidebar,
    enabled: true,
  });

  const user = useSelector((state: RootState) => state.user);
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );
  const seriesList = useSelector((state: RootState) => state.series);

  const activeDocuments = useMemo((): UserDocument[] => {
    if (!user || !documents) return [];
    return documents.filter((doc) => {
      const cloudDocument = doc.cloud;
      const localDocument = doc.local;
      if (cloudDocument) {
        return (
          cloudDocument.status === DocumentStatus.ACTIVE &&
          cloudDocument.author.id === user.id
        );
      }
      if (localDocument) return localDocument.status === DocumentStatus.ACTIVE;
      return false;
    });
  }, [user, documents]);

  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  const groupedActivePosts = useMemo(
    () => groupPostsBySeries(activeDocuments, seriesMap),
    [activeDocuments, seriesMap],
  );

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      sx={{
        width: getEffectiveWidth(open),
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          width: getEffectiveWidth(open),
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
      <SidebarHeader
        open={open}
        sidebarFontSize={sidebarFontSize}
        toggleSidebar={toggleSidebar}
        shortcutHint={shortcutHint}
        increaseFontSize={increaseFontSize}
        decreaseFontSize={decreaseFontSize}
        resetFontSize={resetFontSize}
      />

      <Divider sx={styles.divider} />

      <Box
        role="navigation"
        aria-label="Main navigation"
        sx={{ ...styles.sectionBox, flexShrink: 0, pb: 0 }}
      >
        <List>
          {navigationItems.map((item) => (
            <ListItem key={item.text} disablePadding sx={{ display: "block" }}>
              <Tooltip title={open ? "" : item.text} placement="right">
                <ListItemButton
                  component={SafeNavigationLink}
                  href={item.path}
                  selected={Boolean(
                    pathname === item.path ||
                      pathname.startsWith(`${item.path}/`),
                  )}
                  sx={{
                    minHeight: NAV_ITEM_MIN_HEIGHT,
                    justifyContent: open ? "initial" : "center",
                    px: 2.5,
                    "&.Mui-selected": {
                      bgcolor: "action.selected",
                      "&:hover": { bgcolor: "rgba(0, 0, 0, 0.15)" },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : "auto",
                      justifyContent: "center",
                      "& .MuiSvgIcon-root": { fontSize: "1.2em" },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {open && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{ fontSize: "0.9em" }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={styles.divider} />

      {user && activeDocuments.length > 0
        ? (
          <ActivePostsSection
            groupedActivePosts={groupedActivePosts}
            sidebarOpen={open}
            pathname={pathname}
            itemActions={postItemActions}
          />
        )
        : <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />}

      <Divider sx={styles.dividerBottom} />

      <Box sx={{ ...styles.userBox, flexShrink: 0 }}>
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
                    minHeight: USER_ITEM_MIN_HEIGHT,
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
                      sx={{ width: 32, height: 32 }}
                    />
                  </ListItemIcon>
                  {open && (
                    <ListItemText primary={user ? user.name : "Sign In"} />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          </List>
        </Box>
      </Box>

      {open && !isMobile && (
        <Box
          onMouseDown={startResize}
          sx={{
            position: "fixed",
            top: 0,
            left: getEffectiveWidth(open) - 4,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            backgroundColor: isResizing ? "primary.main" : "transparent",
            transition: isResizing ? "none" : "background-color 0.2s",
            "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
            "&:active": { backgroundColor: "primary.main", opacity: 1 },
            zIndex: 1300,
          }}
        />
      )}

      <PostContextMenu
        contextMenu={contextMenu}
        onClose={handleCloseContextMenu}
        onEdit={handleEditPost}
        onRename={handleRenameFromMenu}
        onDelete={handleDeletePost}
      />
    </Drawer>
  );
};

export default SideBar;
