import type { Metadata } from "next";
import SessionsLanding from "@/components/RemoteSessions/SessionsLanding";

export const metadata: Metadata = {
  title: "Sessions | Blog",
  description: "Remote Claude Code sessions",
};

/** Desktop-only (docs/plans/remote-claude.md §4.6); the web build says so. */
export default function SessionsPage() {
  return <SessionsLanding />;
}
