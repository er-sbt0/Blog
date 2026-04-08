import { alpha, type Theme } from "@mui/material/styles";

/**
 * Modern blog-oriented card theme with magazine-style design.
 * Derives values from the MUI theme so palette/typography changes propagate
 * automatically (e.g. dark-mode palette, custom brand fonts).
 */
export const createCardTheme = (theme: Theme) => ({
  // Layout - modern blog proportions with better aspect ratios
  borderRadius: 6, // Reduced from 12px for less rounded appearance
  minHeight: {
    post: "380px", // Slightly taller for better content display
  },
  maxHeight: {
    post: "450px", // Increased for more content space
  },
  aspectRatio: "3:4", // Better proportion for blog content

  // Content areas - optimized for modern blog layout
  contentRatio: {
    top: "70%", // More emphasis on content preview
    bottom: "30%", // Streamlined metadata area
  },

  // Spacing - refined for modern design (MUI spacing units)
  spacing: {
    contentPadding: 3.5,
    chipGap: 1.25,
    titleMargin: 2,
    sectionGap: 2.5,
    cardGap: 2, // Gap between cards in grid
  },

  // Typography - derived from MUI theme scale
  typography: {
    titleSize: theme.typography.h5.fontSize, // ~1.25rem
    titleWeight: theme.typography.h5.fontWeight ?? 600,
    titleLineHeight: theme.typography.h5.lineHeight ?? 1.25,
    excerptSize: theme.typography.body2.fontSize, // ~0.875rem
    excerptLineHeight: theme.typography.body2.lineHeight ?? 1.6,
    metaSize: theme.typography.caption.fontSize, // ~0.75rem
    authorSize: theme.typography.body2.fontSize,
  },

  // Colors - derived from MUI theme palette
  colors: {
    border: theme.palette.divider,
    cardBackground: theme.palette.background.paper,
    textPrimary: theme.palette.text.primary,
    textSecondary: theme.palette.text.secondary,

    // Unified hover blue - follows primary palette
    hoverBlue: {
      text: theme.palette.primary.main,
      border: alpha(theme.palette.primary.main, 0.5),
      borderActive: alpha(theme.palette.primary.main, 0.7),
    },

    // Enhanced shadows with subtle depth
    shadow: {
      default: "0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
      hover: "0 12px 32px rgba(0,0,0,0.15), 0 6px 16px rgba(0,0,0,0.1)",
      focus: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
    },

    // Status colors - solid values from theme palette; gradients use theme-adjacent hues
    status: {
      draft: {
        bg: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)",
        border: theme.palette.warning.main,
        text: theme.palette.warning.dark,
        icon: theme.palette.warning.main,
      },
      published: {
        bg: "linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)",
        border: theme.palette.success.main,
        text: theme.palette.success.dark,
        icon: theme.palette.success.main,
      },
      active: {
        bg: "linear-gradient(135deg, #eff6ff 0%, #bfdbfe 100%)",
        border: theme.palette.info.main,
        text: theme.palette.info.dark,
        icon: theme.palette.info.main,
      },
      done: {
        bg: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
        border: theme.palette.text.secondary,
        text: theme.palette.text.secondary,
        icon: theme.palette.text.secondary,
      },
    },

    // Series colors - secondary palette (purple)
    series: {
      bg: "linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)",
      border: theme.palette.secondary.main,
      text: theme.palette.secondary.dark,
      icon: theme.palette.secondary.main,
    },

    // Author chip colors
    author: {
      bg: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
      border: theme.palette.text.secondary,
      text: theme.palette.text.secondary,
    },

    // Hover states
    hover: {
      cardBackground: theme.palette.background.default,
      borderColor: theme.palette.divider,
    },
  },

  // Simplified animations (removed)
  animation: {
    transition: "none",
    hoverTransform: "none",
    hoverDuration: "0ms",
    focusTransition: "none",
  },

  // Simplified action bar design
  actionBar: {
    height: "48px",
    totalHeight: "60px",
    minHeight: "40px",
    backgroundColor: "transparent",
    backdropFilter: "none",
    borderTop: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
  },

  // Enhanced accessibility
  accessibility: {
    minimumTouchTarget: 48,
    focusRingWidth: 3,
    focusRingOffset: 2,
  },

  // Image handling for blog posts
  image: {
    aspectRatio: "16:9",
    borderRadius: 4,
    objectFit: "cover",
    fallbackBackground: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
  },
});

/** Inferred return type — use this when you need to type a destructured cardTheme. */
export type CardTheme = ReturnType<typeof createCardTheme>;
