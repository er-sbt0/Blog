/**
 * The local session, as arithmetic.
 *
 * Phase 3 of docs/plans/desktop-app.md (§4.2). The desktop build signs its one
 * local user in by **minting a real NextAuth session row and setting the cookie
 * that names it** — the same pair an OAuth sign-in would have produced — rather
 * than by teaching `src/lib/auth.ts` a new way to authenticate. Everything
 * above the seam is therefore untouched: `authOptions` still has
 * `PrismaAdapter`, still resolves to the **database** session strategy, and
 * `getServerSession` still validates the cookie by reading `Session` and
 * running the `session` callback over the row it finds. `userRoute`,
 * `optionalUserRoute`, `context.user` and every rule in `src/lib/access.ts` see
 * exactly what they see on the VPS.
 *
 * The alternative — a Credentials provider gated on `DESKTOP=1` — is refused by
 * NextAuth itself: `core/lib/assert.js` returns `UnsupportedStrategy`
 * ("Signin in with credentials only supported if JWT strategy is enabled") when
 * an adapter is configured and credentials are the only provider, which is
 * precisely the desktop case. Taking it would mean forcing
 * `session.strategy = "jwt"` for this build alone, so the two builds would keep
 * sessions in two different places and the `session` callback would be handed a
 * `token` here and a `user` there. That is a divergence bought for nothing.
 *
 * Import-free on purpose — the rule `dragGeometry.ts` sets. Every decision here
 * is made before Electron or Postgres is involved, and each of them fails
 * *silently* when it is wrong: a mis-prefixed cookie is simply never sent, and
 * an expiry in the wrong unit is a session that has already lapsed or one that
 * never does. See `__tests__/session.test.ts`.
 */

/**
 * NextAuth v4's own defaults (`core/init.js`), restated rather than imported —
 * this module runs in the Electron main process, which has no `next-auth`.
 *
 * They must stay in step with what the server believes, because the server's
 * rolling refresh is computed from *its* numbers against *our* `expires`:
 * `session.js` renews the row once
 * `expires - maxAge + updateAge <= now`. Mint with a different max age and the
 * refresh either fires on every request or never fires at all.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * The cookie NextAuth will look for, given the `NEXTAUTH_URL` we hand the
 * server.
 *
 * `core/init.js` derives the prefix from
 * `useSecureCookies ?? url.base.startsWith("https://")`, and `url` comes from
 * `utils/parse-url.js` — which **prepends `https://` to anything that does not
 * already start with `http`**. So a `NEXTAUTH_URL` of `127.0.0.1:41234`, with
 * the scheme left off, produces a `__Secure-`-prefixed cookie that Chromium
 * will then refuse to send over the loopback http origin the app is actually
 * served from. The window would show the signed-out experience with nothing
 * logged anywhere. That is the whole reason this is a function and not a
 * constant.
 */
export function sessionCookieName(nextAuthUrl) {
  return `${secureCookies(nextAuthUrl) ? "__Secure-" : ""}next-auth.session-token`;
}

/** Mirror of `parse-url.js` + `init.js`, in one place so the test can name it. */
export function secureCookies(nextAuthUrl) {
  const url = nextAuthUrl && nextAuthUrl.startsWith("http")
    ? nextAuthUrl
    : `https://${nextAuthUrl ?? ""}`;
  return url.startsWith("https://");
}

/**
 * When a session minted now should lapse.
 *
 * A desktop session is re-minted on every launch (`main.js`), so this bound is
 * only reached by an app left running for 30 days without a single
 * authenticated request — the server's own rolling refresh moves it forward
 * after `updateAge`, and the workspace makes one within seconds of any use.
 * Chosen to equal NextAuth's `maxAge` so that refresh arithmetic behaves as it
 * does on the VPS rather than as a special case.
 */
export function sessionExpiry(nowMs, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  return new Date(nowMs + maxAgeSeconds * 1000);
}

/**
 * The cookie to hand `session.defaultSession.cookies.set()`.
 *
 * Three details are load-bearing and none of them announce themselves:
 *
 * - **`expirationDate` is in seconds**, not milliseconds. Electron passes it to
 *   Chromium's cookie store, and a millisecond value lands tens of thousands of
 *   years out — which works, until it does not match the row and the cookie
 *   outlives the session it names.
 * - **`httpOnly`** matches what NextAuth sets. Without it the session token is
 *   readable by any script the editor renders.
 * - **`secure` follows the scheme**, because Chromium rejects a `secure` cookie
 *   set on an http origin outright and reports it as a generic set failure.
 */
export function sessionCookieSpec({ url, token, expires }) {
  const secure = secureCookies(url);
  return {
    url,
    name: sessionCookieName(url),
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expirationDate: Math.floor(expires.getTime() / 1000),
  };
}

/**
 * Whether a `Session` row already in the database can be reused as-is.
 *
 * `margin` exists because a row that is technically still valid but about to
 * lapse is worse than no row: the app would come up signed in and sign itself
 * out while someone was typing. Anything inside the margin is re-minted at
 * launch, which is the moment it costs nothing.
 */
export function isSessionUsable(row, nowMs, marginMs = SESSION_UPDATE_AGE_SECONDS * 1000) {
  if (!row || typeof row.sessionToken !== "string" || row.sessionToken === "") {
    return false;
  }
  const expires = row.expires instanceof Date
    ? row.expires.getTime()
    : Date.parse(row.expires);
  if (Number.isNaN(expires)) return false;
  return expires - marginMs > nowMs;
}
