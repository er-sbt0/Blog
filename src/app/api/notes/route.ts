import { authOptions } from "@/lib/auth";
import {
  createNote,
  findCanvasById,
  findNotesByCanvasId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes - Get all notes for user's default canvas
export async function GET() {
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

    const canvas = await getOrCreateDefaultCanvas(session.user.id);
    const notes = await findNotesByCanvasId(canvas.id);
    return NextResponse.json({ data: notes }, { status: 200 });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to fetch notes" } },
      { status: 500 },
    );
  }
}

// POST /api/notes - Create new note
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to create a note",
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
      return NextResponse.json(
        {
          error: {
            title: "Invalid Input",
            subtitle: "Missing or invalid required fields",
          },
        },
        { status: 400 },
      );
    }

    // Resolve the target canvas
    let targetCanvasId: string;
    if (canvasId && typeof canvasId === "string") {
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
              subtitle: "You don't have permission to add notes to this canvas",
            },
          },
          { status: 403 },
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
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to create note" } },
      { status: 500 },
    );
  }
}
