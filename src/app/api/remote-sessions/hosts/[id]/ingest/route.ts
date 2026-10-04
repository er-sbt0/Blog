import { ApiError, parseBody, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { ingestRanges } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * At most 8 MiB of transcript per request (docs/plans/remote-claude.md §4.3);
 * the main process batches to fit. Base64 is 4/3 of that, plus framing.
 */
const INGEST_MAX_BYTES = 8 * 1024 * 1024;
const BODY_MAX_BYTES = Math.ceil((INGEST_MAX_BYTES * 4) / 3) + 64 * 1024;

const ingestSchema = z
  .object({
    ranges: z
      .array(
        z
          .object({
            path: z.string().max(1024),
            from: z.number().int().nonnegative(),
            size: z.number().int().nonnegative(),
            mtime: z.number().int().nonnegative(),
            headHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
            data: z.string().base64(),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();

/** Step 2 of a sync: store fetched ranges. Answers with files to read again whole. */
export const POST = userRoute<{ id: string }>(async (request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteHost(params.id, user);

  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!(length <= BODY_MAX_BYTES)) {
    throw new ApiError(413, "Too large", `An ingest request carries at most ${INGEST_MAX_BYTES} bytes.`);
  }
  const { ranges } = await parseBody(request, ingestSchema);
  const decoded = ranges.map((r) => ({ ...r, data: Buffer.from(r.data, "base64") }));
  if (decoded.reduce((n, r) => n + r.data.length, 0) > INGEST_MAX_BYTES) {
    throw new ApiError(413, "Too large", `An ingest request carries at most ${INGEST_MAX_BYTES} bytes.`);
  }
  return NextResponse.json({ data: await ingestRanges(params.id, decoded) });
});
