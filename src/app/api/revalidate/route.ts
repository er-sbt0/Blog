import { ApiError, parseBody, refuseOnDesktop, userRoute } from "@/lib/api-utils";
import { UserRole } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

const revalidateSchema = z.object({
  path: z.string().optional(),
  tag: z.string().optional(),
}).strict();

/**
 * Invalidate a cached path or tag.
 *
 * **Not in the desktop build** (docs/plans/desktop-app.md §5). It is the CDN /
 * ISR half of running a public site, and locally it could only ever answer 403:
 * the one seeded desktop user is a `USER`, and there is no sign-in flow by
 * which anyone could become an `ADMIN`. A route that can only refuse is better
 * off saying it is not here.
 */
export const POST = userRoute(async (request, { user }) => {
  refuseOnDesktop("Cache revalidation");

  if (user.role !== UserRole.ADMIN) {
    throw new ApiError(
      403,
      "Unauthorized",
      "You are not authorized to revalidate cache",
    );
  }

  const { path, tag } = await parseBody(request, revalidateSchema);

  if (path) {
    revalidatePath(path);
    return Response.json({ revalidated: path, now: Date.now() });
  }

  if (tag) {
    revalidateTag(tag);
    return Response.json({ revalidated: tag, now: Date.now() });
  }

  return Response.json({
    revalidated: false,
    now: Date.now(),
    message: "Missing path or tag to revalidate",
  });
}, { signInMessage: "Please sign in to revalidate cache" });
