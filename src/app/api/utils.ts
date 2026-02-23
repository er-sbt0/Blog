import { getCachedRevision } from "@/repositories/revision";
import { unstable_cache } from "next/cache";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

const getRevisionHtml = async (id: string) => {
  try {
    const revision = await getCachedRevision(id);
    if (!revision) {
      return null;
    }

    const data = revision.data;

    try {
      const response = await fetch(`${PUBLIC_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!response.ok) {
        console.error(
          "Embed API returned error for HTML:",
          response.status,
          await response.text(),
        );
        return null;
      }

      const html = await response.text();
      return html;
    } catch (error: any) {
      // During build, the API might not be available
      // This is not a critical error during build time
      console.warn(
        "HTML fetch error (likely during build):",
        error.message || String(error),
      );
      return null;
    }
  } catch (error) {
    console.error("Error generating HTML:", error);
    return null;
  }
};

const findRevisionHtml = unstable_cache(getRevisionHtml, [], {
  tags: ["html"],
});

const getRevisionThumbnail = async (id: string) => {
  try {
    const revision = await getCachedRevision(id);
    if (!revision) {
      return null;
    }

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

    try {
      const response = await fetch(`${PUBLIC_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thumbnailData),
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!response.ok) {
        console.error(
          "Embed API returned error for thumbnail:",
          response.status,
          await response.text(),
        );
        return null;
      }

      const html = await response.text();
      return html;
    } catch (error: any) {
      // During build, the API might not be available
      // This is not a critical error during build time
      return null;
    }
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return null;
  }
};

const findRevisionThumbnail = unstable_cache(getRevisionThumbnail, [], {
  tags: ["thumbnail"],
});

export { findRevisionHtml, findRevisionThumbnail };
