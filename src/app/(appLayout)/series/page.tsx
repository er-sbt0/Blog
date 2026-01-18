import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findAllSeries } from "@/repositories/series";
import SeriesListWrapper from "@/components/SeriesListWrapper";

// Force dynamic rendering to check session on every request
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Series | Blog",
  description:
    "Browse all blog series. Discover curated collections of related posts organized by topic.",
  keywords: ["blog series", "collections", "tutorials", "guides", "topics"],
  openGraph: {
    title: "All Series | Blog",
    description: "Browse all blog series and curated collections",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "All Series | Blog",
    description: "Browse all blog series and curated collections",
  },
  alternates: {
    canonical: "/series",
  },
};

export default async function SeriesPage() {
  const session = await getServerSession(authOptions);
  const series = await findAllSeries();

  // Serialize user object to ensure it can be passed from server to client
  // Note: Server session may not work during SSR, client-side session is used as fallback
  const user = session?.user
    ? {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      handle: session.user.handle,
      role: session.user.role,
    }
    : undefined;

  return (
    <SeriesListWrapper
      series={series}
      user={user}
    />
  );
}
