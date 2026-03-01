import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  createCanvas,
  findCanvasByAuthorId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes/canvas - Get all canvases for the user (auto-creates Default if none exist)
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

  // Ensure at least one canvas exists
  await getOrCreateDefaultCanvas(session.user.id);
  const canvases = await findCanvasByAuthorId(session.user.id);
  const summaries = canvases.map(({ id, name, createdAt, updatedAt }) => ({
    id,
    name,
    createdAt,
    updatedAt,
  }));
  return NextResponse.json({ data: summaries });
}, { context: "Error fetching canvases" });

// POST /api/notes/canvas - Create new canvas
export const POST = withApiHandler(async (request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to create a canvas",
    );
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const body = await request.json();
  const { name = "My Notes" } = body;

  const canvas = await createCanvas(session.user.id, name);
  return NextResponse.json({ data: canvas }, { status: 201 });
}, { context: "Error creating canvas" });
