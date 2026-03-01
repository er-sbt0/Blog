import { authOptions } from "@/lib/auth";
import {
  bringNoteToFront,
  findCanvasById,
  findNoteById,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/notes/[id]/bring-to-front - Update z-index to bring note to front
export async function POST(
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
            subtitle: "Please sign in to reorder notes",
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

    const { id } = await params;
    const noteId = id;
    const note = await findNoteById(noteId);

    if (!note) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Note not found" } },
        { status: 404 },
      );
    }

    // Verify ownership through the note's canvas
    const canvas = await findCanvasById(note.canvasId);
    if (!canvas || canvas.authorId !== session.user.id) {
      return NextResponse.json(
        {
          error: {
            title: "Forbidden",
            subtitle: "You don't have permission to reorder this note",
          },
        },
        { status: 403 },
      );
    }

    const updatedNote = await bringNoteToFront(noteId, note.canvasId);
    return NextResponse.json({ data: updatedNote }, { status: 200 });
  } catch (error) {
    console.error("Error bringing note to front:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to reorder note" } },
      { status: 500 },
    );
  }
}
