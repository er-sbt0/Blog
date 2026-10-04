import { refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { findRemoteSessionsTree } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Every host and session the caller has, for the sidebar tree (remote-claude.md §4.6). */
export const GET = userRoute(async (_request, { user }) => {
  refuseOffDesktop("Remote sessions");
  return NextResponse.json({ data: await findRemoteSessionsTree(user.id) });
});
