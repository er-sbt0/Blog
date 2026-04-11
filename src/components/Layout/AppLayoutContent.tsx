"use client";
import { useEffect } from "react";
import SideBar from "./SideBar";
import HydrationManager from "./HydrationManager";
import Breadcrumbs from "./Breadcrumbs";
import { Box, Container } from "@mui/material";
import { CONTENT_RIGHT_PADDING } from "./SideBar/constants";
import { actions, type RootState, useDispatch, useSelector } from "@/store";

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();
  const initialized = useSelector((state: RootState) => state.ui.initialized);

  useEffect(() => {
    if (!initialized) dispatch(actions.load());
  }, [dispatch, initialized]);
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
        <Box id="back-to-top-anchor" />
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

export default AppLayoutContent;
