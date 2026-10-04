/**
 * Where a URL the window tries to open or navigate to is allowed to go.
 *
 * docs/plans/remote-claude.md §4.7: a link in a transcript is authored by any
 * file Claude ever read, so it opens through the shell and never inside the
 * app window — and only an `http:` or `https:` one reaches the shell at all.
 * `shell.openExternal` hands its argument to `xdg-open`, which opens a
 * `file://` path with whatever the desktop associates with it, a `.desktop`
 * launcher included.
 *
 * The app is matched by **parsed origin**, not by string prefix: with
 * `startsWith`, `http://127.0.0.1:41234@evil.example/` (userinfo, then the
 * real host) and `http://127.0.0.1:412345/` both counted as the app.
 *
 * Import-free so a spec can pin it.
 *
 * @returns {"app" | "external" | "deny"}
 */
export function linkDisposition(url, origin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "deny";
  }
  if (parsed.origin === new URL(origin).origin) return "app";
  if (parsed.protocol === "http:" || parsed.protocol === "https:") return "external";
  return "deny";
}
