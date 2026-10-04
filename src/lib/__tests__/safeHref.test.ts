import { safeExternalHref } from "@/lib/safeHref";

/**
 * docs/plans/remote-claude.md §2.4 / §4.7. A Markdown link's target is
 * authored by whoever wrote the text — for a remote transcript, any file Claude
 * read — and it lands in a renderer that holds the terminal bridge. Every
 * refusal below is a target that would otherwise have been a clickable `href`.
 */
describe("safeExternalHref", () => {
  it.each([
    ["javascript:alert(1)"],
    [" JaVaScRiPt:alert(1)"],
    ["java\tscript:alert(1)"],
    ["java\nscript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["//evil.com"],
    ["/relative"],
    ["relative/path"],
    ["#fragment"],
    ["mailto:someone@example.com"],
    ["file:///etc/passwd"],
    ["http://"],
    [""],
    ["   "],
  ])("refuses %j", (raw) => {
    expect(safeExternalHref(raw)).toBeNull();
  });

  it.each([
    ["https://x.y/", "https://x.y/"],
    ["http://x", "http://x/"],
    ["  HTTPS://Example.com/a?b=c  ", "https://example.com/a?b=c"],
  ])("allows %j", (raw, href) => {
    expect(safeExternalHref(raw)).toBe(href);
  });

  it("refuses a non-string without throwing", () => {
    expect(safeExternalHref(undefined as unknown as string)).toBeNull();
  });
});
