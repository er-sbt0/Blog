/**
 * Client fetchers for `/api/remote-sessions/*` (docs/plans/remote-claude.md
 * §4.6, §4.7). Desktop-only routes: every one of them answers 404 on the web
 * build, so callers gate on `IS_DESKTOP_CLIENT` before reaching here.
 *
 * The same shape as `apiClient` in `./client.ts` — named methods, the `{ data }`
 * envelope unwrapped, `ApiClientError` thrown on anything else — kept in its
 * own module so a desktop-only surface does not grow the shared client.
 * `message` is the server's subtitle when it has one, verbatim: §4.7 shows
 * errors as the server (and ssh) worded them.
 */
import { ApiClientError } from "./client";
import type { ApiError } from "./types";
import type {
  RemoteEntriesPage,
  RemoteHostSummary,
  RemoteSearchResult,
  RemoteSessionDetail,
  RemoteSessionsTree,
  RemoteStats,
} from "@/lib/claudeSessions/types";
import {
  type SearchParams,
  searchQueryString,
} from "@/components/RemoteSessions/searchModel";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiClientError("Could not reach the server");
  }
  let body: { data?: T; error?: ApiError } | null = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body; fall through to the status.
  }
  if (!res.ok || body?.error || body === null) {
    const err = body?.error;
    const message = err?.subtitle || err?.title ||
      `Request failed with status ${res.status}`;
    throw new ApiClientError(message, res.status, err);
  }
  return body.data as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

const BASE = "/api/remote-sessions";

export const remoteSessionsApi = {
  hosts: {
    list: () => request<RemoteHostSummary[]>(`${BASE}/hosts`),
    create: (alias: string, label: string) =>
      request<RemoteHostSummary>(`${BASE}/hosts`, json("POST", { alias, label })),
    /** Forgets the host and every session under it. Irreversible. */
    forget: (hostId: string) =>
      request<{ id: string }>(`${BASE}/hosts/${encodeURIComponent(hostId)}`, {
        method: "DELETE",
      }),
    forgetProject: (hostId: string, projectDir: string) =>
      request<{ forgotten: number }>(
        `${BASE}/hosts/${encodeURIComponent(hostId)}/projects?dir=${
          encodeURIComponent(projectDir)
        }`,
        { method: "DELETE" },
      ),
  },
  sessions: {
    tree: () => request<RemoteSessionsTree>(`${BASE}/sessions`),
    get: (id: string) =>
      request<RemoteSessionDetail>(`${BASE}/sessions/${encodeURIComponent(id)}`),
    entries: (id: string, from: number, limit: number) =>
      request<RemoteEntriesPage>(
        `${BASE}/sessions/${encodeURIComponent(id)}/entries?from=${from}&limit=${limit}`,
      ),
    forget: (id: string) =>
      request<{ forgotten: number }>(`${BASE}/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  /**
   * Full-text search across every synced transcript (§4.9). A query under
   * `SEARCH_MIN_LENGTH` is a 400 whose message is the hint; callers gate on
   * `searchGate` first so that is not the usual path. `signal` lets a newer
   * query abandon an older one.
   */
  search: (params: SearchParams, signal?: AbortSignal) =>
    request<RemoteSearchResult>(`${BASE}/search?${searchQueryString(params)}`, { signal }),
  /** The dashboard's numbers (§4.10), days and hours in the viewer's zone. */
  stats: (hostId: string | null, signal?: AbortSignal) => {
    const p = new URLSearchParams({ tz: viewerTimeZone() });
    if (hostId) p.set("host", hostId);
    return request<RemoteStats>(`${BASE}/stats?${p.toString()}`, { signal });
  },
} as const;

/** The viewer's IANA zone, for bucketing days and hours; UTC if unknown. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The message to show for a thrown fetcher error. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong";
