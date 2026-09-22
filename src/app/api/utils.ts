import { getCachedRevision, isPendingProposal } from "@/repositories/revision";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";
import { unstable_cache } from "next/cache";

/**
 * What rendering a stored revision produced.
 *
 * Three outcomes, because `string | null` only had room for two and the two it
 * merged are the two a reader most needs told apart: "there is nothing here to
 * show" and "we had something and failed to render it". Both were `null`, so
 * `/view` and `/embed` could only ever pick one presentation and be wrong about
 * the other case — a failed render arriving as a blank post, or an intentionally
 * empty one arriving as "Something went wrong".
 */
export type RenderedRevision =
  /** Rendered. `html` may legitimately be empty for an empty document. */
  | { status: "ok"; html: string }
  /**
   * Nothing to render: no such revision row, or one that is still a pending
   * agent proposal. Not an error, and not the reader's problem.
   */
  | { status: "empty" }
  /** The content exists and rendering it failed. Deliberately never cached. */
  | { status: "error" };

/**
 * Render a revision's editor state to HTML — **in this process**.
 *
 * This used to `fetch` `${PUBLIC_URL}/api/embed` over loopback: serialize the
 * whole editor state to JSON (up to ~11 MB on the worst document,
 * docs/plans/blob-storage.md §3.1), POST it to this same server, and parse it
 * back, per cache miss — all to reach `generateServerHtml`, an ordinary
 * function two imports away. docs/reviews/code-review-2026-07.md §3 called for
 * exactly this call ("same process, no HTTP hop").
 *
 * `/api/embed` stays: it is a real route with its own client-side caller, and
 * the review's ruling that it must not require a session is unaffected — this
 * change removes the app's only reason to have needed that ruling.
 *
 * Returns `null` when there is no such revision, and **throws** when rendering
 * fails. The throw is the point: `unstable_cache` stores a resolved value only,
 * so a transient failure is retried on the next request rather than frozen into
 * the cache, which at this cache's lifetime (see below) would be a blank post
 * for a year.
 */
const getRevisionHtml = async (id: string) => {
  const revision = await getCachedRevision(id);
  if (!revision) return null;
  return await generateServerHtml(revision.data);
};

/**
 * No explicit `revalidate`, on purpose.
 *
 * The `fetch` this replaced carried `next: { revalidate: 3600 }`, but that was
 * the inner layer and it never bound: `unstable_cache` with no `revalidate`
 * keeps an entry for `CACHE_ONE_YEAR`, so on an outer hit nothing was refetched,
 * and on an outer miss the fetch's own entry was keyed by the exact revision
 * JSON — a stale hit was byte-identical input. Adding `revalidate: 3600` here
 * would therefore *change* behaviour rather than preserve it.
 *
 * A year is also the right answer: a revision row is immutable content
 * addressed by id, so its rendered HTML can only go stale when the renderer
 * changes, which is a deploy.
 *
 * Known wart, untouched here: `"html"` and `"thumbnail"` are **global** tags.
 * `/api/revalidate` with either one invalidates every post's cached render, not
 * one post's. Nothing else revalidates them, so today that is a blunt admin
 * button rather than a bug, but a per-document tag is what this wants.
 */
const cachedRevisionHtml = unstable_cache(getRevisionHtml, [], {
  tags: ["html"],
});

/**
 * The first three blocks of a revision, rendered — see `getRevisionHtml` for
 * why this is a direct call and why a render failure throws.
 */
const getRevisionThumbnail = async (id: string) => {
  const revision = await getCachedRevision(id);
  if (!revision) return null;

  // Make sure we have valid data
  if (
    !revision.data || !revision.data.root ||
    !Array.isArray(revision.data.root.children)
  ) {
    console.error("Invalid revision data structure for thumbnail:", id);
    return null;
  }

  // Take only the first 3 children to create a thumbnail
  const data = revision.data;
  const thumbnailData = {
    ...data,
    root: {
      ...data.root,
      children: data.root.children.slice(0, 3),
    },
  };

  return await generateServerHtml(thumbnailData);
};

const cachedRevisionThumbnail = unstable_cache(getRevisionThumbnail, [], {
  tags: ["thumbnail"],
});

/**
 * These two render a revision from an id alone, and `/embed/[id]` and
 * `/view/[id]` take that id straight from `?v=` — so a pending agent proposal
 * would otherwise be rendered to anyone, on a document they may only *read*
 * (docs/plans/archive/agent-gating.md §2.1). It is not the document until it is
 * approved, so it renders as nothing.
 *
 * The check is outside `unstable_cache` on purpose. Inside, the `empty` would be
 * cached against an id whose content becomes real the moment the proposal is
 * approved, and neither the `"html"` nor the `"thumbnail"` tag is ever
 * revalidated by anything but the generic `/api/revalidate` route.
 */
const findRevisionHtml = async (id: string): Promise<RenderedRevision> => {
  try {
    if (await isPendingProposal(id)) return { status: "empty" };
    const html = await cachedRevisionHtml(id);
    return html === null ? { status: "empty" } : { status: "ok", html };
  } catch (error) {
    // Reached only by a real failure now. The `catch` this replaced excused
    // itself as "the API might not be available during build", which was a
    // statement about an HTTP hop that no longer exists — a direct call has
    // nothing to be unavailable.
    console.error("Failed to render revision to HTML:", id, error);
    return { status: "error" };
  }
};

/**
 * A thumbnail stays `string | null`, because for this caller the distinction
 * does not pay for itself: a thumbnail is decoration on a card, its absence
 * already renders as a placeholder, and the promises are handed to a client
 * `ThumbnailProvider` that would have to grow a second state to say so. The
 * failure is logged rather than swallowed, which is the part that was missing —
 * the old inner `catch` discarded the error unread.
 */
const findRevisionThumbnail = async (id: string): Promise<string | null> => {
  try {
    if (await isPendingProposal(id)) return null;
    return await cachedRevisionThumbnail(id);
  } catch (error) {
    console.error("Failed to render revision thumbnail:", id, error);
    return null;
  }
};

export { findRevisionHtml, findRevisionThumbnail };
