"use client";
import { useEffect } from "react";
import SideBar from "./SideBar";
import HydrationManager from "./HydrationManager";
import EditorTopBar from "./EditorTopBar";
import RightRail from "./RightRail";
import { Box, Container } from "@mui/material";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { COMPACT_WIDTH } from "@/components/Layout/SideBar/constants";
import { RAIL_COMPACT_W } from "@/contexts/LayoutModeContext";
import FloatingOutlinePill from "./FloatingOutlinePill";

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const { isResizing, getEffectiveWidth } = useSidebarWidth();
  const { railMode, railWidth, isRailResizing, viewMode } = useLayoutMode();

  useEffect(() => {
    if (!initialized) dispatch(actions.load());
  }, [dispatch, initialized]);

  const isFocus = viewMode === "focus";
  const sidebarW = isFocus ? COMPACT_WIDTH : getEffectiveWidth();
  const railW = isFocus
    ? 0
    : railMode === "full"
    ? railWidth
    : railMode === "compact"
    ? RAIL_COMPACT_W
    : 0;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `${sidebarW}px 1fr ${railW}px`,
        height: "100vh",
        overflow: "hidden",
        transition: isResizing || isRailResizing
          ? "none"
          : "grid-template-columns 225ms cubic-bezier(0.4, 0, 0.6, 1)",
      }}
    >
      <SideBar />
      <Box
        id="app-main"
        component="main"
        sx={{
          minWidth: 0,
          overflow: "auto",
          position: "relative",
        }}
      >
        <Box id="back-to-top-anchor" />
        <EditorTopBar />
        <FloatingOutlinePill />
        <HydrationManager>
          <Container
            className="editor-container"
            id="editor-main-container"
            maxWidth={false}
            sx={{
              display: "flex",
              flexDirection: "column",
              mx: isFocus ? "auto" : 0,
              my: 2,
              flex: 1,
              position: "relative",
              overflow: "auto",
              width: "100%",
              maxWidth: isFocus ? 720 : undefined,
              pl: {
                xs: 5,
                sm: 10,
                md: 12,
              },
              pr: {
                xs: 4,
                sm: 6,
                md: 8,
              },
            }}
          >
            {children}
          </Container>
        </HydrationManager>
      </Box>
      <RightRail railMode={isFocus ? "hidden" : railMode} />
    </Box>
  );
};

export default AppLayoutContent;
