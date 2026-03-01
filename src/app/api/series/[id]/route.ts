import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  deleteSeries,
  findSeriesById,
  updateSeries,
} from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

interface SeriesUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    return NextResponse.json({ data: series });
  },
);

export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to update the series",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    const isAuthor = user.id === series.authorId;
    if (!isAuthor) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You are not authorized to update this series",
      );
    }

    const body = (await request.json()) as SeriesUpdateInput;
    if (!body) {
      throw new ApiError(400, "Bad Request", "No series data provided");
    }

    const data = await updateSeries(params.id, body);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data });
  },
);

export const DELETE = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to delete the series",
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

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    const isAuthor = user.id === series.authorId;
    if (!isAuthor) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You are not authorized to delete this series",
      );
    }

    await deleteSeries(params.id);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data: params.id });
  },
);
