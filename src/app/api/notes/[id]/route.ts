import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { deleteNote, findNoteById, updateNote } from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PATCH /api/notes/[id] - Update note
export const PATCH = withApiHandler(async (request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized", "Please sign in to update a note");
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
  } = body;

  const updates: Record<string, number | string | undefined> = {};
  if (typeof positionX === "number") updates.positionX = positionX;
  if (typeof positionY === "number") updates.positionY = positionY;
  if (typeof width === "number") updates.width = width;
  if (typeof height === "number") updates.height = height;
  if (title !== undefined) updates.title = title;
  if (typeof content === "string") updates.content = content;
  if (typeof color === "string") updates.color = color;
  if (typeof zIndex === "number") updates.zIndex = zIndex;

  const updatedNote = await updateNote(noteId, updates);
  return NextResponse.json({ data: updatedNote });
}, { context: "Error updating note" });

// DELETE /api/notes/[id] - Delete note
export const DELETE = withApiHandler(async (_request, { params }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Unauthorized", "Please sign in to delete a note");
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

  await deleteNote(noteId);
  return NextResponse.json({ data: { success: true } });
}, { context: "Error deleting note" });
