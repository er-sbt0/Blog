import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findDocument } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getCachedRevision } from "@/repositories/revision";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const { searchParams } = new URL(request.url);
    const revisionId = searchParams.get("v");
    const cloudDocument = await findDocument(params.id, revisionId);
    if (!cloudDocument) {
      throw new ApiError(404, "Document not found");
    }
    const session = await getServerSession(authOptions);
    const isAuthor = session?.user &&
      session.user.id === cloudDocument.author.id;
    const isCoauthor = session?.user &&
      cloudDocument.coauthors.some(
        (coauthor) => coauthor.id === session.user.id,
      );
    if (
      !isAuthor &&
      !isCoauthor &&
      !cloudDocument.published &&
      !cloudDocument.collab
    ) {
      throw new ApiError(
        403,
        "This document is private",
        "You are not authorized to fork this document",
      );
    }
    if (!cloudDocument.head) {
      throw new ApiError(404, "Document not found");
    }
    const revision = await getCachedRevision(
      revisionId ?? cloudDocument.head,
    );
    if (!revision) {
      throw new ApiError(404, "Revision not found");
    }
    return NextResponse.json({
      data: {
        id: cloudDocument.id,
        cloud: cloudDocument,
        data: revision.data,
      },
    });
  },
);
