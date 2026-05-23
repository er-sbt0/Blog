import { NextRequest, NextResponse } from "next/server";

export function middleware(_request: NextRequest) {
  // You can add any middleware logic here, such as:
  // - Authentication checks
  // - Request/response manipulation
  // - Redirects
  // - Headers modification

  // For now, just return the request as-is to pass through
  return NextResponse.next();
}

// Optional: Configure middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
