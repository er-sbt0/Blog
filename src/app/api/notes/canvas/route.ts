import { authOptions } from "@/lib/auth";
import {
  createCanvas,
  deleteCanvas,
  findCanvasByAuthorId,
  getOrCreateDefaultCanvas,
  updateCanvas,
} from "@/repositories/notes";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notes/canvas - Get user's default canvas (or create if not exists)
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
    return NextResponse.json({ data: canvas }, { status: 200 });
  } catch (error) {
    console.error("Error fetching canvas:", error);
    return NextResponse.json(
      {
        error: {
          title: "Server Error",
          subtitle: "Failed to fetch notes canvas",
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
