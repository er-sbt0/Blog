import SplashScreen from "@/components/shared/SplashScreen";
import { isDesktopBuild } from "@/lib/desktop";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "You are offline",
};

/**
 * The service worker's `fallbacks.document` (`next.config.ts`) — the page shown
 * when a navigation cannot reach the server.
 *
 * It exists only because the service worker does, so the desktop build drops it
 * with the worker (docs/plans/desktop-app.md §5). There is no network between
 * that window and its server: either the local server is up, or the app did not
 * start and the shell's error window is what you are looking at. "Please check
 * your connection" would be advice about a connection that does not exist.
 *
 * `notFound()` rather than deleting the file, because the page is still the
 * right answer for every web deployment and one build must not delete the
 * other's routes.
 */
const page = () => {
  if (isDesktopBuild()) notFound();

  return (
    <SplashScreen
      title="You are offline"
      subtitle="Please check your connection"
    />
  );
};

export default page;
