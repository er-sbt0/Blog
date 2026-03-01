import { ApiError, withApiHandler } from "@/lib/api-utils";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";

export const POST = withApiHandler(
  async (request: Request) => {
    const body = await request.json().catch(() => {
      return null;
    });

    if (!body) {
      throw new ApiError(
        400,
        "Invalid request",
        "Request body is required and must be valid JSON",
      );
    }

    // Validate that the body contains editor state data
    if (!body.root) {
      throw new ApiError(
        400,
        "Invalid editor state",
        "Editor state must contain a root node",
      );
    }

    const html = await generateServerHtml(body);

    if (!html) {
      throw new ApiError(
        500,
        "Failed to generate HTML",
        "Generated HTML is empty",
      );
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
  { context: "Embed API error" },
);
