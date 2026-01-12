/**
 * Sidebar layout constants
 * Single source of truth for all sidebar-related dimensions
 */

/** Width when sidebar is collapsed (icons only) */
export const SIDEBAR_COLLAPSED_WIDTH = 72;

/** Default width when sidebar is expanded */
export const SIDEBAR_DEFAULT_WIDTH = 130;

/** Minimum width when resizing */
export const SIDEBAR_MIN_WIDTH = 130;

/** Maximum width when resizing */
export const SIDEBAR_MAX_WIDTH = 450;

/** Fixed margin-left for content area (constant, not dependent on sidebar width) */
export const SIDEBAR_CONTENT_MARGIN = 105;

/** Right padding for content area (space from right edge of viewport) */
export const CONTENT_RIGHT_PADDING = 75;

/** LocalStorage key for persisting user's preferred width */
export const SIDEBAR_STORAGE_KEY = "sidebar-width";
