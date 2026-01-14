"use client";
import React, { memo } from "react";
import { SeriesCardProps } from "./types";
import DetailedVariant from "./variants/DetailedVariant";
import CompactVariant from "./variants/CompactVariant";

/**
 * Unified Series Card Component
 *
 * Displays series information in different layouts based on the variant prop.
 *
 * Variants:
 * - "detailed": Rich display with metadata, description, and actions (series catalog)
 * - "compact": Collapsible display with posts list (posts timeline)
 * - "minimal": Simple compact display (future: sidebars, widgets)
 * - "featured": Hero-style with background image (future: landing pages)
 *
 * @example
 * // Series catalog page
 * <SeriesCard variant="detailed" series={series} user={user} />
 *
 * @example
 * // Posts timeline
 * <SeriesCard variant="compact" series={series} posts={posts} collapsible />
 */
const SeriesCard: React.FC<SeriesCardProps> = memo((props) => {
  switch (props.variant) {
    case "detailed":
      return <DetailedVariant {...props} />;

    case "compact":
      return <CompactVariant {...props} />;

    case "minimal":
      // Future implementation
      return (
        <DetailedVariant {...props} variant="detailed" showMetadata={false} />
      );

    case "featured":
      // Future implementation
      return <DetailedVariant {...props} variant="detailed" />;

    default:
      // TypeScript should prevent this, but handle gracefully
      return <DetailedVariant {...(props as any)} variant="detailed" />;
  }
});

SeriesCard.displayName = "SeriesCard";

export default SeriesCard;
