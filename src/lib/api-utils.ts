import { NextResponse } from "next/server";

/**
 * Typed error class for API routes. Throw inside any `withApiHandler`-wrapped
 * handler to return a structured JSON error response with the given status code.
 *
 * @example
 * throw new ApiError(401, "Unauthorized", "Please sign in");
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly subtitle?: string;

  constructor(status: number, title: string, subtitle?: string) {
    super(subtitle ? `${title}: ${subtitle}` : title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.subtitle = subtitle;
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: { title: this.title, subtitle: this.subtitle } },
      { status: this.status },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler<C = any> = (
  request: Request,
  context: C,
) => Promise<Response | NextResponse>;

interface HandlerOptions {
  /** Label prepended to console.error output (e.g. "Error fetching notes") */
  context?: string;
}

/**
 * Wraps a Next.js App Router handler with consistent error handling.
 *
 * - `ApiError` instances produce a JSON response with the thrown status code.
 * - Any other error produces a generic 500 response.
 * - All errors are logged via `console.error`.
 *
 * @example
 * export const GET = withApiHandler(async (request) => {
 *   const session = await getServerSession(authOptions);
 *   if (!session) throw new ApiError(401, "Unauthorized", "Please sign in");
 *   const data = await fetchData();
 *   return NextResponse.json({ data });
 * });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withApiHandler<C = any>(
  handler: RouteHandler<C>,
  options?: HandlerOptions,
): RouteHandler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        // Only log unexpected server errors (5xx); 4xx are expected client errors
        if (error.status >= 500) {
          if (options?.context) {
            console.error(`${options.context}:`, error);
          } else {
            console.error(error);
          }
        }
        return error.toResponse();
      }

      // Unexpected error — always log
      if (options?.context) {
        console.error(`${options.context}:`, error);
      } else {
        console.error(error);
      }

      return NextResponse.json(
        {
          error: {
            title: "Something went wrong",
            subtitle: "Please try again later",
          },
        },
        { status: 500 },
      );
    }
  };
}
