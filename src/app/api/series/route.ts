import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  createSeries,
  findAllSeries,
  findSeriesByAuthorId,
} from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface SeriesCreateInput {
  title: string;
  description?: string;
}

export const GET = withApiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session) {
    // Return all public series for unauthenticated users
    const allSeries = await findAllSeries();
    return NextResponse.json({ data: allSeries });
  }

  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  // Return user's series
  const userSeries = await findSeriesByAuthorId(user.id);
  return NextResponse.json({ data: userSeries });
});

export const POST = withApiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(401, "Unauthorized", "Please sign in to create a series");
  }

  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const body = (await request.json()) as SeriesCreateInput;
  if (!body || !body.title) {
    throw new ApiError(400, "Bad Request", "Series title is required");
  }

  const seriesData = {
    id: uuidv4(),
    title: body.title,
    description: body.description,
    authorId: user.id,
  };

  const data = await createSeries(seriesData);

  // Revalidate series list page
  revalidatePath("/series");
  revalidatePath("/");

  return NextResponse.json({ data });
});
