import {
  isSessionUsable,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  secureCookies,
  sessionCookieName,
  sessionCookieSpec,
  sessionExpiry,
} from "../session.js";

/**
 * The desktop build's local sign-in (docs/plans/desktop-app.md §4.2, phase 3).
 *
 * Every assertion here is on a *silent* failure, which is the whole reason this
 * logic was pulled into an import-free module. Nothing in this area throws when
 * it is wrong: a mis-prefixed cookie is simply never sent, an expiry in the
 * wrong unit is a session that lapsed before it existed or one that outlives
 * its row, and a reused row that is about to expire signs someone out midway
 * through a sentence. All four look identical from the outside — a window
 * showing the guest experience, with a clean boot log above it.
 *
 * What is deliberately *not* here: that `establishLocalSession` writes a
 * `Session` row. That is a statement about Postgres, and a spec that mocked the
 * client would only restate the SQL.
 */

describe("sessionCookieName", () => {
  it("has no prefix on the loopback http origin the desktop actually serves", () => {
    expect(sessionCookieName("http://127.0.0.1:41234")).toBe(
      "next-auth.session-token",
    );
    expect(sessionCookieName("http://localhost:3000")).toBe(
      "next-auth.session-token",
    );
  });

  it("takes the __Secure- prefix on https, as NextAuth's own default does", () => {
    expect(sessionCookieName("https://blog.example.com")).toBe(
      "__Secure-next-auth.session-token",
    );
  });

  /**
   * The trap, and the reason this is derived rather than hardcoded.
   *
   * `next-auth/utils/parse-url.js` prepends `https://` to any value that does
   * not already start with `http`, so a scheme-less `NEXTAUTH_URL` makes the
   * *server* look for a `__Secure-` cookie while the app is served over http.
   * Chromium then refuses to send it and the window shows the signed-out
   * experience with nothing logged anywhere.
   */
  it("follows parse-url's https-by-default rule for a scheme-less URL", () => {
    expect(sessionCookieName("127.0.0.1:41234")).toBe(
      "__Secure-next-auth.session-token",
    );
    expect(secureCookies("127.0.0.1:41234")).toBe(true);
    expect(secureCookies(undefined)).toBe(true);
  });
});

describe("sessionExpiry", () => {
  it("is NextAuth's own maxAge, so the server's rolling refresh behaves normally", () => {
    const now = Date.UTC(2026, 8, 20, 12, 0, 0);
    expect(sessionExpiry(now).getTime()).toBe(
      now + SESSION_MAX_AGE_SECONDS * 1000,
    );
  });

  /**
   * `core/routes/session.js` renews a database session when
   * `expires - maxAge + updateAge <= now`. Mint with a max age the server does
   * not share and that comparison is nonsense in one direction or the other:
   * a refresh on every single request, or none ever.
   */
  it("mints a row the server will not consider due for renewal yet", () => {
    const now = Date.UTC(2026, 8, 20, 12, 0, 0);
    const expires = sessionExpiry(now).getTime();
    const dueAt = expires - SESSION_MAX_AGE_SECONDS * 1000 +
      SESSION_UPDATE_AGE_SECONDS * 1000;
    expect(dueAt).toBeGreaterThan(now);
  });
});

describe("sessionCookieSpec", () => {
  const expires = new Date("2026-10-20T12:00:00.000Z");

  it("hands Electron seconds, not milliseconds", () => {
    const spec = sessionCookieSpec({
      url: "http://127.0.0.1:41234",
      token: "a-token",
      expires,
    });
    expect(spec.expirationDate).toBe(expires.getTime() / 1000);
    // The one that would silently pass a `toBeGreaterThan` check: a
    // millisecond value is a cookie that expires in the year 57000.
    expect(spec.expirationDate).toBeLessThan(4e9);
  });

  it("is httpOnly and not secure on an http origin", () => {
    const spec = sessionCookieSpec({
      url: "http://127.0.0.1:41234",
      token: "a-token",
      expires,
    });
    // Chromium rejects a `secure` cookie set on an http origin outright, and
    // reports it as a generic set failure rather than as this.
    expect(spec.secure).toBe(false);
    expect(spec.httpOnly).toBe(true);
    expect(spec.sameSite).toBe("lax");
    expect(spec.path).toBe("/");
    expect(spec.name).toBe("next-auth.session-token");
  });

  it("keeps name and secure in step with each other", () => {
    const spec = sessionCookieSpec({
      url: "https://blog.example.com",
      token: "a-token",
      expires,
    });
    expect(spec.secure).toBe(true);
    expect(spec.name).toBe("__Secure-next-auth.session-token");
  });
});

describe("isSessionUsable", () => {
  const now = Date.UTC(2026, 8, 20, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;

  it("reuses a row with plenty of life left", () => {
    expect(
      isSessionUsable({ sessionToken: "t", expires: new Date(now + 20 * day) }, now),
    ).toBe(true);
  });

  it("refuses an expired row", () => {
    expect(
      isSessionUsable({ sessionToken: "t", expires: new Date(now - day) }, now),
    ).toBe(false);
  });

  /**
   * The refusal that matters. A row still technically valid but hours from
   * lapsing would come up signed in and sign itself out while someone was
   * typing; launch is the one moment at which replacing it costs nothing.
   */
  it("refuses a row inside the margin, even though it has not expired", () => {
    const row = { sessionToken: "t", expires: new Date(now + 6 * 60 * 60 * 1000) };
    expect(row.expires.getTime()).toBeGreaterThan(now);
    expect(isSessionUsable(row, now)).toBe(false);
  });

  it("refuses the row `SELECT … LIMIT 1` returns when there is none", () => {
    expect(isSessionUsable(undefined, now)).toBe(false);
    expect(isSessionUsable(null, now)).toBe(false);
  });

  it("refuses a row with no usable token or date rather than minting a cookie from it", () => {
    expect(isSessionUsable({ sessionToken: "", expires: new Date(now + 20 * day) }, now))
      .toBe(false);
    expect(isSessionUsable({ sessionToken: "t", expires: "not a date" }, now)).toBe(
      false,
    );
  });

  it("accepts the string form a driver may hand back", () => {
    expect(
      isSessionUsable(
        { sessionToken: "t", expires: new Date(now + 20 * day).toISOString() },
        now,
      ),
    ).toBe(true);
  });
});
