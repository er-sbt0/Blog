import { authOptions } from "@/lib/auth";
import {
  deleteCanvas,
  findCanvasById,
  updateCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes/canvas/[id] - Get a single canvas with its notes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to access notes",
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

    const { id: canvasId } = await params;
    const canvas = await findCanvasById(canvasId);

    if (!canvas) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Canvas not found" } },
        { status: 404 },
      );
    }

    if (canvas.authorId !== session.user.id) {
      return NextResponse.json(
        {
          error: {
            title: "Forbidden",
            subtitle: "You don't have permission to access this canvas",
          },
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ data: canvas }, { status: 200 });
  } catch (error) {
    console.error("Error fetching canvas:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to fetch canvas" } },
      { status: 500 },
    );
  }
}

// PATCH /api/notes/canvas/[id] - Update canvas name
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id: canvasId } = await params;
    const canvas = await findCanvasById(canvasId);

    if (!canvas) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Canvas not found" } },
        { status: 404 },
      );
    }

    if (canvas.authorId !== session.user.id) {
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id: canvasId } = await params;
    const canvas = await findCanvasById(canvasId);

    if (!canvas) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Canvas not found" } },
        { status: 404 },
      );
    }

    if (canvas.authorId !== session.user.id) {
      return NextResponse.json(
        {
          error: {
            title: "Forbidden",
            subtitle: "You don't have permission to delete this canvas",
          },
        },
        { status: 403 },
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
