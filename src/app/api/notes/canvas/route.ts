import { authOptions } from "@/lib/auth";
import {
  createCanvas,
  findCanvasByAuthorId,
  getOrCreateDefaultCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes/canvas - Get all canvases for the user (auto-creates Default if none exist)
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

    // Ensure at least one canvas exists
    await getOrCreateDefaultCanvas(session.user.id);
    const canvases = await findCanvasByAuthorId(session.user.id);
    const summaries = canvases.map(({ id, name, createdAt, updatedAt }) => ({
      id,
      name,
      createdAt,
      updatedAt,
    }));
    return NextResponse.json({ data: summaries }, { status: 200 });
  } catch (error) {
    console.error("Error fetching canvases:", error);
    return NextResponse.json(
      {
        error: {
          title: "Server Error",
          subtitle: "Failed to fetch notes canvases",
        },
      },
      { status: 500 },
    );
  }
}

// POST /api/notes/canvas - Create new canvas
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to create a canvas",
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
    const { name = "My Notes" } = body;

    const canvas = await createCanvas(session.user.id, name);
    return NextResponse.json({ data: canvas }, { status: 201 });
  } catch (error) {
    console.error("Error creating canvas:", error);
    return NextResponse.json(
      { error: { title: "Server Error", subtitle: "Failed to create canvas" } },
      { status: 500 },
    );
  }
}
