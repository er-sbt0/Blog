/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */

/** Width when sidebar is collapsed (icons only) — legacy value kept for reference */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

/** Width of the new compact (icon-strip) sidebar mode */
export const COMPACT_WIDTH = 62;

/** LocalStorage key for persisting sidebar mode */
export const SIDEBAR_MODE_KEY = "ui.sidebarMode";

/** Default width when sidebar is expanded; also the minimum resizable width */
export const SIDEBAR_DEFAULT_WIDTH = 130;

/** Minimum width when resizing — equal to the default so the user cannot shrink below it */
export const SIDEBAR_MIN_WIDTH = SIDEBAR_DEFAULT_WIDTH;

/** Maximum width when resizing */
export const SIDEBAR_MAX_WIDTH = 450;

/** Right padding for content area (space from right edge of viewport) */
export const CONTENT_RIGHT_PADDING = 75;

/** LocalStorage key for persisting user's preferred width */
export const SIDEBAR_STORAGE_KEY = "sidebar-width";
