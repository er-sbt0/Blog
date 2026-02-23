import { authOptions } from "@/lib/auth";
import {
  createNote,
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
        { error: { title: "Unauthorized", subtitle: "Please sign in to access notes" } },
        { status: 401 }
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        { error: { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" } },
        { status: 403 }
      );
    }

    const canvas = await getOrCreateDefaultCanvas(session.user.id);
    const notes = await findNotesByCanvasId(canvas.id);
    return NextResponse.json({ data: notes }, { status: 200 });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to fetch notes" } },
      { status: 500 }
    );
  }
}

// POST /api/notes - Create new note
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: { title: "Unauthorized", subtitle: "Please sign in to create a note" } },
        { status: 401 }
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        { error: { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { positionX, positionY, width, height, title, content, color, zIndex } = body;

    // Validate required fields
    if (
      typeof positionX !== "number" ||
      typeof positionY !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      typeof content !== "string"
    ) {
      return NextResponse.json(
        { error: { title: "Invalid Input", subtitle: "Missing or invalid required fields" } },
        { status: 400 }
      );
    }

    // Get or create user's default canvas
    const canvas = await getOrCreateDefaultCanvas(session.user.id);

    const note = await createNote({
      canvasId: canvas.id,
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
      { status: 500 }
    );
  }
}
