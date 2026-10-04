import { ApiError, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteSession } from "@/lib/access";
import { findRemoteEntries } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;

/**
 * One page of a transcript by position, so a long session is never sent whole
 * (§4.7). `?from=<idx>&limit=<n>`, defaults 0 and 500.
 */
export const GET = userRoute<{ id: string }>(async (request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteSession(params.id, user);
  const url = new URL(request.url);
  const from = Number(url.searchParams.get("from") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ApiError(400, "Bad Request", `from must be ≥ 0 and limit between 1 and ${MAX_LIMIT}`);
  }
  return NextResponse.json({ data: await findRemoteEntries(params.id, from, limit) });
});
