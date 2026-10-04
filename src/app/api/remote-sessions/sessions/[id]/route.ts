import { ApiError, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteSession } from "@/lib/access";
import { findRemoteSessionDetail, forgetRemoteSession } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The transcript header: metadata, stats, and subagent links (§4.7). */
export const GET = userRoute<{ id: string }>(async (_request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteSession(params.id, user);
  const detail = await findRemoteSessionDetail(params.id);
  if (!detail) throw new ApiError(404, "Session not found");
  return NextResponse.json({ data: detail });
});

/** Forget one session and its subagent runs (§4.8). Irreversible if gone from the remote. */
export const DELETE = userRoute<{ id: string }>(async (_request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteSession(params.id, user);
  return NextResponse.json({ data: { forgotten: await forgetRemoteSession(params.id) } });
});
