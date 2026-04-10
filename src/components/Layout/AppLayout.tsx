"use client";
import StoreProvider from "@/store/StoreProvider";
import SideBar from "./SideBar";
import DocumentInfoDrawerArrow from "./DocumentInfoDrawerArrow";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import HydrationManager from "./HydrationManager";
import Breadcrumbs from "./Breadcrumbs";
import { Box, Container, Toolbar } from "@mui/material";
import { Suspense } from "react";
import { SidebarWidthProvider } from "./SideBar/SidebarWidthContext";
import { CONTENT_RIGHT_PADDING } from "./SideBar/constants";

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <SideBar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          pr: { sm: `${CONTENT_RIGHT_PADDING}px` },
          overflow: "auto", /* Allow scrolling but scrollbar is hidden by CSS */
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
