import { authOptions } from "@/lib/auth";
import {
  updateNote,
  deleteNote,
  findNoteById,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// PATCH /api/notes/[id] - Update note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: { title: "Unauthorized", subtitle: "Please sign in to update a note" } },
        { status: 401 }
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        { error: { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const noteId = id;
    const note = await findNoteById(noteId);

    if (!note) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Note not found" } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { positionX, positionY, width, height, title, content, color, zIndex } = body;

    const updates: any = {};
    if (typeof positionX === "number") updates.positionX = positionX;
    if (typeof positionY === "number") updates.positionY = positionY;
    if (typeof width === "number") updates.width = width;
    if (typeof height === "number") updates.height = height;
    if (title !== undefined) updates.title = title;
    if (typeof content === "string") updates.content = content;
    if (typeof color === "string") updates.color = color;
    if (typeof zIndex === "number") updates.zIndex = zIndex;

    const updatedNote = await updateNote(noteId, updates);
    return NextResponse.json({ data: updatedNote }, { status: 200 });
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to update note" } },
      { status: 500 }
    );
  }
}

// DELETE /api/notes/[id] - Delete note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: { title: "Unauthorized", subtitle: "Please sign in to delete a note" } },
        { status: 401 }
      );
    }

    if (session.user.disabled) {
      return NextResponse.json(
        { error: { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const noteId = id;
    const note = await findNoteById(noteId);

    if (!note) {
      return NextResponse.json(
        { error: { title: "Not Found", subtitle: "Note not found" } },
        { status: 404 }
      );
    }

    await deleteNote(noteId);
    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to delete note" } },
      { status: 500 }
    );
  }
}
