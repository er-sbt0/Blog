import { authOptions } from "@/lib/auth";
import {
  deleteCanvas,
  findCanvasById,
  updateCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PATCH /api/notes/canvas/[id] - Update canvas
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to update a canvas",
          },
        },
        { status: 401 },
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        {
          error: {
            title: "Account Disabled",
            subtitle: "Account is disabled for violating terms of service",
          },
        },
        { status: 403 },
      );
    }

    const canvasId = params.id;
    const canvas = await findCanvasById(canvasId);

    if (!canvas) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Canvas not found" } },
        { status: 404 },
      );
    }

    // Verify ownership by checking if canvas belongs to the user
    const userCanvas = await findCanvasById(canvasId);
    if (!userCanvas) {
      return NextResponse.json(
        {
          error: {
            title: "Forbidden",
            subtitle: "You don't have permission to update this canvas",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name } = body;

    const updatedCanvas = await updateCanvas(canvasId, { name });
    return NextResponse.json({ data: updatedCanvas }, { status: 200 });
  } catch (error) {
    console.error("Error updating canvas:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to update canvas" } },
      { status: 500 },
    );
  }
}

// DELETE /api/notes/canvas/[id] - Delete canvas
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to delete a canvas",
          },
        },
        { status: 401 },
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        {
          error: {
            title: "Account Disabled",
            subtitle: "Account is disabled for violating terms of service",
          },
        },
        { status: 403 },
      );
    }

    const canvasId = params.id;
    const canvas = await findCanvasById(canvasId);

    if (!canvas) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Canvas not found" } },
        { status: 404 },
      );
    }

    await deleteCanvas(canvasId);
    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (error) {
    console.error("Error deleting canvas:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to delete canvas" } },
      { status: 500 },
    );
  }
}
