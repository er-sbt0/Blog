import { ApiError, withApiHandler } from "@/lib/api-utils";
import { NextResponse } from "next/server";
import { validateHandle } from "../utils";

export const GET = withApiHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle");
  if (!handle) {
    throw new ApiError(400, "Bad Request", "No user handle provided");
  }
  const validationError = await validateHandle(handle);
  if (validationError) {
    return NextResponse.json({ error: validationError });
  }
  return NextResponse.json({ data: true });
});
