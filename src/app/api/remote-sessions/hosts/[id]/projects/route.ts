import { ApiError, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { forgetRemoteProject } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Forget every session under one project directory of a host (§4.8).
 * `?dir=<project dir>` — a query parameter, because project directories start
 * with `-` and contain nothing a path segment would need, but are still
 * user-shaped data rather than a route.
 */
export const DELETE = userRoute<{ id: string }>(async (request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteHost(params.id, user);
  const dir = new URL(request.url).searchParams.get("dir") ?? "";
  if (!/^[A-Za-z0-9._-]{1,255}$/.test(dir) || dir.includes("..")) {
    throw new ApiError(400, "Bad Request", "dir must be a project directory name");
  }
  return NextResponse.json({ data: { forgotten: await forgetRemoteProject(params.id, dir) } });
});
