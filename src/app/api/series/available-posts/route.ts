import { authOptions } from "@/lib/auth";
import { getAvailablePostsForSeries } from "@/repositories/series";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/series/available-posts → get user's posts not in any series
export async function GET() {
  const response: { data?: any; error?: { title: string; subtitle?: string } } =
    {};

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to view available posts",
      };
      return NextResponse.json(response, { status: 401 });
    }

    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const posts = await getAvailablePostsForSeries(user.id);
    response.data = posts;
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.log(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
