import { ApiError, parseBody, refuseOffDesktop, userRoute } from "@/lib/api-utils";
import { SSH_HOST_RE } from "@/lib/claudeSessions/sync";
import { createRemoteHost, findRemoteHostsByUser } from "@/repositories/remoteSessions";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// docs/plans/remote-claude.md §4.2: the alias becomes an argv element in the
// main process, so it is validated here, where it is stored, and again there.
const hostCreateSchema = z
  .object({
    alias: z.string().regex(SSH_HOST_RE, "must be an ssh alias or user@host"),
    label: z.string().trim().min(1).max(100),
  })
  .strict();

export const GET = userRoute(async (_request, { user }) => {
  refuseOffDesktop("Remote sessions");
  return NextResponse.json({ data: await findRemoteHostsByUser(user.id) });
});

export const POST = userRoute(async (request, { user }) => {
  refuseOffDesktop("Remote sessions");
  const { alias, label } = await parseBody(request, hostCreateSchema);
  try {
    return NextResponse.json({ data: await createRemoteHost(user.id, alias, label) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Host already added", `${alias} is already in your hosts.`);
    }
    throw error;
  }
});
