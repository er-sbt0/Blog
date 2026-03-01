import { generateDocx } from "@/editor/utils/generateDocx";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { getCachedRevision } from "@/repositories/revision";

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const search = url.searchParams;
  const revisionId = search.get("v");
  if (!revisionId) {
    throw new ApiError(400, "Bad Request", "Missing revision id");
  }

  const revision = await getCachedRevision(revisionId);
  if (!revision) {
    throw new ApiError(404, "Something went wrong", "Revision not found");
  }
  const blob = await generateDocx(revision.data);
  return new Response(blob, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `inline; filename="${
        encodeURIComponent(revision.id)
      }.docx"`,
    },
  });
});
