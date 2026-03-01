import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import {
  addPostToSeries,
  findSeriesById,
  removePostFromSeries,
} from "@/repositories/series";
import { findUserPost } from "@/repositories/post";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

// GET /api/series/[id]/posts → get posts in series (ordered by seriesOrder)
export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const series = await findSeriesById(params.id);
    if (!series) {
      throw new ApiError(404, "Series not found");
    }

    // Return posts in series ordered by seriesOrder
    return NextResponse.json({ data: series.posts });
  },
);

// POST /api/series/[id]/posts → add post to series
export const POST = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to add posts to series",
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

    // Check if user is the author of the series
    if (user.id !== series.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only add posts to your own series",
      );
    }

    const body = await request.json();
    const { postId, order } = body;

    if (!postId) {
      throw new ApiError(400, "Bad Request", "Post ID is required");
    }

    if (!validate(postId)) {
      throw new ApiError(400, "Bad Request", "Invalid post id");
    }

    // Check if post exists and user owns it
    const post = await findUserPost(postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    if (user.id !== post.author.id) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only add your own posts to series",
      );
    }

    // Add post to series with order
    await addPostToSeries(params.id, postId, order || 0);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({
      data: { seriesId: params.id, postId, order: order || 0 },
    });
  },
);

// DELETE /api/series/[id]/posts → remove post from series
export const DELETE = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid series id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to remove posts from series",
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

    // Check if user is the author of the series
    if (user.id !== series.authorId) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only remove posts from your own series",
      );
    }

    const body = await request.json();
    const { postId } = body;

    if (!postId) {
      throw new ApiError(400, "Bad Request", "Post ID is required");
    }

    if (!validate(postId)) {
      throw new ApiError(400, "Bad Request", "Invalid post id");
    }

    // Check if post exists and belongs to this series
    const post = await findUserPost(postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Remove post from series
    await removePostFromSeries(postId);

    // Revalidate all relevant paths
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);
    revalidatePath("/");

    return NextResponse.json({ data: { postId } });
  },
);
