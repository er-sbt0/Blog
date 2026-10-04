import { refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { deleteRemoteHost } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = userRoute<{ id: string }>(async (_request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  return NextResponse.json({ data: await requireRemoteHost(params.id, user) });
});

/** Forget a host and every session mirrored from it (§4.8). Irreversible. */
export const DELETE = userRoute<{ id: string }>(async (_request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteHost(params.id, user);
  await deleteRemoteHost(params.id);
  return NextResponse.json({ data: { id: params.id } });
});
