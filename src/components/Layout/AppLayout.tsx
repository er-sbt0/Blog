"use client";
import StoreProvider from "@/store/StoreProvider";
import SideBar from "./SideBar";
import DocumentInfoDrawerArrow from "./DocumentInfoDrawerArrow";
import ScrollTop from "./ScrollTop";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import HydrationManager from "./HydrationManager";
import Breadcrumbs from "./Breadcrumbs";
import { Box, Container, Toolbar, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Suspense } from "react";
import {
  SidebarWidthProvider,
  useSidebarWidth,
} from "./SideBar/SidebarWidthContext";
import { useSidebarState } from "./SideBar/hooks/useSidebarState";

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { open } = useSidebarState();
  const { getEffectiveWidth } = useSidebarWidth();
  const actualSidebarWidth = isMobile ? 0 : getEffectiveWidth(open);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <SideBar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${actualSidebarWidth}px)` },
          ml: { sm: `${actualSidebarWidth}px` },
          overflow: "auto", /* Allow scrolling but scrollbar is hidden by CSS */
          transition: theme.transitions.create([
            "margin",
            "width",
          ], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar
          id="back-to-top-anchor"
          sx={{
            displayPrint: "none",
            minHeight: "0 !important",
          }}
        />
        <Breadcrumbs />
        <HydrationManager>
          <Container
            className="editor-container"
            id="editor-main-container"
            maxWidth={false}
            sx={{
              display: "flex",
              flexDirection: "column",
              mx: 0, /* Remove auto centering to allow full width */
              my: 2,
              flex: 1,
              position: "relative",
              overflow:
                "auto", /* Allow scrolling but scrollbar is hidden by CSS */
              width: "100%",
              maxWidth: "100%",
              px: {
                xs: 1,
                sm: 1,
                md: 1, /* Keep minimal padding */
              },
            }}
          >
            {children}
          </Container>
        </HydrationManager>
      </Box>
      <ScrollTop />
    </Box>
  );
};

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Suspense>
        <ProgressBar />
      </Suspense>
      <StoreProvider>
        <SidebarWidthProvider>
          <AppLayoutContent>{children}</AppLayoutContent>
          <AlertDialog />
          <Announcer />
          <DocumentInfoDrawerArrow />
        </SidebarWidthProvider>
      </StoreProvider>
    </>
  );
};

export default AppLayout;
