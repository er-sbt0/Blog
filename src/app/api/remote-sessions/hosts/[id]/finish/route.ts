import { parseBody, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { requireRemoteHost } from "@/lib/access";
import { finishSync } from "@/repositories/remoteSessions";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `error` is ssh's stderr when the sync failed, shown verbatim (§4.7).
const finishSchema = z.object({ error: z.string().max(2000).nullable() }).strict();

/** Step 3 of a sync: derive what changed and record the outcome on the host. */
export const POST = userRoute<{ id: string }>(async (request, { params, user }) => {
  refuseOffDesktop("Remote sessions");
  await requireRemoteHost(params.id, user);
  const { error } = await parseBody(request, finishSchema);
  return NextResponse.json({ data: await finishSync(params.id, error) });
});
