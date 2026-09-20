import { findPublishedDocuments } from "@/repositories/document";
import { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/desktop";

/**
 * Rendered per request, not at build time.
 *
 * Two reasons, and the second is the one that bites in production:
 *
 * 1. **A prerendered sitemap is frozen.** Next statically generates this by
 *    default, which bakes the post list as it stood when the image was built.
 *    Every post published afterwards stays invisible to crawlers until the next
 *    redeploy — a silent SEO bug, since the file is still served and still
 *    looks right.
 * 2. **Building must not require a database.** This is the only prerendered
 *    page that queries Postgres, and it is what made `docker build` fail with
 *    `Environment variable not found: DATABASE_URL`. Keeping the image
 *    buildable without a live database is what lets it be built in CI, or on a
 *    laptop, and promoted between environments as one artifact.
 *
 * If crawler traffic ever makes the query worth caching, `revalidate` is the
 * knob — not a return to build-time generation.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Every entry below is an absolute URL built by concatenation, so there has
  // to be something to concatenate onto. The desktop build has no public
  // address at all (desktop-app.md §5) and a web deployment that forgot
  // `PUBLIC_URL` used to emit a sitemap of `undefined/view/…` — served, valid
  // XML, and pointing nowhere. An empty sitemap is the honest answer to both.
  const site = publicSiteUrl();
  if (!site) return [];

  // Published only. This used to call `findAllDocuments`, which filters on
  // neither `published` nor `private`, so every unpublished draft was being
  // advertised to crawlers.
  const allPosts = await findPublishedDocuments();
  const now = new Date().toISOString();
  return [
    {
      url: `${site}/`,
      lastModified: now,
    },
    {
      url: `${site}/new`,
      lastModified: now,
    },
    {
      url: `${site}/browse`,
      lastModified: now,
    },
    {
      url: `${site}/privacy`,
      lastModified: now,
    },
    ...allPosts.map((post) => ({
      url: `${site}/view/${post.handle || post.id}`,
      lastModified: post.updatedAt,
    })),
  ];
}
