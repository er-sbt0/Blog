import { SxProps, Theme } from "@mui/material/styles";
import { Series, User, UserDocument } from "@/types";

/**
 * Available series card variants
 */
export type SeriesCardVariant =
  | "detailed" // Rich display for series catalog
  | "compact" // Collapsible display for posts timeline
  | "minimal" // Future: Simple display for sidebars
  | "featured"; // Future: Hero-style with background

/**
 * Common props shared by all variants
 */
export interface BaseSeriesCardProps {
  /** The series data */
  series: Series;
  /** The current user */
  user?: User;
  /** Additional styles to apply */
  sx?: SxProps<Theme>;
  /** Animation stagger index */
  animationIndex?: number;
  /** Whether to show actions menu */
  showActions?: boolean;
  /** Callback to create a new post in this series */
  onCreatePost?: () => void;
}

/**
 * Props specific to detailed variant
 */
export interface DetailedVariantProps extends BaseSeriesCardProps {
  variant: "detailed";
  /** Whether to show metadata (date, author, description) */
  showMetadata?: boolean;
}

/**
 * Props specific to compact variant
 */
export interface CompactVariantProps extends BaseSeriesCardProps {
  variant: "compact";
  /** Posts in this series */
  posts: UserDocument[];
  /** Whether the card is collapsible */
  collapsible?: boolean;
  /** Default expanded state */
  defaultExpanded?: boolean;
  /** Callback when expanded */
  onExpand?: () => void;
  /** Callback when collapsed */
  onCollapse?: () => void;
}

/**
 * Props specific to minimal variant (future)
 */
export interface MinimalVariantProps extends BaseSeriesCardProps {
  variant: "minimal";
}

/**
 * Props specific to featured variant (future)
 */
export interface FeaturedVariantProps extends BaseSeriesCardProps {
  variant: "featured";
  /** Background image URL */
  backgroundImage?: string;
  /** Background gradient */
  backgroundGradient?: string;
}

/**
 * Union type of all variant props
 */
export type SeriesCardProps =
  | DetailedVariantProps
  | CompactVariantProps
  | MinimalVariantProps
  | FeaturedVariantProps;
