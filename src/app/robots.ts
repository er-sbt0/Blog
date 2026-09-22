import { MetadataRoute } from "next";
import { isDesktopBuild, publicSiteUrl } from "@/lib/desktop";

// Generated rather than served from `public/robots.txt`, because the `Sitemap:`
// line has to name a real origin. The static file inherited from the upstream
// project hardcoded that project's domain, which this app is not deployed on,
// so the sitemap it advertised was never fetchable. Read `PUBLIC_URL` like
// `sitemap.ts` does, and omit the line entirely when it is unset.
//
// The desktop build's answer is the opposite one (desktop-app.md §5): nothing
// here is published, so nothing here should be crawled. `PUBLIC_URL` is set in
// that build — to the loopback origin the shell picked this launch, so the root
// layout's `metadataBase` resolves — which is exactly why "is it set" is the
// wrong question and `publicSiteUrl()` is asked instead.

export default function robots(): MetadataRoute.Robots {
  const site = publicSiteUrl();

  if (isDesktopBuild()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
