import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { getAvailablePostsForSeries } from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/series/available-posts → get user's posts not in any series
export const GET = withApiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to view available posts",
    );
  }

  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const posts = await getAvailablePostsForSeries(user.id);
  return NextResponse.json({ data: posts });
});
