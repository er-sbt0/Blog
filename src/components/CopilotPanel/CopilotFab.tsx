"use client";
import { Badge, Fab, Tooltip, Zoom } from "@mui/material";
import { Sparkles } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

interface CopilotFabProps {
  /** Whether the bar is minimized — i.e. whether this button is the surface. */
  in: boolean;
  /** Restore the bar. Also focuses its field, so this is the whole way back. */
  onClick: () => void;
  /**
   * Whether the scratch thread has anything in it. Minimizing keeps the
   * conversation, so a dot is the only thing left saying it is there.
   */
  hasThread: boolean;
  /** Why the Copilot is unavailable, if it is. Mirrors the bar's composer. */
  disabledReason?: string;
}

/**
 * The inline Copilot bar, minimized: a corner button that brings it back.
 *
 * Deliberately the *whole* of the minimized state. The bar's other two
 * reductions — the resting strip and `collapsed` — both keep a composer on
 * screen and keep `INLINE_BAR_CLEARANCE` reserved under the document. This one
 * gives the page back, so it has to be small enough to be worth the trade and
 * visible enough to be found again.
 *
 * Positioned by its parent, which is the bar's own wrapper: the two are one
 * affordance in two sizes and must not be able to drift apart.
 */
const CopilotFab: React.FC<CopilotFabProps> = ({
  in: shown,
  onClick,
  hasThread,
  disabledReason,
}) => (
  <Zoom in={shown} unmountOnExit>
    <Badge
      color="primary"
      variant="dot"
      invisible={!hasThread || !!disabledReason}
      sx={{
        position: "absolute",
        right: 16,
        bottom: 16,
        // The wrapper disables pointer events so the document behind the bar
        // stays clickable; the button has to opt back in, exactly as the card
        // does.
        pointerEvents: "auto",
      }}
    >
      {
        /* A span inside the tooltip, because a disabled button fires no
          pointer events and would take its own explanation with it. */
      }
      <Tooltip title={disabledReason ?? "Copilot (⌘/)"} placement="left">
        <span>
          <Fab
            size="small"
            color="primary"
            aria-label="Show Copilot"
            disabled={!!disabledReason}
            onClick={onClick}
          >
            <Sparkles size={ICON_SIZE.dense} />
          </Fab>
        </span>
      </Tooltip>
    </Badge>
  </Zoom>
);

export default CopilotFab;
