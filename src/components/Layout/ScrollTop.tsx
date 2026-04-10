"use client";
import { Fab, useScrollTrigger } from "@mui/material";
import { KeyboardArrowUp } from "@mui/icons-material";
import { FloatingActionButton } from "./FloatingActionsContainer";

const ScrollTop: React.FC = () => {
  const trigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 100,
  });

  const handleClick = () => {
    const anchor = document.querySelector("#back-to-top-anchor");
    if (anchor) {
      anchor.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  // Use Zoom for animation but place the Fab inside our container system
  // Priority 10 ensures it appears below other buttons (since it's less important)
  return (
    <>
      {trigger && (
        <FloatingActionButton id="scroll-top" priority={30}>
          <Fab
            color="primary"
            size="medium"
            aria-label="scroll back to top"
            onClick={handleClick}
            sx={{
              displayPrint: "none",
            }}
          >
            <KeyboardArrowUp />
          </Fab>
        </FloatingActionButton>
      )}
    </>
  );
};

export default ScrollTop;
