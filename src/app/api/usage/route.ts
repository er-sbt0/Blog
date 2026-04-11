import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { findCloudStorageUsageByAuthorId } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ data: [] });
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  const cloudStorageUsage = await findCloudStorageUsageByAuthorId(user.id);
  return NextResponse.json({ data: cloudStorageUsage });
});
