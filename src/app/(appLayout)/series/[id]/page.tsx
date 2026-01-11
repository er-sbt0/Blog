import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findSeriesById } from "@/repositories/series";
import SeriesView from "@/components/SeriesView";
import { Metadata } from "next";
import { cache } from "react";

// Mark this page as dynamic since it depends on session
export const dynamic = "force-dynamic";

const getCachedSession = cache(async () => await getServerSession(authOptions));

interface SeriesDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: SeriesDetailPageProps,
): Promise<Metadata> {
  const { id } = await params;
  const series = await findSeriesById(id);

  if (!series) {
    return {
      title: "Series Not Found",
    };
  }

  return {
    title: `${series.title} | Series`,
    description: series.description ||
      `A collection of posts in the "${series.title}" series`,
  };
}

export default async function SeriesDetailPage(
  { params }: SeriesDetailPageProps,
) {
  const { id } = await params;
  const session = await getCachedSession();
  const series = await findSeriesById(id);

  if (!series) {
    notFound();
  }

  return <SeriesView series={series} user={session?.user} />;
}
