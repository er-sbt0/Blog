import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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

    const documentId = params.id;

    // Find documents (root-level, not child tabs) whose latest revision JSON
    // contains a reference to the target document id.
    const rows = await prisma.$queryRaw<{ id: string; name: string; handle: string | null }[]>`
      SELECT DISTINCT d.id, d.name, d.handle
      FROM "Revision" r
      JOIN "Document" d ON d.id = r."documentId"
      WHERE r.data::text LIKE ${"%" + documentId + "%"}
        AND d.id != ${documentId}::uuid
        AND d."parentId" IS NULL
      ORDER BY d.name
      LIMIT 20
    `;

    return NextResponse.json({ data: rows });
  },
);
