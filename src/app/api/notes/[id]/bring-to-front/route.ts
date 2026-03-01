import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  bringNoteToFront,
  findCanvasById,
  findNoteById,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/notes/[id]/bring-to-front - Update z-index to bring note to front
export const POST = withApiHandler(async (_request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(
      401,
      "Unauthorized",
      "Please sign in to reorder notes",
    );
  }

  if (session.user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }

  const { id } = await params;
  const noteId = id;
  const note = await findNoteById(noteId);

  if (!note) {
    throw new ApiError(404, "Not Found", "Note not found");
  }

  // Verify ownership through the note's canvas
  const canvas = await findCanvasById(note.canvasId);
  if (!canvas || canvas.authorId !== session.user.id) {
    throw new ApiError(
      403,
      "Forbidden",
      "You don't have permission to reorder this note",
    );
  }

  const updatedNote = await bringNoteToFront(noteId, note.canvasId);
  return NextResponse.json({ data: updatedNote });
}, { context: "Error bringing note to front" });
