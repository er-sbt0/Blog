import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface TimeUpdate {
  id: string;
  createdAt: Date | string;
}

interface UpdateTimesRequest {
  updates: TimeUpdate[];
}

/**
 * POST /api/posts/update-times
 * Update creation times for multiple posts
 * Only the author can update their posts' times
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        {
          error: {
            title: "Unauthorized",
            subtitle: "Please sign in to update posts",
          },
        },
        { status: 401 },
      );
    }

    const body: UpdateTimesRequest = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        {
          error: { title: "Invalid request", subtitle: "No updates provided" },
        },
        { status: 400 },
      );
    }

    const userId = session.user.id;

    // Verify all posts belong to the current user and update them
    const results = await Promise.all(
      updates.map(async (update) => {
        const post = await prisma.document.findUnique({
          where: { id: update.id },
          select: { id: true, authorId: true },
        });

        if (!post) {
          return { id: update.id, success: false, error: "Post not found" };
        }

        if (post.authorId !== userId) {
          return { id: update.id, success: false, error: "Not authorized" };
        }

        // Update the creation time
        await prisma.document.update({
          where: { id: update.id },
          data: {
            createdAt: new Date(update.createdAt),
          },
        });

        return { id: update.id, success: true };
      }),
    );

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `${failed.length} update(s) failed`,
          results,
        },
        { status: 207 }, // Multi-Status
      );
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updates.length} post(s)`,
      results,
    });
  } catch (error) {
    console.error("Failed to update post times:", error);
    return NextResponse.json(
      {
        error: {
          title: "Server error",
          subtitle: "Failed to update post times",
        },
      },
      { status: 500 },
    );
  }
}
