"use client";
import React from "react";
import { Series, User } from "@/types";
import SeriesList from "@/components/SeriesList";

interface SeriesListWrapperProps {
  series: Series[];
  user?: User;
}

/**
 * Client-side wrapper for SeriesList
 * Handles any client-side state needed for the series list page
 */
const SeriesListWrapper: React.FC<SeriesListWrapperProps> = ({
  series,
  user,
}) => {
  return (
    <SeriesList
      series={series}
      user={user}
      showHeader={true}
    />
  );
};

export default SeriesListWrapper;
