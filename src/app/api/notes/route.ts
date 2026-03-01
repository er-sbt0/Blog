import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  createNote,
  findCanvasById,
  findNotesByCanvasId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes - Get all notes for user's default canvas
export const GET = withApiHandler(async () => {
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

  const canvas = await getOrCreateDefaultCanvas(session.user.id);
  const notes = await findNotesByCanvasId(canvas.id);
  return NextResponse.json({ data: notes });
}, { context: "Error fetching notes" });

// POST /api/notes - Create new note
export const POST = withApiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized", "Please sign in to create a note");
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const body = await request.json();
  const {
    positionX,
    positionY,
    width,
    height,
    title,
    content,
    color,
    zIndex,
    canvasId,
  } = body;

  // Validate required fields
  if (
    typeof positionX !== "number" ||
    typeof positionY !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof content !== "string"
  ) {
    throw new ApiError(
      400,
      "Invalid Input",
      "Missing or invalid required fields",
    );
  }

  // Resolve the target canvas
  let targetCanvasId: string;
  if (canvasId && typeof canvasId === "string") {
    const canvas = await findCanvasById(canvasId);
    if (!canvas) {
      throw new ApiError(404, "Not Found", "Canvas not found");
    }
    if (canvas.authorId !== session.user.id) {
      throw new ApiError(
        403,
        "Forbidden",
        "You don't have permission to add notes to this canvas",
      );
    }
    targetCanvasId = canvasId;
  } else {
    // Fall back to the user's default canvas
    const canvas = await getOrCreateDefaultCanvas(session.user.id);
    targetCanvasId = canvas.id;
  }

  const note = await createNote({
    canvasId: targetCanvasId,
    positionX,
    positionY,
    width,
    height,
    title,
    content,
    color,
    zIndex,
  });

  return NextResponse.json({ data: note }, { status: 201 });
}, { context: "Error creating note" });
