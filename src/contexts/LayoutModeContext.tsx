"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type ResizablePanelConfig,
  useResizablePanel,
} from "@/hooks/useResizablePanel";

/**
 * The right rail no longer has a mode.
 *
 * There used to be a `RailMode` of `"full" | "compact"` here, persisted under
 * `ui.railMode`. The panel is now one or two view slots and it is open iff a
 * slot is filled — see `components/Layout/RightRail/panelState.ts`. That made
 * the boolean not merely redundant but wrong: it could say "open" with nothing
 * to show, and closing the last view had to remember to flip it.
 *
 * The width below stays, because a width is not a mode: it is what the column
 * is when there is something in it.
 */
/** Width of the always-present compact strip on the rail's right edge. */
export const RAIL_COMPACT_W = 54;

/**
 * Per-panel geometry. These triples used to be six loose exports, five of which
 * nothing outside this file read; they belong to the panel they configure, not
 * to the module. The sidebar's equivalents stay in
 * `components/Layout/SideBar/constants.ts` because they are not just numbers —
 * that file documents a detent and a spring the values are derived from.
 *
 * The storage keys are load-bearing: changing one silently resets every existing
 * user's layout to the default.
 */
const RAIL_PANEL: ResizablePanelConfig = {
  storageKey: "ui.railWidth",
  defaultWidth: 280,
  minWidth: 180,
  maxWidth: 520,
};

const COPILOT_PANEL: ResizablePanelConfig = {
  storageKey: "ui.copilotWidth",
  defaultWidth: 380,
  minWidth: 320,
  maxWidth: 640,
};

/**
 * Where the inline Copilot bar remembers being minimized.
 *
 * Load-bearing in the same way the widths above are: renaming it silently gives
 * every existing user their bar back.
 */
const COPILOT_BAR_MIN_KEY = "ui.copilotBarMinimized";

interface LayoutModeContextType {
  /** User's preferred rail width, applied whenever the panel has a slot. */
  railWidth: number;
  /** Whether the user is currently dragging the rail resize handle */
  isRailResizing: boolean;
  /** Start a rail resize drag */
  startRailResize: (e: React.MouseEvent) => void;
  /** Whether the Copilot panel is showing */
  copilotOpen: boolean;
  /**
   * Show/hide the Copilot panel. A setter rather than a toggle because the
   * panel's own close button must mean *close*: it stays mounted through the
   * 225ms clip-out, so a second click on a toggle would reopen it.
   */
  setCopilotOpen: (open: boolean) => void;
  /**
   * Whether the inline Copilot bar is minimized to its corner button.
   *
   * Here rather than inside `InlineCopilotBar` because it is not only the bar's
   * business: `AppLayoutContent` reserves `INLINE_BAR_CLEARANCE` at the foot of
   * the scrolling content for exactly the states that draw a bar, and that
   * reservation is what minimizing is *for*.
   */
  copilotBarMinimized: boolean;
  /** Minimize or restore the inline bar. Persisted across reloads. */
  setCopilotBarMinimized: (minimized: boolean) => void;
  /** User's preferred Copilot panel width */
  copilotWidth: number;
  /** Whether the user is currently dragging the Copilot resize handle */
  isCopilotResizing: boolean;
  /** Start a Copilot panel resize drag */
  startCopilotResize: (e: React.MouseEvent) => void;
}

const LayoutModeContext = createContext<LayoutModeContextType | undefined>(
  undefined,
);

export const useLayoutMode = () => {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return ctx;
};

export const LayoutModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Copilot visibility lives here rather than in the Redux `ui` slice, where it
  // used to sit apart from its own width: a panel's open state and its width are
  // one decision (the grid column is `open ? width : 0`), and splitting them
  // across two stores meant every consumer subscribed to both. Nothing outside
  // the layout reads it and no thunk touches it, so the store is not the right
  // home; the widths in particular update per mousemove frame, which is a
  // dispatch-per-frame if they move the other way. Not persisted — same as
  // before, the panel opens closed.
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Unlike the panel above, this one *is* persisted — a bar you pushed out of
  // the way should stay out of it. It starts `false` to match the server, and
  // the stored value lands in an effect: a lazy initializer reading
  // localStorage would render something the SSR pass did not, which is the
  // hydration mismatch docs/guides/hydration.md is about. The cost is one frame
  // of bar-and-clearance on a minimized user's reload.
  const [copilotBarMinimized, setBarMinimized] = useState(false);
  useEffect(() => {
    setBarMinimized(localStorage.getItem(COPILOT_BAR_MIN_KEY) === "1");
  }, []);
  const setCopilotBarMinimized = useCallback((minimized: boolean) => {
    setBarMinimized(minimized);
    localStorage.setItem(COPILOT_BAR_MIN_KEY, minimized ? "1" : "0");
  }, []);

  const rail = useResizablePanel(RAIL_PANEL);
  const copilot = useResizablePanel(COPILOT_PANEL);

  return (
    <LayoutModeContext.Provider
      value={{
        railWidth: rail.width,
        isRailResizing: rail.isResizing,
        startRailResize: rail.startResize,
        copilotOpen,
        setCopilotOpen,
        copilotBarMinimized,
        setCopilotBarMinimized,
        copilotWidth: copilot.width,
        isCopilotResizing: copilot.isResizing,
        startCopilotResize: copilot.startResize,
      }}
    >
      {children}
    </LayoutModeContext.Provider>
  );
};
