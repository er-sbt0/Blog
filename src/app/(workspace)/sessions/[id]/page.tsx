import type { Metadata } from "next";
import TranscriptView from "@/components/RemoteSessions/TranscriptView";
import { parseEntryParam } from "@/components/RemoteSessions/transcriptWindow";

export const metadata: Metadata = {
  title: "Session | Blog",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entry?: string | string[]; q?: string | string[] }>;
}

/**
 * One remote transcript (docs/plans/remote-claude.md §4.7). A search hit links
 * here with `?entry=<idx>&q=<query>` (§4.9) to open at that entry.
 */
export default async function SessionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { entry, q } = await searchParams;
  return (
    <TranscriptView
      id={id}
      entry={parseEntryParam(entry)}
      q={(Array.isArray(q) ? q[0] : q) ?? null}
    />
  );
}
