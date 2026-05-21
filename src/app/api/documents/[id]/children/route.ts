import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findDocumentChildren } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async (_request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(401, "Unauthorized", "Please sign in");
    }
    const children = await findDocumentChildren(params.id);
    return NextResponse.json({ data: children });
  },
);
