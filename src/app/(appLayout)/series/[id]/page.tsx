import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findSeriesById } from "@/repositories/series";
import SeriesView from "@/components/SeriesView";
import { Metadata } from "next";

// Mark this page as dynamic since it depends on session
export const dynamic = "force-dynamic";

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
    description: series.description,
  };
}

export default async function SeriesDetailPage(
  { params }: SeriesDetailPageProps,
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const series = await findSeriesById(id);

  if (!series) {
    notFound();
  }

  return <SeriesView series={series} user={session?.user} />;
}
