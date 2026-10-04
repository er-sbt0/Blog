/**
 * The one test a link target passes before it becomes an `href`.
 *
 * docs/plans/remote-claude.md §2.4 and §4.7. Text rendered as Markdown — a
 * Copilot reply, an assistant turn in a remote transcript — is authored by
 * something other than the reader, and in a transcript by any file Claude ever
 * read. A `javascript:` target there is script in a renderer that also holds
 * `window.desktop.terminal`, so the rule is an allow-list rather than a
 * deny-list: absolute `http:` and `https:`, and nothing else.
 *
 * Parsed with `new URL` and no base, so a relative or protocol-relative target
 * (`/x`, `//evil.com`) is a parse failure rather than a link into this origin,
 * and the WHATWG parser's own normalisation — case, leading spaces, and the
 * tabs and newlines it strips from inside a scheme (`java\tscript:`) — is what
 * decides the scheme, rather than a prefix test that would disagree with the
 * browser about it.
 *
 * Import-free, so the transcript renderer and `MarkdownText` share it and a
 * spec can pin it without mounting anything.
 *
 * Answers the normalised URL to put in `href`, or `null` when the target must
 * render as plain text.
 */
export function safeExternalHref(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}
