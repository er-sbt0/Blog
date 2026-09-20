/**
 * What a menu item acts on, and what the file it writes is called.
 *
 * Phase 7 of docs/plans/desktop-app.md. Three small decisions, all of which
 * fail quietly when they are wrong — a PDF named after the wrong post, a save
 * dialog defaulting into a directory that does not exist, an "imported nothing"
 * reported as a success — so they are here, import-free, with a spec beside
 * them (`__tests__/fileTargets.test.ts`).
 */

/**
 * The post the window is currently showing, if it is showing one.
 *
 * Only `/edit/<id>` and `/view/<id>` name a single post. `/posts/<id>` looks
 * like it does and does not: that segment is a series or a project as often as
 * a post, and printing a container would either 404 or print something the user
 * did not ask for. `/new` has no id until the document has been created and
 * the router has replaced the URL, at which point it *is* `/edit/<id>`.
 *
 * The segment is checked rather than trusted. It goes into a URL this process
 * then loads in a window with the user's session cookie attached, so a value
 * carrying `/` or `..` would address a different route entirely — the same
 * class of mistake `resolveWithin` exists for on the server side. Handles are
 * allowed alongside uuids because `/edit/<handle>` is a real entry point.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function documentIdFromUrl(current, origin) {
  let url;
  try {
    url = new URL(current);
  } catch {
    return null;
  }
  if (origin && url.origin !== new URL(origin).origin) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const [route, id] = segments;
  if (route !== "edit" && route !== "view") return null;
  return SEGMENT.test(id) ? id : null;
}

/**
 * A filename from a post's title.
 *
 * Deliberately lossy: everything that is not a letter, digit or dash becomes a
 * dash, because the alternative is a name carrying a `/` (a directory that does
 * not exist), a leading `.` (hidden, and the user reports the export as having
 * done nothing) or a newline. The id is the fallback rather than "document",
 * so two untitled posts do not overwrite each other.
 */
export function pdfFileName(title, id) {
  const slug = String(title ?? "")
    // NFC, not NFKD: decomposing first splits "Ü" into a letter and a
    // combining mark, and the mark is not `\p{Letter}`, so the replace below
    // turns every accented character into a dash. A German title would come out
    // as `u-berblick`.
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return `${slug || String(id ?? "post")}.pdf`;
}

/** `blog-backup-2026-09-20.zip`. Date first so a directory of them sorts. */
export function backupFileName(now = new Date()) {
  const [date] = now.toISOString().split("T");
  return `blog-backup-${date}.zip`;
}

/**
 * What to tell the user after an import.
 *
 * Import is the one affordance here that *reports* rather than merely
 * succeeding: `/api/import` skips documents whose id or handle already exists,
 * and a restore that silently imported nothing because every id was already
 * present looks exactly like one that worked. So the counts are shown either
 * way, and anything skipped or errored is named rather than summarised away.
 */
export function describeImport(summary) {
  const imported = summary?.imported ?? { documents: 0, series: 0, assets: 0 };
  const skipped = summary?.skipped ?? { documents: [], series: [] };
  const errors = summary?.errors ?? [];
  const warnings = summary?.warnings ?? [];

  const total = (imported.documents ?? 0) + (imported.series ?? 0);
  const lines = [
    `Imported ${imported.documents ?? 0} post(s), ${imported.series ?? 0} series and ` +
      `${imported.assets ?? 0} asset(s).`,
  ];

  const skippedCount = (skipped.documents?.length ?? 0) + (skipped.series?.length ?? 0);
  if (skippedCount > 0) {
    lines.push(
      "",
      `${skippedCount} item(s) were already present and were left alone:`,
      ...[...(skipped.documents ?? []), ...(skipped.series ?? [])].slice(0, 20).map((id) => `  ${id}`),
    );
  }
  if (errors.length > 0) {
    lines.push("", `${errors.length} item(s) failed:`, ...errors.slice(0, 20).map((e) => `  ${e.id}: ${e.reason}`));
  }
  if (warnings.length > 0) lines.push("", ...warnings.slice(0, 20));

  return {
    // An import that added nothing is not a failure, but it is not the message
    // "Import complete" either — that reads as "your posts are here now".
    message: total === 0 ? "Nothing was imported" : "Import complete",
    detail: lines.join("\n"),
    ok: errors.length === 0,
  };
}
