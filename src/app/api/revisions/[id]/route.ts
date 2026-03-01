import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import {
  deleteRevision,
  findRevisionAuthorId,
  getCachedRevision,
} from "@/repositories/revision";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const revision = await getCachedRevision(id);
  if (!revision) {
    throw new ApiError(404, "Document Revision not found");
  }
  return NextResponse.json({ data: revision });
});

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(
      401,
      "Unauthenticated",
      "Please sign in to delete this revision",
    );
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(
      403,
      "Account Disabled",
      "Account is disabled for violating terms of service",
    );
  }
  const authorId = await findRevisionAuthorId(id);
  if (user.id !== authorId) {
    throw new ApiError(
      403,
      "Unauthorized",
      "You are not authorized to delete this revision",
    );
  }
  const revision = await deleteRevision(id);
  return NextResponse.json({
    data: {
      id: revision.id,
      documentId: revision.documentId,
    },
  });
});
