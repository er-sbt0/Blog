import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { deleteUser, findUser, updateUser } from "@/repositories/user";
import { UserUpdateInput } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { validate } from "uuid";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../utils";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (
  request,
  props: { params: Promise<{ id: string }> },
) => {
  const params = await props.params;
  const user = await findUser(params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return NextResponse.json({
    data: {
      id: user.id,
      handle: user.handle,
      name: user.name,
      email: user.email,
      image: user.image,
    },
  });
});

export const PATCH = withApiHandler(async (
  request,
  props: { params: Promise<{ id: string }> },
) => {
  const params = await props.params;
  if (!validate(params.id)) {
    throw new ApiError(400, "Bad Request", "Invalid user id");
  }
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(401, "Unauthenticated", "Please sign in to update your profile");
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(403, "Account Disabled", "Account is disabled for violating terms of service");
  }
  if (user.id !== params.id) {
    throw new ApiError(403, "Unauthorized", "You are not authorized to update this profile");
  }
  const body: UserUpdateInput = await request.json();
  if (!body) {
    throw new ApiError(400, "Bad Request", "No update provided");
  }

  const input: Prisma.UserUncheckedUpdateInput = {};
  if (body.handle && body.handle !== user.handle) {
    input.handle = body.handle.toLowerCase();
    const validationError = await validateHandle(input.handle);
    if (validationError) {
      throw new ApiError(400, validationError.title, validationError.subtitle);
    }
  }

  const result = await updateUser(params.id, input);

  return NextResponse.json({
    data: {
      id: result.id,
      handle: result.handle,
      name: result.name,
      email: result.email,
      image: result.image,
    },
  });
});

export const DELETE = withApiHandler(async (
  request,
  props: { params: Promise<{ id: string }> },
) => {
  const params = await props.params;
  if (!validate(params.id)) {
    throw new ApiError(400, "Bad Request", "Invalid user id");
  }
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(401, "Unauthenticated", "Please sign in to delete this user");
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(403, "Account Disabled", "Account is disabled for violating terms of service");
  }
  if (user.role !== "admin") {
    throw new ApiError(403, "Unauthorized", "You are not authorized to delete this user");
  }
  await deleteUser(params.id);
  return NextResponse.json({ data: params.id });
});
