import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { findDocument } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { findRevisionThumbnail } from "../../utils";

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const userDocument = await findDocument(id);
  if (!userDocument) {
    throw new ApiError(404, "Document not found");
  }
  const isPrivate = userDocument.private;
  if (isPrivate) {
    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "This document is private",
        "Please sign in to View it",
      );
    }
    if (session) {
      const { user } = session;
      if (user.disabled) {
        throw new ApiError(
          403,
          "Account Disabled",
          "Account is disabled for violating terms of service",
        );
      }
      const isAuthor = user.id === userDocument.author.id;
      const isCoauthor = userDocument.coauthors.some(
        (coauthor) => coauthor.id === user.id,
      );
      if (!isAuthor && !isCoauthor) {
        throw new ApiError(
          403,
          "This document is private",
          "You are not authorized to View this document",
        );
      }
    }
  }
  const thumbnail = userDocument.head
    ? await findRevisionThumbnail(userDocument.head)
    : null;
  return NextResponse.json({ data: thumbnail });
});
