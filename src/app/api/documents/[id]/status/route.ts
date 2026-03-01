import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findUserPost, updatePost } from "@/repositories/post";
import { DocumentStatus } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    return NextResponse.json({
      message: "Status endpoint reached",
      id: params.id,
    });
  },
);

export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(401, "Unauthorized", "Please sign in");
    }

    const { user } = session;
    if (user.disabled) {
      throw new ApiError(
        403,
        "Account Disabled",
        "Account is disabled for violating terms of service",
      );
    }

    // Find the document
    const userPost = await findUserPost(params.id);
    if (!userPost) {
      throw new ApiError(404, "Document not found");
    }

    // Check if user can edit this document
    const isAuthor = user.id === userPost.author.id;
    const isCollab = userPost.collab;
    const canEdit = isAuthor || isCollab;

    if (!canEdit) {
      throw new ApiError(
        403,
        "Forbidden",
        "You are not authorized to edit this document",
      );
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    if (!status || !Object.values(DocumentStatus).includes(status)) {
      throw new ApiError(400, "Bad Request", "Invalid status value");
    }

    // Update the document status
    const updatedPost = await updatePost(params.id, {
      status,
    });

    if (!updatedPost) {
      throw new ApiError(
        500,
        "Internal Server Error",
        "Failed to update document",
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedPost.id,
        status: updatedPost.status,
      },
    });
  },
);
