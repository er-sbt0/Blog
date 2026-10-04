import { ApiError, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { parseStatsParams } from "@/lib/claudeSessions/stats";
import { findRemoteStats } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The sessions dashboard's numbers (remote-claude.md §4.10). `?host=&tz=`;
 * `tz` is the viewer's IANA zone for days and hours, UTC when absent.
 */
export const GET = userRoute(async (request, { user }) => {
  refuseOffDesktop("Remote sessions");
  const parsed = parseStatsParams(new URL(request.url).searchParams);
  if (!parsed.ok) throw new ApiError(400, "Bad Request", parsed.error);
  if (parsed.value.hostId) await requireRemoteHost(parsed.value.hostId, user);
  return NextResponse.json({
    data: await findRemoteStats(user.id, parsed.value.hostId, parsed.value.tz),
  });
});
