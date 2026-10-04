import { ApiError, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { parseSearchParams } from "@/lib/claudeSessions/search";
import { searchRemoteEntries } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Substring search over the caller's transcripts (remote-claude.md §4.9).
 * `?q=&host=&project=&kind=&thinking=1`; `kind` may repeat. A query under
 * three characters is refused rather than run as a sequential scan.
 */
export const GET = userRoute(async (request, { user }) => {
  refuseOffDesktop("Remote sessions");
  const parsed = parseSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) throw new ApiError(400, "Bad Request", parsed.error);
  if (parsed.value.hostId) await requireRemoteHost(parsed.value.hostId, user);
  return NextResponse.json({ data: await searchRemoteEntries(user.id, parsed.value) });
});
