import { ApiError, parseBody, publicRoute } from "@/lib/api-utils";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";
import { editorStateSchema } from "../documents/schemas";

/**
 * Render editor state supplied in the request body to HTML.
 *
 * Public because the body *is* the input: this touches no stored data, reads no
 * session and returns a pure function of what the caller sent, so there is
 * nothing here to authorize against. `docs/reviews/code-review-2026-07.md` §3
 * ("Do not require a session on `/api/embed`") settled that; it is not reopened
 * by the note below.
 *
 * Its server-side callers are gone. `src/app/api/utils.ts` used to POST here
 * over loopback to render `/view` and `/embed` — the app fetching itself,
 * up to ~11 MB of JSON per cache miss — and now calls `generateServerHtml`
 * directly. What is left is the browser-side `apiClient.embed.render`, so the
 * route stays; the self-fetch is simply no longer a reason for anything.
 */
export const POST = publicRoute(
  async (request) => {
    // The body *is* the editor state here, so the schema carries the `root` check
    // this route was already making by hand.
    const body = await parseBody(request, editorStateSchema);

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
  { errorLabel: "Embed API error" },
);
