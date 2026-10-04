import { parseBody, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { applyManifest } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// One line of the remote listing (docs/plans/remote-claude.md §4.3). Paths that
// fail `isValidRemotePath` are dropped by the diff rather than refused here, so
// one odd filename on the remote does not fail the whole sync.
const manifestSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            path: z.string().max(1024),
            size: z.number().int().nonnegative(),
            mtime: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(200_000),
  })
  .strict();

/** Step 1 of a sync: answers with the byte ranges the main process should read. */
export const POST = userRoute<{ id: string }>(async (request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteHost(params.id, user);
  const { files } = await parseBody(request, manifestSchema);
  return NextResponse.json({ data: { wanted: await applyManifest(params.id, files) } });
});
