import type { Metadata } from "next";
import TranscriptView from "@/components/RemoteSessions/TranscriptView";

export const metadata: Metadata = {
  title: "Session | Blog",
};

interface Props {
  params: Promise<{ id: string }>;
}

/** One remote transcript (docs/plans/remote-claude.md §4.7). */
export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  return <TranscriptView id={id} />;
}
