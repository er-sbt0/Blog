"use client";
import React from "react";
import Grid from "@mui/material/Grid2";
import { Series, User, UserDocument } from "@/types";
import { type ViewType } from "@/components/shared/ViewToggle";
import { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import SeriesGroupCard from "./SeriesGroupCard";
import { PostsCompactListView } from "./PostsCompactListView";

interface SeriesSectionProps {
  series: Series[];
  user?: User;
  viewType?: ViewType;
}

/**
 * Renders the dedicated "Series" section on the /posts page.
 *
 * - grid (default): collapsible SeriesGroupCard per series, started expanded.
 * - compact: PostsCompactListView with series rendered as collapsible group rows.
 */
const SeriesSection: React.FC<SeriesSectionProps> = ({
  series,
  user,
  viewType = "grid",
}) => {
  if (viewType === "compact") {
    const groups: SeriesGroupItem[] = series.map((s) => ({
      type: "series" as const,
      series: s,
      posts: (s.posts ?? []).map((p) => ({ id: p.id, cloud: p })),
      sortKey: s.createdAt ? new Date(s.createdAt).getTime() : 0,
    }));
    return <PostsCompactListView groups={groups} user={user} />;
  }

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {series.map((s) => {
        const posts: UserDocument[] = (s.posts ?? []).map((p) => ({
          id: p.id,
          cloud: p,
        }));
        return (
          <Grid key={s.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <SeriesGroupCard
              series={s}
              posts={posts}
              user={user}
              collapsible
              defaultExpanded
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

export default SeriesSection;
