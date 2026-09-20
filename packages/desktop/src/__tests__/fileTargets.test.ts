import { backupFileName, describeImport, documentIdFromUrl, pdfFileName } from "../fileTargets.js";

/**
 * What the menu acts on, and what it calls the file (phase 7).
 *
 * All three of these fail quietly rather than loudly, which is the reason they
 * are a module instead of three expressions at their call sites: a PDF named
 * after the wrong thing, a save dialog defaulting to a path that is not a path,
 * and — the one that matters most — an import that added nothing being reported
 * as an import that worked.
 */

const ORIGIN = "http://127.0.0.1:41234";

describe("documentIdFromUrl", () => {
  it("reads the post out of the two routes that name one", () => {
    expect(documentIdFromUrl(`${ORIGIN}/edit/abc-123`, ORIGIN)).toBe("abc-123");
    expect(documentIdFromUrl(`${ORIGIN}/view/abc-123`, ORIGIN)).toBe("abc-123");
  });

  it("keeps a handle, which is a real entry point for /edit", () => {
    expect(documentIdFromUrl(`${ORIGIN}/edit/my-first-post`, ORIGIN)).toBe("my-first-post");
  });

  it("ignores the query and hash", () => {
    expect(documentIdFromUrl(`${ORIGIN}/view/abc?v=rev-1#top`, ORIGIN)).toBe("abc");
  });

  /**
   * `/posts/<id>` looks like it names a post and does not: that segment is a
   * series or a project as often as a document, so printing it would either
   * 404 or print something nobody asked for.
   */
  it.each([
    `${ORIGIN}/`,
    `${ORIGIN}/posts/abc`,
    `${ORIGIN}/new`,
    `${ORIGIN}/dashboard`,
    `${ORIGIN}/edit`,
    `${ORIGIN}/edit/abc/extra`,
    `${ORIGIN}/series/abc`,
  ])("refuses %s", (url) => {
    expect(documentIdFromUrl(url, ORIGIN)).toBeNull();
  });

  it("refuses another origin, and anything that is not a URL", () => {
    expect(documentIdFromUrl("https://blog.example/view/abc", ORIGIN)).toBeNull();
    expect(documentIdFromUrl("not a url", ORIGIN)).toBeNull();
    expect(documentIdFromUrl("", ORIGIN)).toBeNull();
  });

  /**
   * The segment goes back into a URL this process loads in a window carrying
   * the user's session cookie. A value with a separator in it would address a
   * different route entirely — the same class of mistake `resolveWithin`
   * exists for on the server side, arriving from the other direction.
   */
  it("refuses a segment that is not one segment", () => {
    expect(documentIdFromUrl(`${ORIGIN}/view/..`, ORIGIN)).toBeNull();
    expect(documentIdFromUrl(`${ORIGIN}/view/%2e%2e%2f%2e%2e`, ORIGIN)).toBeNull();
    expect(documentIdFromUrl(`${ORIGIN}/view/a.b`, ORIGIN)).toBeNull();
    expect(documentIdFromUrl(`${ORIGIN}/view/-leading`, ORIGIN)).toBeNull();
    expect(documentIdFromUrl(`${ORIGIN}/view/${"x".repeat(200)}`, ORIGIN)).toBeNull();
  });
});

describe("pdfFileName", () => {
  it("slugifies the title", () => {
    expect(pdfFileName("Why Postgres Stays", "id-1")).toBe("why-postgres-stays.pdf");
  });

  it("keeps letters outside ASCII rather than dropping the whole name", () => {
    expect(pdfFileName("Überblick 2026", "id-1")).toBe("überblick-2026.pdf");
  });

  /**
   * Everything a filename must not contain, in one title: separators, a
   * leading dot (hidden, and the user reports the export as having done
   * nothing), a newline, and a NUL.
   */
  it("cannot produce a path, a hidden file or a control character", () => {
    const name = pdfFileName("../../etc/passwd\n.hidden\0", "id-1");
    expect(name).not.toMatch(/[/\\\n\0]/);
    expect(name.startsWith(".")).toBe(false);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("falls back to the id, not to a shared name two untitled posts would share", () => {
    expect(pdfFileName("", "id-1")).toBe("id-1.pdf");
    expect(pdfFileName("!!!", "id-2")).toBe("id-2.pdf");
    expect(pdfFileName(null, "id-3")).toBe("id-3.pdf");
  });

  it("bounds the length", () => {
    expect(pdfFileName("a ".repeat(400), "id-1").length).toBeLessThanOrEqual(85);
  });
});

describe("backupFileName", () => {
  it("puts the date first so a directory of them sorts", () => {
    expect(backupFileName(new Date("2026-09-20T22:15:00Z"))).toBe("blog-backup-2026-09-20.zip");
  });
});

describe("describeImport", () => {
  it("reports the counts", () => {
    const described = describeImport({
      imported: { documents: 3, series: 1, assets: 12 },
      skipped: { documents: [], series: [] },
      errors: [],
      warnings: [],
    });
    expect(described.message).toBe("Import complete");
    expect(described.detail).toContain("3 post(s), 1 series and 12 asset(s)");
    expect(described.ok).toBe(true);
  });

  /**
   * The failure this exists for. `/api/import` skips anything whose id or
   * handle already exists, so restoring a bundle into the account it came from
   * imports nothing and returns 200. "Import complete" would be a lie in the
   * only direction that matters.
   */
  it("does not call an import that added nothing complete", () => {
    const described = describeImport({
      imported: { documents: 0, series: 0, assets: 0 },
      skipped: { documents: ["doc-1", "doc-2"], series: ["series-1"] },
      errors: [],
      warnings: [],
    });
    expect(described.message).toBe("Nothing was imported");
    expect(described.detail).toContain("3 item(s) were already present");
    expect(described.detail).toContain("doc-1");
    // Still not an *error*: nothing went wrong, it just did nothing.
    expect(described.ok).toBe(true);
  });

  it("names what failed, and says so in the flag the dialog reads", () => {
    const described = describeImport({
      imported: { documents: 1, series: 0, assets: 0 },
      skipped: { documents: [], series: [] },
      errors: [{ id: "doc-9", reason: "unreadable revision" }],
      warnings: ["assets/blobs/abc was not in the bundle"],
    });
    expect(described.ok).toBe(false);
    expect(described.detail).toContain("doc-9: unreadable revision");
    expect(described.detail).toContain("assets/blobs/abc");
  });

  it("survives a response that is not the shape it expected", () => {
    expect(describeImport(undefined).message).toBe("Nothing was imported");
    expect(describeImport({}).detail).toContain("0 post(s)");
  });
});
