import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  deleteCanvas,
  findCanvasById,
  updateCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes/canvas/[id] - Get a single canvas with its notes
export const GET = withApiHandler(async (_request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized", "Please sign in to access notes");
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const { id: canvasId } = await params;
  const canvas = await findCanvasById(canvasId);

  if (!canvas) {
    throw new ApiError(404, "Not Found", "Canvas not found");
  }

  if (canvas.authorId !== session.user.id) {
    throw new ApiError(
      403,
      "Forbidden",
      "You don't have permission to access this canvas",
    );
  }

  return NextResponse.json({ data: canvas });
}, { context: "Error fetching canvas" });

// PATCH /api/notes/canvas/[id] - Update canvas name
export const PATCH = withApiHandler(async (request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to update a canvas",
    );
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const { id: canvasId } = await params;
  const canvas = await findCanvasById(canvasId);

  if (!canvas) {
    throw new ApiError(404, "Not Found", "Canvas not found");
  }

  if (canvas.authorId !== session.user.id) {
    throw new ApiError(
      403,
      "Forbidden",
      "You don't have permission to update this canvas",
    );
  }

  const body = await request.json();
  const { name } = body;

  const updatedCanvas = await updateCanvas(canvasId, { name });
  return NextResponse.json({ data: updatedCanvas });
}, { context: "Error updating canvas" });

// DELETE /api/notes/canvas/[id] - Delete canvas
export const DELETE = withApiHandler(async (_request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to delete a canvas",
    );
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const { id: canvasId } = await params;
  const canvas = await findCanvasById(canvasId);

  if (!canvas) {
    throw new ApiError(404, "Not Found", "Canvas not found");
  }

  if (canvas.authorId !== session.user.id) {
    throw new ApiError(
      403,
      "Forbidden",
      "You don't have permission to delete this canvas",
    );
  }

  await deleteCanvas(canvasId);
  return NextResponse.json({ data: { success: true } });
}, { context: "Error deleting canvas" });
