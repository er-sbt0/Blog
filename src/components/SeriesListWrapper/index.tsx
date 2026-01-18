"use client";
import React from "react";
import { Series, User } from "@/types";
import SeriesList from "@/components/SeriesList";
import { useSession } from "next-auth/react";

interface SeriesListWrapperProps {
  series: Series[];
  user?: User;
}

/**
 * Client-side wrapper for SeriesList
 * Handles any client-side state needed for the series list page
 * Fetches session on client-side since SSR session doesn't work reliably
 */
const SeriesListWrapper: React.FC<SeriesListWrapperProps> = ({
  series,
  user: serverUser,
}) => {
  // Fetch session on client-side
  const { data: session } = useSession();
  const clientUser = session?.user as User | undefined;

  // Use client session if server session is not available
  const user = serverUser || clientUser;

  return (
    <SeriesList
      series={series}
      user={user}
      showHeader={true}
    />
  );
};

export default SeriesListWrapper;
