"use client";
import { Box, IconButton, SwipeableDrawer, Typography } from "@mui/material";
import { Article, Close } from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { useEffect, useRef, useState } from "react";
import { alpha } from "@mui/material/styles";

const AppDrawer: React.FC<React.PropsWithChildren<{ title: string }>> = (
  { title, children },
) => {
  const open = useSelector((state) => state.ui.drawer);
  const dispatch = useDispatch();
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const toggleDrawer = () => {
    dispatch(actions.toggleDrawer());
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && open) {
        const dragDistance = e.clientX - startX;
        // If dragged more than 50px to the right, close the drawer
        if (dragDistance > 50) {
          toggleDrawer();
          setIsDragging(false);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && open) {
        const dragDistance = e.touches[0].clientX - startX;
        // If dragged more than 50px to the right, close the drawer
        if (dragDistance > 50) {
          toggleDrawer();
          setIsDragging(false);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, open, startX]);

  useEffect(() => {
    return () => {
      dispatch(actions.toggleDrawer(false));
    };
  }, []);

  return (
    <>
      <SwipeableDrawer
        anchor="right"
        open={open}
        onOpen={toggleDrawer}
        onClose={toggleDrawer}
        sx={{ displayPrint: "none" }}
        id="document-info-drawer"
      >
        <Box sx={{ p: 2, width: 300, position: "relative", height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Article sx={{ mr: 1 }} />
            <Typography variant="h6">{title}</Typography>
            <IconButton onClick={toggleDrawer} sx={{ ml: "auto" }}>
              <Close />
            </IconButton>
          </Box>
          {children}

          {/* Invisible drag handle area at left edge */}
          <Box
            ref={dragHandleRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 8,
              cursor: "ew-resize",
              zIndex: 1300,
              "&:hover": {
                backgroundColor: (theme) =>
                  alpha(theme.palette.action.hover, 0.1),
              },
            }}
            aria-label="drag to close document info"
          />
        </Box>
      </SwipeableDrawer>
    </>
  );
};

export default AppDrawer;
